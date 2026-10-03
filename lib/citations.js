import { Lexer, Marked } from 'marked';
import { parser as markdownParser, GFM } from '@lezer/markdown';
import createDOMPurify from 'dompurify';
import { escapeHtml } from './utils.js';

export const AI_CITATION_PROMPT =
  'Write your answer in Markdown. Put a source link immediately after each claim you cite, using [short source name](full-source-url "cite"). Use the exact cited page URL and only sources you actually consulted. If the source URL is unavailable, say it is missing. Preserve headings, lists, tables, and fenced code blocks.';

export function isCitationTitle(title) {
  return title === 'cite' || title?.startsWith('cite: ') === true;
}

export function citationTitle(title) {
  if (!isCitationTitle(title)) return title || '';
  return title === 'cite' ? '' : title.slice(6);
}

export function citationUrl(value) {
  const href = String(value || '').trim();
  try {
    const url = new URL(href);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return href;
  } catch {
    return null;
  }
}

export function sourceLabel(href) {
  const valid = citationUrl(href);
  return valid ? new URL(valid).hostname.replace(/^www\./, '') : 'Source';
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function markdownLabel(value) {
  return cleanText(value).replace(/([\\`*_[\]<>~&])/g, '\\$1');
}

export function serializeSource({ label, href, title = '', cite = true }) {
  const valid = citationUrl(href);
  if (!valid) throw new Error('Enter a full HTTP or HTTPS source URL.');
  const destination = valid.replace(/[\s<>"\\]/g, (character) => encodeURIComponent(character));
  const sourceTitle = cleanText(title);
  let linkTitle = sourceTitle;
  if (cite) linkTitle = sourceTitle ? `cite: ${sourceTitle}` : 'cite';
  const suffix = linkTitle ? ` "${linkTitle.replace(/([\\"])/g, '\\$1')}"` : '';
  return `[${markdownLabel(label || sourceLabel(valid))}](<${destination}>${suffix})`;
}

