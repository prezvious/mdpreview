import { dom } from './dom.js';
import { STORAGE_KEYS, LINT_DEBOUNCE_DELAY } from './constants.js';
import { getStorageItem, setStorageItem } from './storage.js';
import { debounce } from './utils.js';
import { updateLineGutter, resetGutterCache, getEditorLineTop } from './gutter.js';
import { iconEl, Icons } from './icons.js';
import { applyEditorText } from './editor-edit.js';

const { editor, lintToggle, lintCount, lintPanel, lintList, lintFixAll } = dom;
let lintEnabled = false;
let worker = null;
let workerFailed = false;
let currentLintWarnings = [];
let revision = 0;
let requestId = 0;
let latestLintRequest = 0;
let diagnosticSource = null;
const pending = new Map();

function refreshGutter() {
  updateLineGutter({ lintEnabled, warnings: currentLintWarnings });
}

function setTooltip() {
  if (!lintToggle) return;
  const label = `Lint markdown (${lintEnabled ? 'on' : 'off'})`;
  lintToggle.title = label;
  lintToggle.setAttribute('data-tooltip', label);
  lintToggle.setAttribute('aria-pressed', String(lintEnabled));
  lintToggle.classList.toggle('active', lintEnabled);
}

function ensureWorker() {
  if (worker || workerFailed) return worker;
  try {
    worker = new Worker(new URL('./lint-worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', onWorkerMessage);
    worker.addEventListener('error', () => {
      workerFailed = true;
      pending.clear();
      worker?.terminate();
      worker = null;
      showState('Markdown linting is unavailable in this browser.', 'error');
    });
  } catch {
    workerFailed = true;
    showState('Markdown linting is unavailable in this browser.', 'error');
  }
  return worker;
}

function showState(message, state) {
  if (!lintEnabled || !lintList) return;
  diagnosticSource = null;
  currentLintWarnings = [];
  lintToggle?.classList.remove('has-warnings');
  if (lintCount) lintCount.textContent = '';
  refreshGutter();
  lintList.replaceChildren();
  const item = document.createElement('li');
  item.className = 'lint-item';
  item.textContent = message;
  lintList.appendChild(item);
  lintPanel.dataset.state = state;
  lintFixAll.hidden = true;
}

function requestLint(source) {
  if (!lintEnabled) return;
  const activeWorker = ensureWorker();
  if (!activeWorker) return;
  const id = ++requestId;
  latestLintRequest = id;
  pending.set(id, { source, kind: 'lint' });
  activeWorker.postMessage({ type: 'lint', source, revision: ++revision, requestId: id });
}

async function onWorkerMessage({ data }) {
  const task = pending.get(data.requestId);
  pending.delete(data.requestId);
  if (!task || !lintEnabled || editor.value !== task.source) return;
  if (data.type === 'error') {
    showState(`Linting failed: ${data.message}`, 'error');
    return;
  }
  if (data.type === 'diagnostics') {
    if (data.requestId !== latestLintRequest) return;
    updateLintUI(data.warnings);
    return;
  }
  if (data.type !== 'fixed') return;
  if (data.applied) {
    await applyEditorText(data.next, { reason: 'Before lint fixes' });
    requestLint(editor.value);
  } else {
    updateLintUI(data.warnings);
  }
}

function requestFix({ key = null, all = false } = {}) {
  if (!lintEnabled || !ensureWorker()) return;
  const source = editor.value;
  const id = ++requestId;
  pending.set(id, { source, kind: 'fix' });
  worker.postMessage({ type: 'fix', source, revision: ++revision, requestId: id, key, all });
}

function warningRow(warning) {
  const item = document.createElement('li');
  item.className = 'lint-item';
  const jump = document.createElement('button');
  jump.type = 'button';
  jump.className = 'lint-jump';
  jump.addEventListener('click', () => scrollToLine(warning.line));
  const icon = document.createElement('span');
  icon.className = 'lint-item-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.appendChild(iconEl(Icons.TriangleAlert, { width: 14, height: 14 }));
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = `Warning on line ${warning.line}: ${warning.message}`;
  const line = document.createElement('span');
  line.className = 'lint-item-line';
  line.textContent = `L${warning.line}`;
  const message = document.createElement('span');
  message.className = 'lint-item-message';
  message.textContent = warning.message;
  jump.append(icon, sr, line, message);
  item.appendChild(jump);
  if (warning.fixable) {
    const fix = document.createElement('button');
    fix.type = 'button';
    fix.className = 'lint-fix';
    fix.textContent = 'Fix';
    fix.setAttribute('aria-label', `Fix ${warning.message} on line ${warning.line}`);
    fix.addEventListener('click', () => requestFix({ key: warning.key }));
    item.appendChild(fix);
  }
  return item;
}

export function updateLintUI(warnings) {
  currentLintWarnings = warnings;
  diagnosticSource = editor.value;
  if (!lintEnabled) return;
  lintPanel.dataset.state = 'ready';
  lintToggle?.classList.toggle('has-warnings', warnings.length > 0);
  if (lintCount) lintCount.textContent = warnings.length ? String(warnings.length) : '';
  if (lintFixAll) lintFixAll.hidden = !warnings.some((warning) => warning.safeForAll);
  if (lintList) {
    lintList.replaceChildren();
    if (warnings.length) warnings.forEach((warning) => lintList.appendChild(warningRow(warning)));
    else {
      const item = document.createElement('li');
      item.className = 'lint-item';
      const icon = document.createElement('span');
      icon.className = 'lint-item-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.style.color = 'var(--link-color)';
      icon.appendChild(iconEl(Icons.CircleCheck, { width: 14, height: 14 }));
      const message = document.createElement('span');
      message.className = 'lint-item-message';
      message.textContent = 'No issues found';
      item.append(icon, message);
      lintList.appendChild(item);
    }
  }
  refreshGutter();
}

export function scrollToLine(lineNumber) {
  if (!editor) return;
  let at = 0;
  for (let line = 1; line < lineNumber; line++) {
    const next = editor.value.indexOf('\n', at);
    if (next === -1) break;
    at = next + 1;
  }
  editor.focus();
  editor.setSelectionRange(at, at);
  editor.scrollTop = Math.max(0, getEditorLineTop(lineNumber) - editor.clientHeight / 3);
}

export function toggleLint() {
  return setLintEnabled(!lintEnabled);
}

export function setLintEnabled(enabled) {
  if (lintEnabled === Boolean(enabled)) return true;
  lintEnabled = Boolean(enabled);
  const saved = setStorageItem(STORAGE_KEYS.LINT_ENABLED, String(lintEnabled));
  setTooltip();
  if (lintEnabled) {
    lintPanel?.classList.add('visible');
    showState('Checking Markdown…', 'checking');
    requestLint(editor.value);
  } else {
    currentLintWarnings = [];
    pending.clear();
    lintPanel?.classList.remove('visible');
    lintToggle?.classList.remove('has-warnings');
    if (lintCount) lintCount.textContent = '';
    resetGutterCache();
    refreshGutter();
  }
  return saved;
}

export function loadLintPreference() {
  lintEnabled = getStorageItem(STORAGE_KEYS.LINT_ENABLED) === 'true';
  setTooltip();
  if (lintEnabled) lintPanel?.classList.add('visible');
  lintFixAll?.addEventListener('click', () => requestFix({ all: true }));
}

export function isLintEnabled() {
  return lintEnabled;
}

export function getCurrentLintWarnings() {
  return currentLintWarnings;
}

const scheduleLint = debounce(requestLint, LINT_DEBOUNCE_DELAY);
export function debouncedLint(content) {
  if (!lintEnabled) return;
  if (content !== diagnosticSource && lintPanel?.dataset.state !== 'checking')
    showState('Checking Markdown…', 'checking');
  scheduleLint(content);
}

export function runInitialLint() {
  if (!lintEnabled || !editor) return;
  showState('Checking Markdown…', 'checking');
  requestLint(editor.value);
}

export function refreshGutterFromLint() {
  refreshGutter();
}
