import { COLOR_ROLES, getPalettes, getPalette, normalizeHex, saveCustomTheme } from './palettes.js';
import { getCurrentTheme } from './theme.js';

const byId = (id) => document.getElementById(id);
let draft;
let initialDraft;
let editingMode = 'light';
let editingExisting = false;
let confirmResolve;

export function confirmSettingsAction({
  title,
  description,
  accept = 'Discard',
  cancel = 'Keep editing',
}) {
  if (confirmResolve) return Promise.resolve(false);
  byId('settingsConfirmTitle').textContent = title;
  byId('settingsConfirmDescription').textContent = description;
  byId('settingsConfirmAccept').textContent = accept;
  byId('settingsConfirmCancel').textContent = cancel;
  return new Promise((resolve) => {
    confirmResolve = resolve;
    byId('settingsConfirmDialog').showModal();
    byId('settingsConfirmCancel').focus();
  });
}

function resolveConfirmation(accepted) {
  byId('settingsConfirmDialog').close();
  confirmResolve?.(accepted);
  confirmResolve = null;
}

function isDirty() {
  return draft && JSON.stringify(draft) !== initialDraft;
}

export async function closeThemeEditor() {
  const dialog = byId('themeEditorDialog');
  if (!dialog.open) return true;
  if (
    isDirty() &&
    !(await confirmSettingsAction({
      title: 'Discard theme changes?',
      description: 'Your unsaved colors and name will be discarded.',
    }))
  )
    return false;
  dialog.close();
  return true;
}