function tokenLabel(token) {
  if (!token.tokens) {
    const text = token.text || '';
    if (token.type !== 'text' || token.escaped) return text;
    return text.replace(
      /&(?:#(?:\d{1,7}|[xX][\da-fA-F]{1,6})|[a-zA-Z][a-zA-Z\d]{1,31});/g,
      (entity) => {
        const decoder = document.createElement('textarea');
        decoder.innerHTML = entity;
        return decoder.value;
      }
    );
  }
  return token.tokens.map((child) => tokenLabel(child)).join('');
}

export const citationRenderer = {
  link(token) {
    if (!isCitationTitle(token.title)) return false;
    const label = tokenLabel(token) || sourceLabel(token.href);
    const href = citationUrl(token.href);
    if (!href) {
      return `<span class="citation-chip citation-missing" title="Source URL missing or invalid">${escapeHtml(label)}</span>`;
    }
    const title = citationTitle(token.title);
    const tooltip = title ? `${title}\n${href}` : href;
    return `<a class="citation-chip" href="${escapeHtml(href)}" title="${escapeHtml(tooltip)}" data-tooltip="${escapeHtml(tooltip)}" aria-label="${escapeHtml(`Source: ${label}. ${tooltip}`)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  },
};

const parser = new Marked({ gfm: true, renderer: citationRenderer });
const sourceParser = markdownParser.configure(GFM);
let purifier;

export function citationPurifier() {
  purifier ??= createDOMPurify(window);
  return purifier;
}

// Import previews are isolated from the main preview's image/diagram hooks.
export function renderCitationMarkdown(markdown) {
  const fragment = citationPurifier().sanitize(parser.parse(markdown), {
    RETURN_DOM_FRAGMENT: true,
    SANITIZE_NAMED_PROPS: true,
    FORBID_TAGS: ['img', 'svg', 'math', 'iframe', 'video', 'audio', 'source', 'style', 'link'],
    FORBID_ATTR: ['style', 'src', 'srcset'],
  });
  fragment.querySelectorAll('a[href]').forEach((link) => {
    if (citationUrl(link.getAttribute('href'))) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  });
  return fragment;
}

/** Find editable links through Markdown tokens, excluding HTML and code. */
export function markdownSources(markdown) {
  const links = [];
  const protectedRanges = [];
  const candidates = [];
  const quoteMarks = [];
  const protectedTypes = new Set([
    'FencedCode',
    'CodeBlock',
    'InlineCode',
    'HTMLBlock',
    'HTMLTag',
    'LinkReference',
    'Image',
  ]);
  sourceParser.parse(markdown).iterate({
    enter(node) {
      if (protectedTypes.has(node.name)) {
        protectedRanges.push({ start: node.from, end: node.to });
        return false;
      }
      if (node.name === 'Link' || node.name === 'Autolink') {
        candidates.push({ start: node.from, end: node.to });
      } else if (node.name === 'QuoteMark') {
        quoteMarks.push({ start: node.from, end: node.to + (markdown[node.to] === ' ' ? 1 : 0) });
      }
    },
  });
  const lexer = new Lexer(parser.defaults);
  lexer.tokens.links = parser.lexer(markdown).links;
  const addLink = (token, range) =>
    links.push({
      ...range,
      href: token.href,
      label: cleanText(tokenLabel(token)),
      title: citationTitle(token.title),
      cite: isCitationTitle(token.title),
    });
  for (const range of candidates) {
    let raw = markdown.slice(range.start, range.end);
    // Container marks belong to the block, not to the inline link syntax.
    for (const mark of quoteMarks
      .filter((m) => m.start >= range.start && m.end <= range.end)
      .reverse()) {
      raw = raw.slice(0, mark.start - range.start) + raw.slice(mark.end - range.start);
    }
    const tokens = lexer.inlineTokens(raw);
    if (tokens.length === 1 && tokens[0].type === 'link') addLink(tokens[0], range);
  }
  // GFM bare URL links do not have a Link node in Lezer. Keep their literal
  // positions, but never treat destinations, definitions, HTML or code as links.
  const excluded = [...protectedRanges, ...candidates];
  function collectAutolinks(tokens, raw, start) {
    let cursor = 0;
    for (const token of tokens) {
      const offset = raw.indexOf(token.raw, cursor);
      if (offset < 0) continue;
      cursor = offset + token.raw.length;
      const range = { start: start + offset, end: start + cursor };
      if (token.type === 'link' && token.autolink) {
        if (!excluded.some((r) => range.start < r.end && range.end > r.start))
          addLink(token, range);
      } else if (
        token.tokens &&
        !excluded.some((r) => range.start >= r.start && range.end <= r.end)
      ) {
        collectAutolinks(token.tokens, token.raw, range.start);
      }
    }
  }
  collectAutolinks(lexer.inlineTokens(markdown), markdown, 0);
  links.sort((a, b) => a.start - b.start);
  return { links, protectedRanges };
}

export function sourceGroups(markdown) {
  const groups = new Map();
  for (const link of markdownSources(markdown).links) {
    if (!citationUrl(link.href)) continue;
    const key = JSON.stringify([link.href, link.title]);
    if (!groups.has(key)) groups.set(key, { ...link, key, occurrences: [] });
    const group = groups.get(key);
    group.occurrences.push(link);
    group.cite = group.cite && link.cite;
  }
  return [...groups.values()];
}

export function updateSource(markdown, group, changes) {
  let next = markdown;
  for (const link of [...group.occurrences].reverse()) {
    const replacement = serializeSource({ ...link, ...changes });
    next = next.slice(0, link.start) + replacement + next.slice(link.end);
  }
  return next;
}

export function missingSourceMarkers(markdown) {
  const { links, protectedRanges } = markdownSources(markdown);
  const excluded = [...links, ...protectedRanges];
  const pattern = /\uE200cite\uE202[^\uE201]*\uE201|\\?\[\d+(?:[,\s-]+\d+)*\\?\](?!\s*[:([])/g;
  return [...markdown.matchAll(pattern)]
    .filter(
      (match) => !excluded.some((range) => match.index >= range.start && match.index < range.end)
    )
    .map((match) => match[0]);
}
