import {
  citationPurifier,
  citationTitle,
  citationUrl,
  isCitationTitle,
  missingSourceMarkers,
  serializeSource,
  sourceGroups,
} from './citations.js';

let converterModules;

export function loadCitationConverter() {
  converterModules ??= Promise.all([import('turndown'), import('turndown-plugin-gfm')]).catch(
    (error) => {
      converterModules = null;
      throw error;
    }
  );
  return converterModules;
}

export async function htmlToCitationMarkdown(html, { warnings = [] } = {}) {
  const [turndownModule, gfmModule] = await loadCitationConverter();
  const fragment = citationPurifier().sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: [
      'p',
      'div',
      'span',
      'br',
      'hr',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'a',
      'strong',
      'b',
      'em',
      'i',
      'del',
      's',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'th',
      'td',
      'sup',
      'sub',
      'input',
      'math',
      'semantics',
      'annotation',
      'mrow',
      'mi',
      'mn',
      'mo',
      'mtext',
      'mfrac',
      'msqrt',
      'mroot',
      'msup',
      'msub',
      'msubsup',
      'mover',
      'munder',
      'munderover',
      'mtable',
      'mtr',
      'mtd',
      'mstyle',
      'mspace',
      'mpadded',
      'menclose',
    ],
    ALLOWED_ATTR: [
      'href',
      'title',
      'id',
      'class',
      'type',
      'checked',
      'start',
      'colspan',
      'rowspan',
      'encoding',
      'display',
    ],
    ALLOW_DATA_ATTR: true,
  });
  const equations = new Map();
  fragment
    .querySelectorAll('[data-import-equation]')
    .forEach((node) => node.removeAttribute('data-import-equation'));
  let missingEquations = 0;
  const mathSelector = '.katex-display, .katex, math';
  const mathRoots = [...fragment.querySelectorAll(mathSelector)].filter(
    (node) => !node.parentElement?.closest(mathSelector)
  );
  for (const node of mathRoots) {
    const annotation = node.querySelector(
      'annotation[encoding="application/x-tex"], annotation[encoding="application/x-latex"]'
    );
    const tex = annotation?.textContent.trim();
    const replacement = document.createElement('span');
    if (tex) {
      const display =
        node.classList.contains('katex-display') ||
        node.getAttribute('display') === 'block' ||
        node.querySelector('math[display="block"]');
      const key = String(equations.size);
      replacement.setAttribute('data-import-equation', key);
      equations.set(key, display ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`);
      replacement.textContent = tex;
    } else {
      missingEquations++;
      replacement.textContent = '[Equation could not be converted; see copied text]';
    }
    node.replaceWith(replacement);
  }
  if (missingEquations) {
    warnings.push(
      'The formatted copy contains math without TeX source. Use the copied text to preserve those equations, or repair them before inserting.'
    );
  }
  const converter = new turndownModule.default({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    preformattedCode: true,
  });
  converter.use(gfmModule.gfm || gfmModule.default.gfm);
  converter.addRule('equation', {
    filter: (node) => equations.has(node.getAttribute('data-import-equation')),
    replacement: (_content, node) => equations.get(node.getAttribute('data-import-equation')),
  });
  converter.addRule('sourceCitation', {
    filter: (node) => node.nodeName === 'A',
    replacement(content, node) {
      let href = node.getAttribute('href') || '';
      let linkedFootnote = false;
      if (href.startsWith('#')) {
        let id;
        try {
          id = decodeURIComponent(href.slice(1));
        } catch {
          return content;
        }
        const targets = [...fragment.querySelectorAll('[id]')].filter((target) => target.id === id);
        const destinations = new Set(
          targets.flatMap((target) =>
            [...target.querySelectorAll('a[href]')]
              .map((link) => citationUrl(link.getAttribute('href')))
              .filter(Boolean)
          )
        );
        if (destinations.size === 1) {
          [href] = destinations;
          linkedFootnote = true;
        } else {
          return content || '[Source URL missing]';
        }
      }
      if (!citationUrl(href)) return content;
      const title = node.getAttribute('title') || '';
      const cite =
        isCitationTitle(title) ||
        node.closest('sup, [data-citation]') !== null ||
        node.classList.contains('citation-chip') ||
        linkedFootnote;
      return serializeSource({
        label: node.textContent.trim() || content,
        href,
        title: citationTitle(title),
        cite,
      });
    },
  });
  return converter.turndown(fragment).trim();
}

export async function normalizeCitationClipboard({ text = '', html = '' }) {
  const candidates = [];
  const warnings = [];
  if (text) candidates.push({ id: 'text', label: 'Copied text / Markdown', markdown: text });
  if (html) {
    try {
      const markdown = await htmlToCitationMarkdown(html, { warnings });
      if (markdown && markdown !== text) {
        candidates.push({ id: 'html', label: 'Formatted copy with source links', markdown });
      }
    } catch {
      warnings.push('Formatted conversion failed. The copied text is still available.');
    }
  }
  const textCandidate = candidates.find((candidate) => candidate.id === 'text');
  const htmlCandidate = candidates.find((candidate) => candidate.id === 'html');
  const textSources = sourceGroups(text).length;
  let selected = textCandidate || htmlCandidate;
  const preserveText = textCandidate && warnings.length > 0;
  if (!preserveText && htmlCandidate && sourceGroups(htmlCandidate.markdown).length > textSources)
    selected = htmlCandidate;
  if (
    !preserveText &&
    !textSources &&
    htmlCandidate &&
    !/^\s*(#{1,6}\s|```|~~~|\|.+\||[-*+]\s)/m.test(text)
  ) {
    selected = htmlCandidate;
  }
  const markdown = selected?.markdown || text;
  return {
    candidates,
    selectedId: selected?.id || '',
    markdown,
    warnings,
    missing: missingSourceMarkers(markdown),
  };
}
