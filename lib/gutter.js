import { dom } from './dom.js';
import { iconEl, Icons } from './icons.js';
import { escapeHtml } from './utils.js';

const { editor, lineGutter } = dom;

let lastGutterContent = null;
let lastGutterWidth = 0;
let lastGutterFont = '';
let lastGutterErrorSig = '';
let lineHeights = [];
let mirror;
let lastOptions = { lintEnabled: false, warnings: [] };

function measureLineHeights(content, style) {
  if (!mirror) {
    mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    mirror.style.cssText =
      'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box';
    document.body.appendChild(mirror);
    new ResizeObserver(() => updateLineGutter(lastOptions)).observe(editor);
    document.fonts?.addEventListener('loadingdone', () => {
      resetGutterCache();
      updateLineGutter(lastOptions);
    });
  }
  for (const property of [
    'font',
    'lineHeight',
    'letterSpacing',
    'wordSpacing',
    'tabSize',
    'textIndent',
    'whiteSpace',
    'overflowWrap',
    'wordBreak',
    'direction',
    'paddingLeft',
    'paddingRight',
  ])
    mirror.style[property] = style[property];
  mirror.style.width = `${editor.clientWidth}px`;
  if (!editor.clientWidth) return content.split('\n').map(() => parseFloat(style.lineHeight) || 24);
  const fragment = document.createDocumentFragment();
  const lines = content.split('\n').map((text) => {
    const line = document.createElement('div');
    line.textContent = text || '\u200b';
    fragment.appendChild(line);
    return line;
  });
  mirror.replaceChildren(fragment);
  return lines.map((line) => line.getBoundingClientRect().height);
}

function buildErrorMap(warnings) {
  const errorMap = new Map();
  warnings.forEach((w) => {
    const existing = errorMap.get(w.line);
    if (existing) {
      errorMap.set(w.line, `${existing}\n${w.message}`);
    } else {
      errorMap.set(w.line, w.message);
    }
  });
  return errorMap;
}

function buildErrorSig(errorMap) {
  if (errorMap.size === 0) return '';
  return [...errorMap.entries()].map(([line, msg]) => `${line}:${msg}`).join('|');
}

function appendGutterWarningIcons() {
  lineGutter?.querySelectorAll('.line-error-icon').forEach((icon) => {
    if (icon.querySelector('svg')) return;
    icon.appendChild(iconEl(Icons.TriangleAlert, { width: 12, height: 12 }));
  });
}

/**
 * Update line number gutter with line numbers and error indicators
 */
export function updateLineGutter({ lintEnabled, warnings }) {
  if (!lineGutter || !editor) return;
  lastOptions = { lintEnabled, warnings };

  const content = editor.value;
  const style = getComputedStyle(editor);
  const width = editor.clientWidth;
  const font = [style.font, style.lineHeight, style.letterSpacing, style.tabSize].join('|');

  const errorMap = lintEnabled && warnings.length > 0 ? buildErrorMap(warnings) : new Map();
  const errorSig = buildErrorSig(errorMap);

  const layoutChanged =
    content !== lastGutterContent || width !== lastGutterWidth || font !== lastGutterFont;
  if (!layoutChanged && errorSig === lastGutterErrorSig) {
    return;
  }

  if (layoutChanged) lineHeights = measureLineHeights(content, style);
  lastGutterContent = content;
  lastGutterWidth = width;
  lastGutterFont = font;
  lastGutterErrorSig = errorSig;

  let gutterHTML = '';
  for (let i = 1; i <= lineHeights.length; i++) {
    const errorMsg = errorMap.get(i);
    const hasError = !!errorMsg;
    gutterHTML += `<div class="line-number${hasError ? ' has-error' : ''}" style="height:${lineHeights[i - 1]}px">`;
    if (hasError) {
      const escapedMsg = escapeHtml(errorMsg);
      gutterHTML += `<span class="line-error-icon" data-tooltip="${escapedMsg}" tabindex="0" role="img" aria-label="Lint warning on line ${i}"></span>`;
    }
    gutterHTML += `<span class="line-number-text">${i}</span></div>`;
  }

  lineGutter.innerHTML = gutterHTML;
  appendGutterWarningIcons();
  syncGutterScroll();
}

export function resetGutterCache() {
  lastGutterContent = null;
  lastGutterErrorSig = '';
}

/** Vertical source-line position, including soft-wrapped rows. */
export function getEditorLineTop(lineNumber) {
  updateLineGutter(lastOptions);
  return lineHeights.slice(0, Math.max(0, lineNumber - 1)).reduce((sum, height) => sum + height, 0);
}

export function syncGutterScroll() {
  if (lineGutter && editor) {
    lineGutter.scrollTop = editor.scrollTop;
  }
}
