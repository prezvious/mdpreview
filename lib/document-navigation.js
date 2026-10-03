import { dom } from './dom.js';
import { splitFrontmatter } from './frontmatter.js';
import { debounce } from './utils.js';
import { captureSnapshot } from './content.js';
import { showToast } from './preview.js';
import { isMobile, pauseScrollSyncForNavigation, setMobileView } from './layout.js';
import { onSourceHeadings } from './completion.js';
import { applyEditorText } from './editor-edit.js';
import { getEditorLineTop } from './gutter.js';

const {
  editor,
  preview,
  outlineBtn,
  documentOutline,
  outlineList,
  findBtn,
  documentFind,
  findQuery,
  findCount,
  findPreviousBtn,
  findNextBtn,
  replaceQuery,
  replaceOneBtn,
  replaceAllBtn,
} = dom;

let headings = [];
let indexedHeadings = null;
let currentMatch = null;

/** Collect source headings while ignoring frontmatter and fenced code. */
export function extractHeadings(source) {
  const lines = source.split('\n');
  const bodyStart = splitFrontmatter(source)?.lineCount ?? 0;
  const result = [];
  let offset = 0;
  let fence = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineOffset = offset;
    offset += line.length + 1;
    if (i < bodyStart) continue;

    if (fence) {
      const close = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }

    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (open) {
      fence = { char: open[1][0], length: open[1].length };
      continue;
    }

    const atx = /^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$/.exec(line);
    if (atx) {
      const text = atx[2].replace(/[ \t]+#+[ \t]*$/, '').trim();
      result.push({
        level: atx[1].length,
        text: text || '(untitled heading)',
        line: i + 1,
        offset: lineOffset,
      });
      continue;
    }

    const underline = /^ {0,3}(=+|-+)[ \t]*$/.exec(lines[i + 1] ?? '');
    if (line.trim() && !/^ {4}|^\t|^>|^[-*+]\s|^\d+[.)]\s/.test(line) && underline) {
      result.push({
        level: underline[1][0] === '=' ? 1 : 2,
        text: line.trim(),
        line: i + 1,
        offset: lineOffset,
      });
      i++;
      offset += lines[i].length + 1;
    }
  }
  return result;
}

function renderOutline() {
  if (!outlineList) return;
  headings =
    indexedHeadings?.source === editor.value
      ? indexedHeadings.headings.filter((heading) => !heading.nested)
      : extractHeadings(editor.value);
  outlineList.replaceChildren();
  if (headings.length === 0) {
    const item = document.createElement('li');
    item.textContent = 'No headings in this document.';
    outlineList.appendChild(item);
    return;
  }
  headings.forEach((heading, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.headingIndex = String(index);
    button.style.paddingLeft = `${0.4 + (heading.level - 1) * 0.8}rem`;
    button.textContent = `${heading.text} · L${heading.line}`;
    item.appendChild(button);
    outlineList.appendChild(item);
  });
}

const debounceOutline = debounce(renderOutline, 150);

