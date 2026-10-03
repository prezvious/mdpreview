import { STORAGE_KEYS } from './constants.js';
import { getStorageItem, readStorageItem, setStorageItem } from './storage.js';
import { BUILTIN_PALETTES } from './palette-data.js';

export const COLOR_ROLES = [
  ['--bg-primary', 'Workspace'],
  ['--bg-secondary', 'Editor'],
  ['--bg-surface', 'Reading surface'],
  ['--text-primary', 'Text'],
  ['--text-secondary', 'Secondary text'],
  ['--accent', 'Accent / link'],
  ['--highlight-bg', 'Highlight'],
  ['--border-color', 'Border'],
];
const HEX = /^#[\da-f]{6}$/i;
let customThemes = [];
let activeId = 'warm-paper';
const pendingThemeChanges = new Map();

export function normalizeHex(value) {
  const text = value.trim();
  if (/^#[\da-f]{3}$/i.test(text)) {
    return `#${[...text.slice(1)].map((char) => char + char).join('')}`.toLowerCase();
  }
  return HEX.test(text) ? text.toLowerCase() : null;
}

function validTheme(theme) {
  return (
    theme &&
    /^custom-[a-z0-9-]{1,80}$/.test(theme.id) &&
    typeof theme.name === 'string' &&
    theme.name.trim().length > 0 &&
    theme.name.length <= 60 &&
    BUILTIN_PALETTES.some((palette) => palette.id === theme.baseId) &&
    ['light', 'dark'].every((mode) =>
      COLOR_ROLES.every(
        ([token]) => typeof theme[mode]?.[token] === 'string' && HEX.test(theme[mode][token])
      )
    )
  );
}

function readCatalog() {
  const stored = readStorageItem(STORAGE_KEYS.CUSTOM_THEMES);
  if (!stored.ok) return customThemes;
  try {
    const saved = JSON.parse(stored.value);
    if (saved?.version !== 1 || !Array.isArray(saved.themes)) return [];
    const seen = new Set();
    return saved.themes
      .filter((theme) => {
        if (!validTheme(theme) || seen.has(theme.id)) return false;
        seen.add(theme.id);
        return true;
      })
      .map((theme) => ({
        id: theme.id,
        name: theme.name.trim(),
        baseId: theme.baseId,
        ...Object.fromEntries(
          ['light', 'dark'].map((mode) => [
            mode,
            Object.fromEntries(
              COLOR_ROLES.map(([token]) => [token, theme[mode][token].toLowerCase()])
            ),
          ])
        ),
      }));
  } catch {
    return [];
  }
}

export function getPalettes() {
  return [...BUILTIN_PALETTES, ...customThemes];
}
export function getPalette(id = activeId) {
  return getPalettes().find((theme) => theme.id === id) || BUILTIN_PALETTES[0];
}
export function getPaletteId() {
  return activeId;
}

function linkedTokens(token, value, colors, mode) {
  const ink = colors['--text-primary'];
  const accent = colors['--accent'];
  const border = colors['--border-color'];
  const secondary = colors['--bg-secondary'];
  const result = { [token]: value };
  if (token === '--bg-secondary' || token === '--text-primary') {
    result['--bg-tertiary'] = `color-mix(in srgb, ${secondary} 88%, ${ink})`;
  }
  if (token === '--border-color' || token === '--text-primary') {
    result['--border-hover'] = `color-mix(in srgb, ${border} 70%, ${ink})`;
  }
  if (token === '--bg-secondary') result['--code-bg'] = value;
  if (token === '--text-primary') result['--selection-fg'] = value;
  if (token === '--text-secondary') result['--text-muted'] = value;
  if (token === '--accent') {
    Object.assign(result, {
      '--link-color': value,
      '--accent-muted': value,
      '--blockquote-border': value,
      '--accent-glow': `color-mix(in srgb, ${accent} ${mode === 'dark' ? 18 : 12}%, transparent)`,
    });
  }
  if (token === '--highlight-bg') result['--selection-bg'] = value;
  return result;
}