function luminance(hex) {
  const values = hex
    .slice(1)
    .match(/../g)
    .map((channel) => parseInt(channel, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

function contrast(ink, surface) {
  const a = luminance(ink);
  const b = luminance(surface);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function updatePreview() {
  const base = getPalette(draft.baseId)[editingMode];
  const colors = Object.fromEntries(
    COLOR_ROLES.map(([token]) => [token, normalizeHex(draft[editingMode][token]) || base[token]])
  );
  const preview = byId('customThemePreview');
  for (const [token, value] of Object.entries(colors)) preview.style.setProperty(token, value);
  const warnings = [];
  for (const [token, label] of [
    ['--text-primary', 'Text'],
    ['--text-secondary', 'Secondary text'],
    ['--accent', 'Links'],
  ]) {
    const surfaces =
      token === '--accent' ? ['--bg-surface'] : ['--bg-primary', '--bg-secondary', '--bg-surface'];
    if (token === '--text-primary') surfaces.push('--highlight-bg');
    const minimum = Math.min(
      ...surfaces.map((surface) => contrast(colors[token], colors[surface]))
    );
    if (minimum < 4.5) warnings.push(`${label}: ${minimum.toFixed(1)}:1`);
  }
  byId('customThemeWarnings').textContent = warnings.length
    ? `Some colors may be hard to read (${warnings.join('; ')}). Aim for 4.5:1. You can still save this theme.`
    : 'Text and links have readable contrast in this appearance.';
}

function highlightRole(token) {
  byId('customThemePreview')
    .querySelectorAll('[data-color-role]')
    .forEach((element) => {
      element.classList.toggle('is-highlighted', element.dataset.colorRole === token);
    });
}

function renderColorFields() {
  const fields = byId('customThemeColors');
  fields.replaceChildren();
  for (const [token, label] of COLOR_ROLES) {
    const row = document.createElement('div');
    row.className = 'theme-color-row';
    const name = document.createElement('label');
    const id = `themeColor-${token.slice(2)}`;
    name.htmlFor = id;
    name.textContent = label;
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value =
      normalizeHex(draft[editingMode][token]) || getPalette(draft.baseId)[editingMode][token];
    picker.setAttribute('aria-label', `${label} color picker`);
    const hex = document.createElement('input');
    hex.type = 'text';
    hex.id = id;
    hex.value = draft[editingMode][token];
    hex.maxLength = 7;
    hex.spellcheck = false;
    hex.setAttribute('aria-label', `${label} hex color`);
    const update = (raw) => {
      draft[editingMode][token] = normalizeHex(raw) || raw;
      const valid = Boolean(normalizeHex(raw));
      hex.setCustomValidity(valid ? '' : 'Use an opaque hex color, such as #c9e1f1.');
      hex.setAttribute('aria-invalid', String(!valid));
      if (valid) picker.value = normalizeHex(raw);
      updatePreview();
    };
    hex.addEventListener('input', () => update(hex.value));
    picker.addEventListener('input', () => {
      hex.value = picker.value;
      update(picker.value);
    });
    for (const input of [picker, hex]) input.addEventListener('focus', () => highlightRole(token));
    row.append(name, picker, hex);
    fields.appendChild(row);
    update(hex.value);
  }
  document.querySelectorAll('[data-edit-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.editMode === editingMode));
  });
}

export function openThemeEditor(id, { duplicate = false, create = false } = {}) {
  const theme = getPalette(id);
  editingExisting = Boolean(theme.baseId) && !duplicate && !create;
  let name = '';
  if (editingExisting) name = theme.name;
  else if (duplicate) name = `${theme.name} copy`.slice(0, 60);
  draft = {
    id: editingExisting ? theme.id : `custom-${crypto.randomUUID()}`,
    name,
    baseId: theme.baseId || theme.id,
    light: { ...theme.light },
    dark: { ...theme.dark },
  };
  editingMode = getCurrentTheme();
  const source = byId('customThemeBase');
  source.replaceChildren();
  for (const entry of getPalettes()) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.name;
    source.appendChild(option);
  }
  source.value = theme.id;
  source.disabled = editingExisting;
  byId('customThemeName').value = draft.name;
  byId('customThemeName').setCustomValidity('');
  byId('themeEditorTitle').textContent = editingExisting ? 'Edit theme' : 'Create theme';
  byId('themeEditorSubmit').textContent = editingExisting ? 'Save theme' : 'Create theme';
  renderColorFields();
  initialDraft = JSON.stringify(draft);
  byId('themeEditorDialog').showModal();
  byId('customThemeName').focus();
}

export function initThemeEditor() {
  const dialog = byId('themeEditorDialog');
  dialog.addEventListener('close', () => {
    if (document.documentElement.dataset.view !== 'settings') return;
    const selected = byId('settingsThemes').querySelector(`[data-theme-id="${draft.id}"]`);
    (selected || byId('themeCreateBtn')).focus({ preventScroll: true });
  });
  byId('settingsConfirmAccept').addEventListener('click', () => resolveConfirmation(true));
  byId('settingsConfirmCancel').addEventListener('click', () => resolveConfirmation(false));
  byId('settingsConfirmDialog').addEventListener('cancel', (event) => {
    event.preventDefault();
    resolveConfirmation(false);
  });
  byId('themeEditorCancel').addEventListener('click', () => void closeThemeEditor());
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    void closeThemeEditor();
  });
  byId('customThemeName').addEventListener('input', (event) => {
    draft.name = event.target.value;
  });
  byId('customThemeBase').addEventListener('change', (event) => {
    const base = getPalette(event.target.value);
    draft.baseId = base.baseId || base.id;
    draft.light = { ...base.light };
    draft.dark = { ...base.dark };
    renderColorFields();
  });
  document.querySelectorAll('[data-edit-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      editingMode = button.dataset.editMode;
      renderColorFields();
    });
  });
  byId('themeEditorForm').addEventListener('submit', (event) => {
    event.preventDefault();
    draft.name = byId('customThemeName').value.trim();
    if (!draft.name) {
      byId('customThemeName').setCustomValidity('Enter a theme name.');
      byId('customThemeName').reportValidity();
      return;
    }
    for (const mode of ['light', 'dark']) {
      if (COLOR_ROLES.some(([token]) => !normalizeHex(draft[mode][token]))) {
        editingMode = mode;
        renderColorFields();
        byId('themeEditorForm').reportValidity();
        return;
      }
    }
    saveCustomTheme(draft);
    initialDraft = JSON.stringify(draft);
    dialog.close();
  });
  byId('customThemeName').addEventListener('input', () =>
    byId('customThemeName').setCustomValidity('')
  );
  window.addEventListener('beforeunload', (event) => {
    if (dialog.open && isDirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}