function revealHeading(index) {
  const heading = headings[index];
  if (!heading) return;
  const mobile = isMobile();
  pauseScrollSyncForNavigation();
  if (mobile) setMobileView('editor');
  editor.focus();
  editor.setSelectionRange(heading.offset, heading.offset);
  editor.scrollTop = Math.max(0, getEditorLineTop(heading.line) - editor.clientHeight / 4);
  if (!mobile) {
    const previewHeadings = [...preview.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(
      (element) => !element.closest('blockquote, li')
    );
    const target = previewHeadings[index];
    if (target && Number(target.tagName[1]) === heading.level) {
      preview.scrollTop += target.getBoundingClientRect().top - preview.getBoundingClientRect().top;
    }
  }
}

function setPanelOpen(button, panel, open) {
  panel.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
}

function searchPattern(query) {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
}

function countMatches() {
  const query = findQuery.value;
  if (!query) {
    findCount.textContent = '0 matches';
    return;
  }
  let count = 0;
  const pattern = searchPattern(query);
  while (pattern.exec(editor.value)) {
    count++;
    if (count === 100000) break;
  }
  findCount.textContent = `${count === 100000 ? '100,000+' : count} ${count === 1 ? 'match' : 'matches'}`;
}

const debouncedCountMatches = debounce(countMatches, 100);

function selectMatch(start, length) {
  if (start < 0) {
    currentMatch = null;
    return false;
  }
  currentMatch = { start, end: start + length };
  if (isMobile()) setMobileView('editor');
  editor.focus();
  editor.setSelectionRange(currentMatch.start, currentMatch.end);
  return true;
}

function findMatch(direction) {
  const query = findQuery.value;
  if (!query) return false;
  const pattern = searchPattern(query);
  const source = editor.value;
  if (direction === 'previous') {
    const before = currentMatch?.start ?? editor.selectionStart;
    let previous = null;
    let last = null;
    for (const match of source.matchAll(pattern)) {
      last = match;
      if (match.index < before) previous = match;
    }
    const match = previous ?? last;
    return selectMatch(match?.index ?? -1, match?.[0].length ?? 0);
  }
  const after = currentMatch?.end ?? editor.selectionEnd;
  pattern.lastIndex = after;
  let match = pattern.exec(source);
  if (!match) {
    pattern.lastIndex = 0;
    match = pattern.exec(source);
  }
  return selectMatch(match?.index ?? -1, match?.[0].length ?? 0);
}

async function replaceCurrent() {
  const query = findQuery.value;
  if (!query) return;
  if (
    !currentMatch ||
    editor.selectionStart !== currentMatch.start ||
    editor.selectionEnd !== currentMatch.end ||
    !new RegExp(`^${searchPattern(query).source}$`, 'i').test(
      editor.value.slice(currentMatch.start, currentMatch.end)
    )
  ) {
    if (!findMatch('next')) return;
  }
  const match = currentMatch;
  const before = editor.value;
  const replacement = replaceQuery.value;
  const next = before.slice(0, match.start) + replacement + before.slice(match.end);
  if (next !== before) {
    const applied = await applyEditorText(next, {
      selectionStart: match.start + replacement.length,
      reason: 'Before replacing text',
    });
    if (!applied) return;
  }
  currentMatch = null;
  findMatch('next');
}

async function replaceAll() {
  const query = findQuery.value;
  if (!query) return;
  const source = editor.value;
  const replacement = replaceQuery.value;
  let count = 0;
  const counter = searchPattern(query);
  while (counter.exec(source)) count++;
  if (count === 0) return;
  const preserved = await captureSnapshot(source, 'Before replace all');
  if (!preserved) {
    showToast('Could not create a recovery copy');
    return;
  }
  if (editor.value !== source) {
    showToast('Draft changed — try replace all again');
    return;
  }
  editor.value = source.replace(searchPattern(query), () => replacement);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  currentMatch = null;
  showToast(`Replaced ${count} ${count === 1 ? 'match' : 'matches'}`);
}

export function initDocumentNavigation() {
  onSourceHeadings((next, source) => {
    indexedHeadings = { headings: next, source };
    if (!documentOutline.hidden) renderOutline();
  });
  editor.addEventListener('input', () => {
    currentMatch = null;
    if (!documentFind.hidden) debouncedCountMatches();
    if (!documentOutline.hidden) debounceOutline();
  });
  editor.addEventListener('documentchange', () => {
    currentMatch = null;
    if (!documentFind.hidden) countMatches();
    if (!documentOutline.hidden) renderOutline();
  });
  outlineBtn?.addEventListener('click', () => {
    renderOutline();
    setPanelOpen(outlineBtn, documentOutline, documentOutline.hidden);
  });
  outlineList?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-heading-index]');
    if (button) revealHeading(Number(button.dataset.headingIndex));
  });
  findBtn?.addEventListener('click', () => {
    const open = documentFind.hidden;
    setPanelOpen(findBtn, documentFind, open);
    if (open) {
      countMatches();
      findQuery.focus();
      findQuery.select();
    } else {
      editor.focus();
    }
  });
  findQuery?.addEventListener('input', () => {
    currentMatch = null;
    debouncedCountMatches();
  });
  findQuery?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      findMatch(event.shiftKey ? 'previous' : 'next');
    }
  });
  findPreviousBtn?.addEventListener('click', () => findMatch('previous'));
  findNextBtn?.addEventListener('click', () => findMatch('next'));
  replaceOneBtn?.addEventListener('click', () => void replaceCurrent());
  replaceAllBtn?.addEventListener('click', () => void replaceAll());
  documentFind?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setPanelOpen(findBtn, documentFind, false);
      findBtn.focus();
    }
  });
  documentOutline?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setPanelOpen(outlineBtn, documentOutline, false);
      outlineBtn.focus();
    }
  });
}
