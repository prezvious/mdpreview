import { STORAGE_KEYS } from './constants.js';
import { getStorageItem, setStorageItem } from './storage.js';
import { syncThemeColor } from './palettes.js';

export const DISPLAY_CONTROLS = {
  editorSize: { label: 'Editor text size', min: 80, max: 160, step: 5, default: 100, unit: '%' },
  previewSize: { label: 'Preview text size', min: 80, max: 160, step: 5, default: 100, unit: '%' },
  editorSpacing: {
    label: 'Editor line spacing',
    min: 1.2,
    max: 2.2,
    step: 0.05,
    default: 1.7,
    unit: '',
  },
  previewSpacing: {
    label: 'Preview line spacing',
    min: 1.2,
    max: 2.2,
    step: 0.05,
    default: 1.75,
    unit: '',
  },
  interfaceScale: { label: 'Interface scale', min: 90, max: 125, step: 5, default: 100, unit: '%' },
};
const defaults = Object.fromEntries(
  Object.entries(DISPLAY_CONTROLS).map(([key, control]) => [key, control.default])
);
let preferences = { ...defaults, contrast: 'normal' };

export function getDisplayPreferences() {
  return { ...preferences };
}

function applyDisplayPreferences() {
  const root = document.documentElement;
  root.dataset.websiteDisplay = 'true';
  root.dataset.contrast = preferences.contrast;
  for (const [key, value] of Object.entries(preferences)) {
    if (key === 'contrast') continue;
    const name = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    root.style.setProperty(`--website-${name}`, value);
  }
  syncThemeColor();
  window.dispatchEvent(new CustomEvent('display-preferences-change'));
}

export function loadDisplayPreferences() {
  try {
    const saved = JSON.parse(getStorageItem(STORAGE_KEYS.DISPLAY));
    if (saved?.version === 1) {
      for (const [key, control] of Object.entries(DISPLAY_CONTROLS)) {
        const value = saved[key];
        if (
          typeof value === 'number' &&
          Number.isFinite(value) &&
          value >= control.min &&
          value <= control.max
        ) {
          preferences[key] = Number(
            (control.min + Math.round((value - control.min) / control.step) * control.step).toFixed(
              2
            )
          );
        }
      }
      preferences.contrast = saved.contrast === 'high' ? 'high' : 'normal';
    }
  } catch {
    /* Use existing presentation for malformed preferences. */
  }
  applyDisplayPreferences();
}

export function setDisplayPreference(key, value) {
  const control = DISPLAY_CONTROLS[key];
  if (key === 'contrast') preferences.contrast = value === 'high' ? 'high' : 'normal';
  else if (control) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return false;
    preferences[key] = Number(
      Math.max(
        control.min,
        Math.min(
          control.max,
          control.min + Math.round((numeric - control.min) / control.step) * control.step
        )
      ).toFixed(2)
    );
  } else return false;
  applyDisplayPreferences();
  return setStorageItem(STORAGE_KEYS.DISPLAY, JSON.stringify({ version: 1, ...preferences }));
}

export function resetDisplayPreferences() {
  preferences = { ...defaults, contrast: 'normal' };
  applyDisplayPreferences();
  return setStorageItem(STORAGE_KEYS.DISPLAY, JSON.stringify({ version: 1, ...preferences }));
}
