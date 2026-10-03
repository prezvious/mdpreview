import { dom } from './dom.js';
import { STORAGE_KEYS } from './constants.js';
import { getStorageItem, setStorageItem } from './storage.js';
import { ariaShortcut, formatShortcut, hasShortcutModifier } from './utils.js';
import { applyEditorText } from './editor-edit.js';

const { editor, completionBtn, completionMenu, completionOptions, autoCompletionToggle } = dom;
const headingListeners = new Set();
let worker = null;
let source = '';
let revision = 0;
let requestId = 0;
let pendingCompletion = null;
let active = null;
let selectedIndex = 0;
let autoEnabled = true;
let accepting = false;
let lastSelection = [0, 0];
let mirror = null;

export function onSourceHeadings(listener) {
  headingListeners.add(listener);
  return () => headingListeners.delete(listener);
}

function syncSource() {
  const next = editor.value;
  if (next === source) return;
  closeCompletions();
  let from = 0;
  while (from < source.length && from < next.length && source[from] === next[from]) from++;
  let oldEnd = source.length;
  let newEnd = next.length;
  while (oldEnd > from && newEnd > from && source[oldEnd - 1] === next[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  if (worker)
    worker.postMessage({
      type: 'change',
      revision: ++revision,
      from,
      to: oldEnd,
      insert: next.slice(from, newEnd),
    });
  source = next;
}

function closeCompletions() {
  requestId++;
  pendingCompletion = null;
  active = null;
  completionMenu.hidden = true;
  editor.setAttribute('aria-expanded', 'false');
  editor.removeAttribute('aria-activedescendant');
}

function setSelected(index) {
  if (!active) return;
  selectedIndex = (index + active.items.length) % active.items.length;
  completionOptions.querySelectorAll('[role="option"]').forEach((option, i) => {
    option.setAttribute('aria-selected', String(i === selectedIndex));
  });
  const selected = completionOptions.children[selectedIndex];
  editor.setAttribute('aria-activedescendant', selected.id);
  selected.scrollIntoView({ block: 'nearest' });
}

function caretRect(position) {
  if (!mirror) {
    mirror = document.createElement('div');
    mirror.className = 'completion-caret-mirror';
    document.body.appendChild(mirror);
  }
  const style = getComputedStyle(editor);
  for (const property of [
    'font',
    'fontSize',
    'fontFamily',
    'fontWeight',
    'letterSpacing',
    'lineHeight',
    'padding',
    'border',
    'boxSizing',
    'tabSize',
    'textIndent',
    'wordSpacing',
  ]) {
    mirror.style[property] = style[property];
  }
  mirror.style.width = `${editor.offsetWidth}px`;
  mirror.style.height = `${editor.offsetHeight}px`;
  mirror.textContent = editor.value.slice(0, position);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  // Keep the rest of the document so scrolling is not clamped at a middle caret.
  mirror.append(marker, document.createTextNode(editor.value.slice(position)));
  mirror.scrollTop = editor.scrollTop;
  mirror.scrollLeft = editor.scrollLeft;
  const offset = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const editorRect = editor.getBoundingClientRect();
  return {
    left: editorRect.left + offset.left - mirrorRect.left,
    top: editorRect.top + offset.top - mirrorRect.top,
    bottom: editorRect.top + offset.bottom - mirrorRect.top,
  };
}

function positionMenu() {
  if (!active || completionMenu.hidden) return;
  const caret = caretRect(editor.selectionStart);
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const right = left + (viewport?.width ?? window.innerWidth);
  const bottom = top + (viewport?.height ?? window.innerHeight);
  const gap = 8;
  const width = Math.min(320, right - left - gap * 2);
  const below = bottom - caret.bottom - gap * 2;
  const above = caret.top - top - gap * 2;
  const openAbove = below < 150 && above > below;
  completionMenu.style.width = `${Math.max(120, width)}px`;
  completionMenu.style.maxHeight = `${Math.max(80, Math.min(300, openAbove ? above : below))}px`;
  const height = completionMenu.offsetHeight;
  completionMenu.style.left = `${Math.max(left + gap, Math.min(caret.left, right - width - gap))}px`;
  completionMenu.style.top = `${Math.max(top + gap, Math.min(openAbove ? caret.top - height - gap : caret.bottom + gap, bottom - height - gap))}px`;
}

function renderCompletions(result) {
  if (!result?.items?.length) return closeCompletions();
  active = { ...result, source, selection: pendingCompletion.selection };
  pendingCompletion = null;
  selectedIndex = 0;
  completionOptions.replaceChildren();
  result.items.forEach((item, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.id = `completionOption${index}`;
    option.className = 'completion-option';
    option.setAttribute('role', 'option');
    option.tabIndex = -1;
    const label = document.createElement('strong');
    label.textContent = item.label;
    const detail = document.createElement('span');
    detail.textContent = item.detail;
    option.append(label, detail);
    option.addEventListener('pointerdown', (event) => event.preventDefault());
    option.addEventListener('click', () => acceptCompletion(index));
    completionOptions.appendChild(option);
  });
  completionMenu.hidden = false;
  editor.setAttribute('aria-expanded', 'true');
  setSelected(0);
  requestAnimationFrame(positionMenu);
}

function onWorkerMessage({ data }) {
  if (data.type === 'resync') {
    worker.postMessage({ type: 'init', source, revision });
    return;
  }
  if (data.revision !== revision) return;
  if (data.type === 'headings') {
    headingListeners.forEach((listener) => listener(data.headings, source));
  } else if (data.type === 'completion' && data.requestId === requestId) {
    if (
      !pendingCompletion ||
      editor.value !== source ||
      editor.selectionStart !== pendingCompletion.selection[0] ||
      editor.selectionEnd !== pendingCompletion.selection[1]
    )
      return closeCompletions();
    renderCompletions(data.result);
  } else if (data.type === 'error' && data.requestId === requestId) {
    closeCompletions();
    console.warn('Completion unavailable:', data.message);
  }
}

function showCompletions(explicit = false) {
  if (!worker) return;
  syncSource();
  requestId++;
  pendingCompletion = { selection: [editor.selectionStart, editor.selectionEnd] };
  worker.postMessage({
    type: 'complete',
    revision,
    requestId,
    position: editor.selectionEnd,
    selectionStart: editor.selectionStart,
    selectionEnd: editor.selectionEnd,
    explicit,
  });
}

async function acceptCompletion(index) {
  if (!active || editor.value !== active.source) return closeCompletions();
  const { from, to, items } = active;
  if (editor.selectionStart !== active.selection[0] || editor.selectionEnd !== active.selection[1])
    return closeCompletions();
  const item = items[index];
  const next = editor.value.slice(0, from) + item.insert + editor.value.slice(to);
  const selectionStart = from + (item.selection?.[0] ?? item.cursor ?? item.insert.length);
  const selectionEnd = from + (item.selection?.[1] ?? item.cursor ?? item.insert.length);
  closeCompletions();
  accepting = true;
  try {
    await applyEditorText(next, { selectionStart, selectionEnd, reason: 'Before completion' });
  } finally {
    accepting = false;
  }
}

function updateAutoToggle() {
  if (!autoCompletionToggle) return;
  autoCompletionToggle.classList.toggle('active', autoEnabled);
  autoCompletionToggle.setAttribute('aria-pressed', String(autoEnabled));
  autoCompletionToggle.title = `Automatic suggestions (${autoEnabled ? 'on' : 'off'})`;
  autoCompletionToggle.setAttribute('data-tooltip', autoCompletionToggle.title);
}

export function isAutomaticSuggestionsEnabled() {
  return autoEnabled;
}

export function setAutomaticSuggestionsEnabled(enabled) {
  if (autoEnabled === Boolean(enabled)) return true;
  autoEnabled = Boolean(enabled);
  const saved = setStorageItem(STORAGE_KEYS.AUTO_COMPLETION_ENABLED, String(autoEnabled));
  updateAutoToggle();
  if (!autoEnabled) closeCompletions();
  return saved;
}

export function initCompletion() {
  source = editor.value;
  autoEnabled = getStorageItem(STORAGE_KEYS.AUTO_COMPLETION_ENABLED) !== 'false';
  updateAutoToggle();
  autoCompletionToggle?.addEventListener('click', () => {
    setAutomaticSuggestionsEnabled(!autoEnabled);
  });
  completionBtn?.setAttribute('title', `Complete (${formatShortcut('Space')})`);
  completionBtn?.setAttribute('aria-keyshortcuts', ariaShortcut('Space'));
  try {
    worker = new Worker(new URL('./completion-worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', onWorkerMessage);
    worker.addEventListener('error', (error) => {
      console.warn('Completion worker failed:', error.message);
      worker?.terminate();
      worker = null;
      closeCompletions();
    });
    worker.postMessage({ type: 'init', source, revision });
  } catch (error) {
    console.warn('Completion worker unavailable:', error);
  }
  const updateSelection = () => {
    lastSelection = [editor.selectionStart, editor.selectionEnd];
    const selection = pendingCompletion?.selection ?? active?.selection;
    if (selection && lastSelection.some((position, index) => position !== selection[index]))
      closeCompletions();
  };
  editor.addEventListener('select', updateSelection);
  document.addEventListener('selectionchange', updateSelection);
  completionBtn?.addEventListener('pointerdown', () => {
    lastSelection = [editor.selectionStart, editor.selectionEnd];
  });
  completionBtn?.addEventListener('click', () => {
    editor.focus();
    editor.setSelectionRange(...lastSelection);
    showCompletions(true);
  });
  editor.addEventListener('input', (event) => {
    syncSource();
    lastSelection = [editor.selectionStart, editor.selectionEnd];
    if (event.isComposing || accepting || !autoEnabled) return;
    showCompletions();
  });
  editor.addEventListener('compositionstart', closeCompletions);
  editor.addEventListener('blur', closeCompletions);
  editor.addEventListener('click', closeCompletions);
  editor.addEventListener('scroll', () => {
    if (active) requestAnimationFrame(positionMenu);
  });
  editor.addEventListener('keydown', (event) => {
    if (event.key === ' ' && hasShortcutModifier(event) && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      showCompletions(true);
      return;
    }
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape' && (active || pendingCompletion)) event.preventDefault();
      closeCompletions();
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
      closeCompletions();
      return;
    }
    if (!active) {
      if (['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) closeCompletions();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected(selectedIndex + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      acceptCompletion(selectedIndex);
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (
      !completionMenu.contains(event.target) &&
      event.target !== editor &&
      event.target !== completionBtn
    )
      closeCompletions();
  });
  window.visualViewport?.addEventListener('resize', () => requestAnimationFrame(positionMenu));
  window.visualViewport?.addEventListener('scroll', () => requestAnimationFrame(positionMenu));
  window.addEventListener('resize', () => requestAnimationFrame(positionMenu));
}
