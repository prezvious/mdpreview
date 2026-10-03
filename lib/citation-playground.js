import './fonts.js';
import '../styles.css';
import citationStyles from './citations.css?inline';
import { createCitationImportView } from './citation-import-view.js';
import { renderCitationMarkdown, serializeSource } from './citations.js';
import { initTooltips } from './tooltip.js';
import { loadPalette } from './palettes.js';
import { loadDisplayPreferences } from './display-preferences.js';

loadPalette();
loadDisplayPreferences();

const status = document.getElementById('playgroundStatus');
let offlineRegistration;
const cachedAssetUrls = new Set();

function cacheLoadedAssets() {
  if (!offlineRegistration?.active) return;
  const urls = performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((url) => new URL(url).origin === location.origin && !cachedAssetUrls.has(url));
  if (!urls.length) return;
  urls.forEach((url) => cachedAssetUrls.add(url));
  offlineRegistration.active.postMessage({ type: 'CACHE_LOADED', urls });
}

const actions = ['playgroundCopy', 'playgroundDownload', 'playgroundHtml'].map((id) =>
  document.getElementById(id)
);
const importer = createCitationImportView(document.getElementById('playgroundImport'), {
  prefix: 'playground',
  onChange({ markdown, busy }) {
    actions.forEach((button) => {
      button.disabled = busy || !markdown.trim();
    });
    if (!busy) cacheLoadedAssets();
  },
});
initTooltips();

document.getElementById('playgroundSourceForm').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    let source = serializeSource({
      href: document.getElementById('playgroundSourceUrl').value,
      label: document.getElementById('playgroundSourceLabel').value,
      title: document.getElementById('playgroundSourceTitle').value,
    });
    const { selectionStart: start, selectionEnd: end, value } = importer.input;
    if (start && /\S/.test(value[start - 1])) source = ` ${source}`;
    if (end < value.length && /\S/.test(value[end])) source += ' ';
    importer.input.setRangeText(source, start, end, 'end');
    importer.input.dispatchEvent(new Event('input', { bubbles: true }));
    importer.input.focus();
    status.textContent = 'Inserted custom citation at the Markdown selection.';
  } catch (error) {
    status.textContent = error.message;
  }
});

function download(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.getElementById('playgroundCopy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(importer.getMarkdown());
    status.textContent = 'Copied Markdown with source links.';
  } catch {
    importer.input.focus();
    importer.input.select();
    status.textContent =
      'Clipboard access is unavailable. The Markdown is selected; copy it with Ctrl/Cmd+C.';
  }
});
document.getElementById('playgroundDownload').addEventListener('click', () => {
  download(importer.getMarkdown(), 'text/markdown;charset=utf-8', 'citations.md');
});
document.getElementById('playgroundHtml').addEventListener('click', () => {
  const content = document.createElement('div');
  content.appendChild(renderCitationMarkdown(importer.getMarkdown()));
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Citations</title><style>
    :root { --bg-surface: #fff; --bg-secondary: #f4f4f4; --text-primary: #222; --text-secondary: #555; --border-hover: #ccc; --accent: #8f472b; --font-sans: system-ui, sans-serif; }
    body { max-width: 72ch; margin: 2rem auto; padding: 0 1rem; font: 17px/1.7 system-ui, sans-serif; overflow-wrap: anywhere; } pre { overflow: auto; padding: 1rem; background: #f4f4f4; } table { border-collapse: collapse; } td, th { padding: .4rem; border: 1px solid #ccc; }
    ${citationStyles}
    </style><body class="prose">${content.innerHTML}</body></html>`;
  download(html, 'text/html;charset=utf-8', 'citations.html');
});
document.getElementById('playgroundExample').addEventListener('click', () => {
  importer.input.value =
    '# A response with sources\n\nThis is an illustrative sentence with two citation chips. [eScholarship](https://example.org/paper "cite: Example paper") [nyu](https://example.edu/study "cite")\n\nReplace these example URLs with the pages your AI actually consulted.\n\nAn [ordinary link](https://example.net) stays an ordinary link.\n';
  importer.input.dispatchEvent(new Event('input', { bubbles: true }));
});
document.getElementById('playgroundTheme').addEventListener('click', (event) => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  event.currentTarget.textContent = dark ? 'Light theme' : 'Dark theme';
  event.currentTarget.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
});
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker
    .register('/sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then((registration) => {
      offlineRegistration = registration;
      cacheLoadedAssets();
    })
    .catch(() => {
      status.textContent =
        'Offline setup is unavailable. You can still copy or download your document.';
    });
}
