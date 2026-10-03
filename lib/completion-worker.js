import { parser as markdownBase, GFM } from '@lezer/markdown';
import { TreeFragment } from '@lezer/common';
import GithubSlugger from 'github-slugger';
import { marked, Parser } from 'marked';
import { unescape } from 'marked-gfm-heading-id';
import { splitFrontmatter } from './frontmatter.js';

const markdownParser = markdownBase.configure(GFM);
const languageLoaders = {
  javascript: () => import('@lezer/javascript').then(({ parser }) => parser),
  typescript: () =>
    import('@lezer/javascript').then(({ parser }) => parser.configure({ dialect: 'ts' })),
  jsx: () => import('@lezer/javascript').then(({ parser }) => parser.configure({ dialect: 'jsx' })),
  tsx: () =>
    import('@lezer/javascript').then(({ parser }) => parser.configure({ dialect: 'ts jsx' })),
  python: () => import('@lezer/python').then(({ parser }) => parser),
  json: () => import('@lezer/json').then(({ parser }) => parser),
  html: () => import('@lezer/html').then(({ parser }) => parser),
  css: () => import('@lezer/css').then(({ parser }) => parser),
};
const aliases = {
  js: 'javascript',
  jsx: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  typescript: 'typescript',
  py: 'python',
  python: 'python',
  json: 'json',
  html: 'html',
  css: 'css',
};
const fenceLanguages = [
  'bash',
  'css',
  'html',
  'javascript',
  'json',
  'markdown',
  'mermaid',
  'python',
  'typescript',
];
const blockSnippets = [
  { label: 'Heading 1', detail: '# Heading', insert: '# ' },
  { label: 'Heading 2', detail: '## Heading', insert: '## ' },
  { label: 'Bullet list', detail: '- Item', insert: '- ' },
  { label: 'Task item', detail: '- [ ] Task', insert: '- [ ] ' },
  { label: 'Quote', detail: '> Quote', insert: '> ' },
  { label: 'Code fence', detail: '``` … ```', insert: '```\n\n```', cursor: 4 },
];
const inlineSnippets = [
  { label: 'Bold', detail: '**text**', insert: '****', cursor: 2 },
  { label: 'Italic', detail: '*text*', insert: '**', cursor: 1 },
  { label: 'Inline code', detail: '`code`', insert: '``', cursor: 1 },
  { label: 'Link', detail: '[text](url)', insert: '[]()', cursor: 1 },
];
const codeWords = {
  javascript: [
    'const',
    'let',
    'function',
    'return',
    'async',
    'await',
    'import',
    'export',
    'class',
    'if',
    'else',
    'true',
    'false',
    'null',
    'console',
    'Promise',
  ],
  typescript: [
    'const',
    'let',
    'function',
    'return',
    'async',
    'await',
    'import',
    'export',
    'class',
    'interface',
    'type',
    'as',
    'string',
    'number',
    'boolean',
    'unknown',
  ],
  python: [
    'def',
    'class',
    'return',
    'if',
    'elif',
    'else',
    'for',
    'in',
    'while',
    'import',
    'from',
    'async',
    'await',
    'True',
    'False',
    'None',
    'print',
  ],
  json: ['true', 'false', 'null'],
  html: [
    'div',
    'span',
    'a',
    'p',
    'h1',
    'h2',
    'img',
    'button',
    'input',
    'section',
    'article',
    'ul',
    'li',
    'class',
    'id',
    'href',
    'src',
    'alt',
    'type',
  ],
  css: [
    'color',
    'background',
    'display',
    'margin',
    'padding',
    'font-size',
    'font-weight',
    'border',
    'width',
    'height',
    'flex',
    'grid',
    'position',
  ],
};
const htmlTags = codeWords.html.slice(0, 13);
const htmlAttributes = codeWords.html.slice(13);
const cssValues = ['auto', 'block', 'flex', 'grid', 'none', 'red', 'blue', 'var'];
const codeSnippets = {
  javascript: [
    { label: 'function', detail: 'Function declaration', insert: 'function name() {\n  \n}' },
    { label: 'const', detail: 'Variable declaration', insert: 'const name = ' },
  ],
  typescript: [
    { label: 'interface', detail: 'Interface declaration', insert: 'interface Name {\n  \n}' },
    { label: 'const', detail: 'Variable declaration', insert: 'const name: unknown = ' },
  ],
  python: [
    { label: 'def', detail: 'Function definition', insert: 'def name():\n    pass' },
    { label: 'class', detail: 'Class definition', insert: 'class Name:\n    pass' },
  ],
  json: [],
  html: [],
  css: [],
};