function customTokens(theme, mode) {
  const base = getPalette(theme.baseId);
  const result = {};
  for (const [token] of COLOR_ROLES) {
    if (theme[mode][token] !== base[mode][token]) {
      Object.assign(result, linkedTokens(token, theme[mode][token], theme[mode], mode));
    }
  }
  return result;
}

function declarations(tokens) {
  return Object.entries(tokens)
    .map(([token, value]) => `${token}:${value};`)
    .join('');
}

function renderPaletteStyles() {
  let sheet = document.getElementById('website-palette-colors');
  if (!sheet) {
    sheet = document.createElement('style');
    sheet.id = 'website-palette-colors';
    document.head.appendChild(sheet);
  }
  const rules = [];
  for (const palette of BUILTIN_PALETTES.slice(1)) {
    for (const mode of ['light', 'dark']) {
      rules.push(
        `:root[data-palette="${palette.id}"][data-theme="${mode}"]{${declarations(palette[mode])}}`
      );
    }
  }
  for (const theme of customThemes) {
    for (const mode of ['light', 'dark']) {
      const selector = `:root[data-custom-theme="${theme.id}"][data-palette="${theme.baseId}"][data-theme="${mode}"]`;
      rules.push(`${selector}{${declarations(customTokens(theme, mode))}}`);
      const baseColors = getPalette(theme.baseId)[mode];
      for (const [token, pane] of [
        ['--bg-secondary', '.editor-pane'],
        ['--bg-surface', '.preview-pane'],
      ]) {
        if (theme[mode][token] !== baseColors[token]) {
          rules.push(`${selector} ${pane}{background:var(${token})}`);
        }
      }
      if (theme[mode]['--accent'] !== baseColors['--accent']) {
        rules.push(
          `${selector} .prose a{text-decoration-color:color-mix(in srgb,var(--link-color) 40%,transparent)}`,
          `${selector} .prose a:hover{text-decoration-color:var(--link-color)}`
        );
      }
      if (theme[mode]['--highlight-bg'] !== baseColors['--highlight-bg']) {
        rules.push(
          `${selector} .prose mark,${selector} .prose blockquote:not(.markdown-alert){background:var(--highlight-bg);color:var(--text-primary)}`
        );
      }
    }
  }
  sheet.textContent = `@media screen {${rules.join('\n')}}`;
}

export function syncThemeColor() {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}

export function setPalette(id, { persist = true } = {}) {
  const palette = getPalette(id);
  activeId = palette.id;
  const root = document.documentElement;
  root.dataset.palette = palette.baseId || palette.id;
  if (palette.baseId) root.dataset.customTheme = palette.id;
  else delete root.dataset.customTheme;
  const saved = !persist || setStorageItem(STORAGE_KEYS.PALETTE, palette.id);
  syncThemeColor();
  window.dispatchEvent(new CustomEvent('palette-change'));
  return saved;
}

export function loadPalette() {
  customThemes = readCatalog();
  renderPaletteStyles();
  setPalette(getStorageItem(STORAGE_KEYS.PALETTE), { persist: false });
}

function persistCatalog() {
  // Apply only unsaved local changes over the latest catalog from other tabs.
  const entries = new Map(readCatalog().map((entry) => [entry.id, entry]));
  for (const [id, theme] of pendingThemeChanges) {
    if (theme) entries.set(id, theme);
    else entries.delete(id);
  }
  customThemes = [...entries.values()];
  const saved = setStorageItem(
    STORAGE_KEYS.CUSTOM_THEMES,
    JSON.stringify({ version: 1, themes: customThemes })
  );
  if (saved) pendingThemeChanges.clear();
  renderPaletteStyles();
  return saved;
}

export function saveCustomTheme(theme) {
  if (!validTheme(theme)) throw new Error('Enter a name and valid colors for both appearances.');
  pendingThemeChanges.set(theme.id, structuredClone(theme));
  const saved = persistCatalog();
  return setPalette(theme.id) && saved;
}

export function deleteCustomTheme(id) {
  pendingThemeChanges.set(id, null);
  const saved = persistCatalog();
  if (activeId === id) setPalette('warm-paper');
  window.dispatchEvent(new CustomEvent('palette-change'));
  return saved;
}
