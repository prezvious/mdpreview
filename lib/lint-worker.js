import { lint } from 'markdownlint/sync';
import { applyFixes } from 'markdownlint';
import { parser as markdownParser } from '@lezer/markdown';

const RULES = ['MD009', 'MD010', 'MD012', 'MD018', 'MD022', 'MD037', 'MD041', 'MD047'];
const config = { default: false, ...Object.fromEntries(RULES.map((rule) => [rule, true])) };
const frontMatter = /^\uFEFF?---[ \t]*\r?\n(?:[^\r\n]*\r?\n)*?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

function check(source) {
  return lint({ strings: { content: source }, config, frontMatter }).content;
}

function keyFor(error) {
  return JSON.stringify([
    error.ruleNames[0],
    error.lineNumber,
    error.errorRange,
    error.errorContext,
    error.fixInfo,
  ]);
}

function describe(error) {
  return {
    key: keyFor(error),
    line: error.lineNumber,
    column: error.errorRange?.[0] ?? 1,
    ruleId: error.ruleNames[0],
    message: `${error.ruleNames[0]}: ${error.ruleDescription}${error.errorDetail ? ` (${error.errorDetail})` : ''}`,
    fixable: Boolean(error.fixInfo),
  };
}

function lineOffsets(source) {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') offsets.push(i + 1);
  return offsets;
}

function fixRange(error, source, offsets) {
  const fix = error.fixInfo;
  const line = (fix.lineNumber ?? error.lineNumber) - 1;
  const start = offsets[line] + (fix.editColumn ?? 1) - 1;
  const end =
    fix.deleteCount === -1 ? (offsets[line + 1] ?? source.length) : start + (fix.deleteCount ?? 0);
  return { start, end };
}

function isCodeTab(error, tree, source, offsets) {
  if (error.ruleNames[0] !== 'MD010') return false;
  const { start } = fixRange(error, source, offsets);
  let node = tree.resolveInner(Math.min(start, source.length), 1);
  while (node) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') return true;
    node = node.parent;
  }
  return false;
}

function describeErrors(source, errors) {
  const offsets = lineOffsets(source);
  const tree = errors.some((error) => error.ruleNames[0] === 'MD010')
    ? markdownParser.parse(source)
    : null;
  return errors.map((error) => ({
    ...describe(error),
    safeForAll: Boolean(error.fixInfo) && !(tree && isCodeTab(error, tree, source, offsets)),
  }));
}

function safeFixes(source, errors) {
  const offsets = lineOffsets(source);
  const tree = markdownParser.parse(source);
  const candidates = errors
    .filter((error) => error.fixInfo && !isCodeTab(error, tree, source, offsets))
    .map((error) => ({ error, ...fixRange(error, source, offsets) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const selected = [];
  let lastEnd = -1;
  for (const candidate of candidates) {
    // Two insertions at the same point also conflict.
    if (candidate.start <= lastEnd) continue;
    selected.push(candidate.error);
    lastEnd = candidate.end;
  }
  return selected;
}

self.addEventListener('message', ({ data }) => {
  try {
    const { type, source, revision, requestId } = data;
    if (type === 'lint') {
      self.postMessage({
        type: 'diagnostics',
        revision,
        requestId,
        warnings: describeErrors(source, check(source)),
      });
      return;
    }
    if (type !== 'fix') return;
    const errors = check(source);
    let next = source;
    let applied = 0;
    if (data.all) {
      for (let pass = 0; pass < RULES.length; pass++) {
        const selected = safeFixes(next, check(next));
        if (!selected.length) break;
        const changed = applyFixes(next, selected);
        if (changed === next) break;
        next = changed;
        applied += selected.length;
      }
    } else {
      const selected = errors
        .filter((error) => keyFor(error) === data.key && error.fixInfo)
        .slice(0, 1);
      next = selected.length ? applyFixes(source, selected) : source;
      applied = next === source ? 0 : selected.length;
    }
    self.postMessage({
      type: 'fixed',
      revision,
      requestId,
      next,
      applied,
      warnings:
        next === source ? describeErrors(source, errors) : describeErrors(next, check(next)),
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      revision: data.revision,
      requestId: data.requestId,
      message: error.message,
    });
  }
});