let source = '';
let revision = 0;
let tree = markdownParser.parse('');
let fragments = TreeFragment.addTree(tree);
let headings = [];
let references = [];
let indexDirty = false;
let indexTimer = null;

function fenceFromNode(node) {
  const info = node.getChild('CodeInfo');
  const parts = node.getChildren('CodeText');
  const marks = node.getChildren('CodeMark');
  const firstBreak = source.indexOf('\n', marks[0]?.to ?? node.from);
  const bodyStart = firstBreak === -1 ? node.to : firstBreak + 1;
  return {
    from: node.from,
    to: node.to,
    info: info ? source.slice(info.from, info.to).trim().split(/\s+/)[0].toLowerCase() : '',
    infoFrom: info?.from ?? marks[0]?.to ?? node.from,
    openEnd: firstBreak === -1 ? node.to : firstBreak,
    bodyStart,
    bodyEnd: marks.length > 1 ? (parts.at(-1)?.to ?? bodyStart) : node.to,
    parts: parts.map(({ from, to }) => ({ from, to })),
  };
}

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

function lineAt(starts, offset) {
  let lo = 0;
  let hi = starts.length;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid;
  }
  return lo + 1;
}

function headingText(node, rendered) {
  let raw = source.slice(node.from, node.to);
  if (node.name.startsWith('ATXHeading'))
    raw = raw.replace(/^ {0,3}#{1,6}[ \t]*/, '').replace(/[ \t]+#+[ \t]*$/, '');
  else raw = raw.replace(/\n {0,3}(?:=+|-+)[ \t]*$/, '');
  const html = rendered ?? marked.parseInline(raw);
  return unescape(html)
    .trim()
    .replace(/<[!\/a-z].*?>/gi, '');
}

function rebuildIndex() {
  const starts = lineStarts(source);
  const bodyStart = source.length - (splitFrontmatter(source)?.body.length ?? source.length);
  const slugger = new GithubSlugger();
  const renderedHeadings = [];
  // Marked resolves reference links and removes container prefixes just as preview does.
  marked.walkTokens(marked.lexer(source.slice(bodyStart)), (token) => {
    if (token.type === 'heading')
      renderedHeadings.push({ level: token.depth, html: Parser.parseInline(token.tokens) });
  });
  let headingIndex = 0;
  const nextHeadings = [];
  const nextReferences = new Map();
  tree.iterate({
    enter(ref) {
      if (ref.from < bodyStart) return;
      const node = ref.node;
      if (/^(?:ATX|Setext)Heading[1-6]$/.test(ref.name)) {
        const level = Number(ref.name.at(-1));
        const rendered = renderedHeadings[headingIndex++];
        const text = headingText(node, rendered?.level === level ? rendered.html : undefined);
        let parent = node.parent;
        let nested = false;
        while (parent) {
          if (['Blockquote', 'ListItem'].includes(parent.name)) nested = true;
          parent = parent.parent;
        }
        nextHeadings.push({
          level,
          text,
          slug: slugger.slug(text.toLowerCase()),
          line: lineAt(starts, ref.from),
          offset: ref.from,
          nested,
        });
      } else if (ref.name === 'LinkReference') {
        const label = node.getChild('LinkLabel');
        if (label) {
          const text = source.slice(label.from, label.to).replace(/^\[|\]$/g, '');
          nextReferences.set(text.toLowerCase(), text);
        }
      }
    },
  });
  headings = nextHeadings;
  references = [...nextReferences.values()];
  indexDirty = false;
  self.postMessage({ type: 'headings', revision, headings });
}

function scheduleIndex() {
  indexDirty = true;
  clearTimeout(indexTimer);
  indexTimer = setTimeout(() => {
    if (indexDirty) rebuildIndex();
  }, 150);
}

function setSource(text, nextRevision) {
  source = text;
  revision = nextRevision;
  tree = markdownParser.parse(source);
  fragments = TreeFragment.addTree(tree);
  rebuildIndex();
}

function applyChange({ from, to, insert, revision: nextRevision }) {
  if (nextRevision !== revision + 1 || from < 0 || to > source.length || from > to) return false;
  source = source.slice(0, from) + insert + source.slice(to);
  fragments = TreeFragment.applyChanges(fragments, [
    { fromA: from, toA: to, fromB: from, toB: from + insert.length },
  ]);
  tree = markdownParser.parse(source, fragments);
  fragments = TreeFragment.addTree(tree, fragments);
  revision = nextRevision;
  scheduleIndex();
  return true;
}

function activeFence(position) {
  for (const side of [-1, 1]) {
    let node = tree.resolveInner(Math.min(position, source.length), side);
    while (node) {
      if (node.name === 'FencedCode') return fenceFromNode(node);
      node = node.parent;
    }
  }
  return null;
}

function proseCompletion(position, explicit, selectionStart, selectionEnd) {
  const bodyStart = source.length - (splitFrontmatter(source)?.body.length ?? source.length);
  if (position < bodyStart) return null;
  const fence = activeFence(position);
  const lineStart = source.lastIndexOf('\n', position - 1) + 1;
  const prefix = source.slice(lineStart, position);
  const suffix = source.slice(position);
  const fenceOpen = /^ {0,3}(`{3,}|~{3,})([\w-]*)$/.exec(prefix);
  if (fence && position <= fence.openEnd && fenceOpen) {
    const partial = fenceOpen[2].toLowerCase();
    const items = fenceLanguages
      .filter((word) => word.startsWith(partial))
      .map((word) => ({ label: word, detail: 'Code fence language', insert: word }));
    return items.length ? { from: position - partial.length, to: position, items } : null;
  }
  if (fence && position >= fence.bodyStart && position <= fence.bodyEnd)
    return selectionStart === selectionEnd ? { fence } : null;
  if (fence) return null;
  let context = tree.resolveInner(Math.max(0, position - 1), -1);
  while (context) {
    if (['InlineCode', 'CodeBlock'].includes(context.name)) return null;
    context = context.parent;
  }
  if (selectionStart !== selectionEnd) {
    if (!explicit) return null;
    const selected = source.slice(selectionStart, selectionEnd);
    const wrap = (label, before, after) => ({
      label,
      detail: `Wrap selection as ${label.toLowerCase()}`,
      insert: `${before}${selected}${after}`,
      selection: [before.length, before.length + selected.length],
    });
    return {
      from: selectionStart,
      to: selectionEnd,
      items: [
        wrap('Bold', '**', '**'),
        wrap('Italic', '*', '*'),
        wrap('Inline code', '`', '`'),
        wrap('Link', '[', '](url)'),
      ],
    };
  }
  const anchor = /\]\(#([^\s)]*)$/.exec(prefix);
  if (anchor) {
    if (indexDirty) rebuildIndex();
    const partial = anchor[1].toLowerCase();
    const closing = suffix.startsWith(')') ? '' : ')';
    const items = headings
      .filter((heading) => heading.slug.toLowerCase().includes(partial))
      .map((heading) => ({
        label: `#${heading.slug}`,
        detail: heading.text,
        insert: `${heading.slug}${closing}`,
      }));
    return items.length ? { from: position - anchor[1].length, to: position, items } : null;
  }
  const reference = /\]\[([^\]\n]*)$/.exec(prefix);
  if (reference) {
    if (indexDirty) rebuildIndex();
    const partial = reference[1].toLowerCase();
    const closing = suffix.startsWith(']') ? '' : ']';
    const items = references
      .filter((label) => label.toLowerCase().includes(partial))
      .map((label) => ({
        label: `[${label}]`,
        detail: 'Link reference',
        insert: `${label}${closing}`,
      }));
    return items.length ? { from: position - reference[1].length, to: position, items } : null;
  }
  if (/^ {0,3}#{1,6}$/.test(prefix))
    return {
      from: position,
      to: position,
      items: [{ label: 'Heading text', detail: 'Add space after #', insert: ' ' }],
    };
  if (/^ {0,3}- \[$/.test(prefix))
    return {
      from: position,
      to: position,
      items: [
        { label: 'Unchecked task', detail: '- [ ]', insert: ' ] ' },
        { label: 'Checked task', detail: '- [x]', insert: 'x] ' },
      ],
    };
  if (!explicit) return null;
  return {
    from: position,
    to: position,
    items: prefix.trim() ? inlineSnippets : [...blockSnippets, ...inlineSnippets],
  };
}

function isPythonDefinition(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (['FunctionDefinition', 'ClassDefinition'].includes(parent.name)) return true;
  if (parent.name === 'AssignStatement')
    return node.to <= (parent.getChildren('AssignOp').at(-1)?.from ?? -1);
  if (parent.name === 'ForStatement') return node.to <= (parent.getChild('in')?.from ?? -1);
  if (parent.name === 'ParamList') return ['(', ',', '*', '**'].includes(node.prevSibling?.name);
  if (parent.name === 'ImportStatement') {
    const keyword = parent.getChild('import');
    return node.from >= (keyword?.to ?? Infinity) && node.nextSibling?.name !== 'as';
  }
  return false;
}

function declaredSymbols(language, syntaxTree, code, position) {
  const found = new Map();
  syntaxTree.iterate({
    enter(ref) {
      if (ref.to > position || ref.from === ref.to) return;
      const name = ref.name;
      let declared = false;
      if (language === 'javascript' || language === 'typescript')
        declared = name === 'VariableDefinition' || name === 'TypeDefinition';
      else if (language === 'python')
        declared = name === 'VariableName' && isPythonDefinition(ref.node);
      else if (language === 'json') declared = name === 'PropertyName';
      else if (language === 'html') declared = name === 'TagName' || name === 'AttributeName';
      else if (language === 'css')
        declared = ['PropertyName', 'VariableName', 'ClassName', 'IdName'].includes(name);
      if (declared) {
        const value = code.slice(ref.from, ref.to).replace(/^['"]|['"]$/g, '');
        if (/^[\w$-]+$/.test(value)) found.set(value, name);
      }
    },
  });
  return [...found].map(([label, kind]) => ({ label, kind }));
}

function codeMode(language, before, syntaxTree, position) {
  if (language === 'html') {
    if (/<\/?[\w-]*$/.test(before)) return 'tag';
    if (/<[a-z][^>]*\s+[\w-]*$/i.test(before)) return 'attribute';
    return 'none';
  }
  if (language === 'css') {
    const open = before.lastIndexOf('{');
    if (open === -1 || open < before.lastIndexOf('}')) return 'selector';
    const statement = before.slice(Math.max(open, before.lastIndexOf(';')) + 1);
    return statement.includes(':') ? 'value' : 'property';
  }
  if (language === 'json') {
    let quoteStart = -1;
    for (let i = 0; i < before.length; i++) {
      if (before[i] === '\\' && quoteStart !== -1) i++;
      else if (before[i] === '"') quoteStart = quoteStart === -1 ? i : -1;
    }
    let node = syntaxTree.resolveInner(Math.max(0, position - 1), -1);
    while (node && !['Object', 'PropertyName', 'Property', 'Array'].includes(node.name))
      node = node.parent;
    if (node?.name === 'PropertyName') return 'key';
    if (quoteStart !== -1) {
      const prior = before.slice(0, quoteStart).trimEnd().at(-1);
      return node?.name === 'Object' && ['{', ','].includes(prior) ? 'key' : 'none';
    }
    while (node && !['Object', 'Property', 'Array'].includes(node.name)) node = node.parent;
    return node?.name === 'Object' ? 'key' : 'value';
  }
  return 'code';
}

function symbolsForMode(language, mode, symbols) {
  const allowed = {
    html: { tag: ['TagName'], attribute: ['AttributeName'] },
    css: {
      property: ['PropertyName', 'VariableName'],
      value: ['VariableName'],
      selector: ['ClassName', 'IdName'],
    },
    json: { key: ['PropertyName'], value: [] },
  }[language]?.[mode];
  return allowed ? symbols.filter((symbol) => allowed.includes(symbol.kind)) : symbols;
}

function wordsForMode(language, mode) {
  if (language === 'html') {
    if (mode === 'tag') return htmlTags;
    if (mode === 'attribute') return htmlAttributes;
    return [];
  }
  if (language === 'css') {
    if (mode === 'value') return cssValues;
    return mode === 'selector' ? [] : codeWords.css;
  }
  if (language === 'json') return mode === 'value' ? codeWords.json : [];
  return codeWords[language];
}

function inCommentOrString(syntaxTree, position, language) {
  let node = syntaxTree.resolveInner(Math.max(0, position - 1), -1);
  while (node) {
    if (/Comment/.test(node.name)) return true;
    if (/String|Template|AttributeValue/.test(node.name)) return language !== 'json';
    node = node.parent;
  }
  return false;
}

async function codeCompletion(fence, position, explicit) {
  const language = aliases[fence.info] ?? null;
  // CodeText excludes Markdown container prefixes, such as > and list indentation.
  const code = fence.parts.map(({ from, to }) => source.slice(from, to)).join('');
  const localPosition = fence.parts.reduce(
    (length, { from, to }) => length + Math.max(0, Math.min(position, to) - from),
    0
  );
  const before = code.slice(0, localPosition);
  const prefix = /[\w$-]+$/.exec(before)?.[0] ?? '';
  const remaining = /^[\w$-]*/.exec(source.slice(position, fence.bodyEnd))[0];
  const trigger = /(?:<\/?|["'{.:])$/.test(before);
  if (!explicit && prefix.length < 2 && !trigger) return null;
  const words = [];
  let mode = null;
  if (language) {
    const parser = await (languageLoaders[fence.info] ?? languageLoaders[language])();
    const syntaxTree = parser.parse(code);
    if (inCommentOrString(syntaxTree, localPosition, language)) return null;
    mode = codeMode(language, before, syntaxTree, localPosition);
    if (mode === 'none') return null;
    words.push(
      ...symbolsForMode(
        language,
        mode,
        declaredSymbols(language, syntaxTree, code, localPosition)
      ).map((symbol) => ({
        label: symbol.label,
        detail: 'Earlier in this fence',
        insert: symbol.label,
      }))
    );
    words.push(
      ...wordsForMode(language, mode).map((label) => ({
        label,
        detail: `${language} syntax`,
        insert: label,
      }))
    );
    if (explicit && mode === 'code') words.push(...codeSnippets[language]);
  } else {
    const prior = before.match(/[A-Za-z_$][\w$]*/g) ?? [];
    words.push(
      ...[...new Set(prior)].map((label) => ({
        label,
        detail: 'Earlier in this fence',
        insert: label,
      }))
    );
  }
  const seen = new Set();
  let items = words
    .filter((item) => {
      const key = item.insert.toLowerCase();
      if (
        seen.has(key) ||
        (prefix && !item.label.toLowerCase().startsWith(prefix.toLowerCase())) ||
        item.label === prefix
      )
        return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
  if (language === 'json' && mode === 'key') {
    const quoted = /"[\w$-]*$/.test(before);
    const closing = source[position + remaining.length] === '"' ? '' : '"';
    items = items.map((item) => ({
      ...item,
      insert: quoted ? `${item.insert}${closing}` : `"${item.insert}"`,
    }));
  }
  return items.length
    ? { from: position - prefix.length, to: position + remaining.length, items }
    : null;
}

self.addEventListener('message', async ({ data }) => {
  try {
    if (data.type === 'init') return setSource(data.source, data.revision);
    if (data.type === 'change') {
      if (!applyChange(data)) self.postMessage({ type: 'resync' });
      return;
    }
    if (data.type !== 'complete' || data.revision !== revision) return;
    const prose = proseCompletion(
      data.position,
      data.explicit,
      data.selectionStart,
      data.selectionEnd
    );
    const result = prose?.fence
      ? await codeCompletion(prose.fence, data.position, data.explicit)
      : prose;
    if (data.revision === revision)
      self.postMessage({ type: 'completion', requestId: data.requestId, revision, result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId: data.requestId,
      revision: data.revision,
      message: error.message,
    });
  }
});
