import { dom } from './dom.js';
import { STORAGE_KEYS } from './constants.js';
import { getStorageItem, setStorageItem, removeStorageItem } from './storage.js';
import { syncHljsThemeStyles } from './lazy-vendors.js';
import { prepareMermaidForRerender, renderMermaidDiagrams } from './preview.js';
import { loadPalette, syncThemeColor } from './palettes.js';

const { html } = dom;
let appearancePreference = 'system';

export function getAppearancePreference() {
  return appearancePreference;
}

export function setAppearancePreference(preference) {
  appearancePreference = ['light', 'dark'].includes(preference) ? preference : 'system';
  const saved =
    appearancePreference === 'system'
      ? removeStorageItem(STORAGE_KEYS.THEME)
      : setStorageItem(STORAGE_KEYS.THEME, appearancePreference);
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const resolved = appearancePreference === 'system' ? systemTheme : appearancePreference;
  setTheme(resolved, { persist: false });
  return saved;
}

export function setTheme(theme, { persist = true } = {}) {
  theme = theme === 'dark' ? 'dark' : 'light';
  html.setAttribute('data-theme', theme);
  if (persist) {
    appearancePreference = theme;
    setStorageItem(STORAGE_KEYS.THEME, theme);
  }

  syncHljsThemeStyles(theme === 'dark');
  syncThemeColor();

  prepareMermaidForRerender();
  renderMermaidDiagrams();
  window.dispatchEvent(new CustomEvent('appearance-change'));
}

export function toggleTheme() {
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
}

export function loadTheme() {
  loadPalette();
  const savedTheme = getStorageItem(STORAGE_KEYS.THEME);

  if (['light', 'dark'].includes(savedTheme)) {
    appearancePreference = savedTheme;
    setTheme(savedTheme, { persist: false });
  } else {
    appearancePreference = 'system';
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light', { persist: false });
  }
}

export function applyThemeVisual(theme) {
  html.setAttribute('data-theme', theme);
  syncHljsThemeStyles(theme === 'dark');
  syncThemeColor();
}

export function getCurrentTheme() {
  return html.getAttribute('data-theme') || 'light';
}
