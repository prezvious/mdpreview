import { dom } from './dom.js';
import { STORAGE_KEYS } from './constants.js';
import { readStorageItem } from './storage.js';
import { getPalettes, getPaletteId, setPalette, deleteCustomTheme } from './palettes.js';
import { getAppearancePreference, setAppearancePreference } from './theme.js';
import {
  DISPLAY_CONTROLS,
  getDisplayPreferences,
  setDisplayPreference,
  resetDisplayPreferences,
} from './display-preferences.js';
import { setLintEnabled, getCurrentLintWarnings, isLintEnabled } from './lint.js';
import { setAutomaticSuggestionsEnabled } from './completion.js';
import {
  setScrollSyncEnabled,
  handleViewportResize,
  pauseScrollSyncForNavigation,
} from './layout.js';
import { setRemoteImageBlocking } from './remote-images.js';
import { resetGutterCache, updateLineGutter, syncGutterScroll } from './gutter.js';
import { schedulePreviewUpdate } from './preview.js';
import { hideTooltip } from './tooltip.js';
import {
  initThemeEditor,
  openThemeEditor,
  closeThemeEditor,
  confirmSettingsAction,
} from './theme-editor.js';

const byId = (id) => document.getElementById(id);
const descriptions = {
  appearance: 'Make this space feel like yours.',
  writing: 'A little more room for your words.',
  privacy: 'You decide what your browser loads.',
};
let editorState;
let editorUrl;
let currentSettingsUrl;
let currentSection = 'appearance';
let settingsOpen = false;

function storageError() {
  const status = byId('settingsStorageStatus');
  status.hidden = false;
  status.textContent = 'Changes apply for this session, but could not be saved in this browser.';
}

function setSection(section, { focus = true } = {}) {
  currentSection = Object.hasOwn(descriptions, section) ? section : 'appearance';
  for (const name of Object.keys(descriptions)) {
    byId(`settings${name[0].toUpperCase()}${name.slice(1)}`).hidden = name !== currentSection;
  }
  document.querySelectorAll('[data-settings-section]').forEach((link) => {
    if (link.dataset.settingsSection === currentSection) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  byId('settingsTitle').textContent = currentSection[0].toUpperCase() + currentSection.slice(1);
  byId('settingsDescription').textContent = descriptions[currentSection];
  byId('settingsContent').scrollTop = 0;
  document.title = `Settings · ${byId('settingsTitle').textContent} — mdfor.dev`;
  if (focus) byId('settingsTitle').focus({ preventScroll: true });
}

function settingsUrl(section) {
  const url = new URL(location.href);
  url.searchParams.set('view', 'settings');
  url.searchParams.set('section', section);
  return url.pathname + url.search + url.hash;
}

function showSettings(section) {
  if (!settingsOpen) {
    editorState = {
      start: dom.editor.selectionStart,
      end: dom.editor.selectionEnd,
      direction: dom.editor.selectionDirection,
      editorScroll: dom.editor.scrollTop,
      previewScroll: dom.preview.scrollTop,
    };
  }
  settingsOpen = true;
  hideTooltip();
  byId('headerMenu').classList.remove('open');
  byId('headerMenuBtn').setAttribute('aria-expanded', 'false');
  byId('exportMenuPopover').hidden = true;
  byId('exportMenuBtn').setAttribute('aria-expanded', 'false');
  document.documentElement.dataset.view = 'settings';
  document.querySelector('.app').hidden = true;
  document.querySelector('.app').inert = true;
  byId('settingsPage').hidden = false;
  document.querySelector('.skip-link').href = '#settingsTitle';
  setSection(section);
  currentSettingsUrl = location.pathname + location.search + location.hash;
  syncControls();
}

function showEditor() {
  if (!settingsOpen) return;
  settingsOpen = false;
  delete document.documentElement.dataset.view;
  byId('settingsPage').hidden = true;
  document.querySelector('.app').hidden = false;
  document.querySelector('.app').inert = false;
  document.querySelector('.skip-link').href = '#mainContent';
  document.title = 'mdfor.dev — Instant Markdown Editor';
  handleViewportResize();
  resetGutterCache();
  updateLineGutter({ lintEnabled: isLintEnabled(), warnings: getCurrentLintWarnings() });
  pauseScrollSyncForNavigation();
  if (editorState) {
    dom.editor.setSelectionRange(editorState.start, editorState.end, editorState.direction);
    dom.editor.scrollTop = editorState.editorScroll;
    dom.preview.scrollTop = editorState.previewScroll;
    syncGutterScroll();
  }
  const trigger = byId('headerMenuBtn').getClientRects().length
    ? byId('headerMenuBtn')
    : dom.settingsBtn;
  trigger.focus({ preventScroll: true });
}

function openSettings() {
  editorUrl = location.pathname + location.search + location.hash;
  history.pushState(
    { ...history.state, settingsEntry: true, editorUrl },
    '',
    settingsUrl('appearance')
  );
  showSettings('appearance');
}

async function backToEditor() {
  if (!(await closeThemeEditor())) return;
  if (history.state?.settingsEntry) history.back();
  else {
    const url = new URL(location.href);
    url.searchParams.delete('view');
    url.searchParams.delete('section');
    history.replaceState(history.state, '', editorUrl || url.pathname + url.search + url.hash);
    showEditor();
  }
}

function renderThemes() {
  const grid = byId('settingsThemes');
  const previous = document.activeElement;
  const previousId = previous?.dataset.themeId;
  grid.replaceChildren();
  for (const theme of getPalettes()) {
    const card = document.createElement('div');
    card.className = 'theme-card';
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'theme-card-select';
    select.dataset.themeId = theme.id;
    select.setAttribute('aria-pressed', String(theme.id === getPaletteId()));
    select.setAttribute('aria-label', theme.name);
    const orbs = document.createElement('span');
    orbs.className = 'theme-orbs';
    orbs.setAttribute('aria-hidden', 'true');
    for (const mode of ['light', 'dark']) {
      const preview = document.createElement('span');
      preview.className = 'theme-orb-preview';
      const orb = document.createElement('span');
      orb.className = 'theme-orb';
      orb.style.setProperty('--orb-surface', theme[mode]['--bg-surface']);
      orb.style.setProperty('--orb-accent', theme[mode]['--accent']);
      orb.style.setProperty('--orb-secondary', theme[mode]['--bg-secondary']);
      const label = document.createElement('span');
      label.className = 'theme-orb-label';
      label.textContent = mode === 'light' ? 'Light' : 'Dark';
      preview.append(orb, label);
      orbs.appendChild(preview);
    }
    const name = document.createElement('span');
    name.className = 'theme-card-name';
    name.textContent = theme.name;
    select.append(orbs, name);
    const check = document.createElement('span');
    check.className = 'theme-card-check';
    check.textContent = theme.id === getPaletteId() ? '✓' : '';
    check.setAttribute('aria-hidden', 'true');
    select.addEventListener('click', () => setPalette(theme.id));
    const actions = document.createElement('div');
    actions.className = 'theme-card-actions';
    const choices = theme.baseId ? ['Edit', 'Duplicate', 'Delete'] : ['Duplicate'];
    for (const action of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action;
      button.setAttribute('aria-label', `${action} ${theme.name}`);
      button.addEventListener('click', async () => {
        if (action !== 'Delete') {
          openThemeEditor(theme.id, { duplicate: action === 'Duplicate' });
          return;
        }
        if (
          await confirmSettingsAction({
            title: 'Delete theme?',
            description: `Delete “${theme.name}” from this device?`,
            accept: 'Delete theme',
            cancel: 'Cancel',
          })
        ) {
          deleteCustomTheme(theme.id);
          byId('themeCreateBtn').focus();
        }
      });
      actions.appendChild(button);
    }
    card.append(select, check, actions);
    grid.appendChild(card);
  }
  if (previousId)
    grid.querySelector(`[data-theme-id="${previousId}"]`)?.focus({ preventScroll: true });
}

function renderSliders() {
  for (const [key, control] of Object.entries(DISPLAY_CONTROLS)) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    const label = document.createElement('label');
    label.htmlFor = `setting-${key}`;
    label.textContent = control.label;
    const range = document.createElement('div');
    range.className = 'settings-range';
    const input = document.createElement('input');
    input.type = 'range';
    input.id = label.htmlFor;
    input.min = control.min;
    input.max = control.max;
    input.step = control.step;
    const output = document.createElement('output');
    output.htmlFor = input.id;
    output.id = `value-${key}`;
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Reset';
    reset.setAttribute('aria-label', `Reset ${control.label.toLowerCase()}`);
    input.addEventListener('input', () => setDisplayPreference(key, input.value));
    reset.addEventListener('click', () => setDisplayPreference(key, control.default));
    range.append(input, output, reset);
    row.append(label, range);
    byId(key === 'interfaceScale' ? 'appearanceSliders' : 'writingSliders').appendChild(row);
  }
}

function syncControls() {
  const preferences = getDisplayPreferences();
  document.querySelectorAll('[data-appearance]').forEach((button) => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.appearance === getAppearancePreference())
    );
  });
  document.querySelectorAll('[data-contrast-choice]').forEach((button) => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.contrastChoice === preferences.contrast)
    );
  });
  for (const [key, control] of Object.entries(DISPLAY_CONTROLS)) {
    byId(`setting-${key}`).value = preferences[key];
    byId(`value-${key}`).textContent = control.unit
      ? `${preferences[key]}${control.unit}`
      : preferences[key].toFixed(2);
  }
}

export function initSettings() {
  renderSliders();
  initThemeEditor();
  renderThemes();
  syncControls();
  dom.settingsBtn.addEventListener('click', openSettings);
  byId('settingsBack').addEventListener('click', () => void backToEditor());
  document.querySelector('.settings-brand').addEventListener('click', (event) => {
    event.preventDefault();
    void backToEditor();
  });
  document.querySelectorAll('[data-settings-section]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      history.replaceState(history.state, '', settingsUrl(link.dataset.settingsSection));
      setSection(link.dataset.settingsSection);
      currentSettingsUrl = location.pathname + location.search + location.hash;
    });
  });
  document.querySelectorAll('[data-appearance]').forEach((button) => {
    button.addEventListener('click', () => setAppearancePreference(button.dataset.appearance));
  });
  document.querySelectorAll('[data-contrast-choice]').forEach((button) => {
    button.addEventListener('click', () =>
      setDisplayPreference('contrast', button.dataset.contrastChoice)
    );
  });
  byId('themeCreateBtn').addEventListener('click', () =>
    openThemeEditor(getPaletteId(), { create: true })
  );
  byId('settingsReset').addEventListener('click', async () => {
    if (
      !(await confirmSettingsAction({
        title: 'Reset preferences?',
        description:
          'Restore default appearance and writing preferences? Your document, history, saved themes, and pane layout will be kept.',
        accept: 'Reset preferences',
        cancel: 'Cancel',
      }))
    )
      return;
    setAppearancePreference('system');
    setPalette('warm-paper');
    resetDisplayPreferences();
    setLintEnabled(false);
    setAutomaticSuggestionsEnabled(true);
    setScrollSyncEnabled(false);
    setRemoteImageBlocking(false);
    schedulePreviewUpdate({ force: true });
    byId('settingsReset').focus();
  });
  window.addEventListener('palette-change', renderThemes);
  window.addEventListener('appearance-change', syncControls);
  window.addEventListener('display-preferences-change', () => {
    syncControls();
    resetGutterCache();
    if (!settingsOpen)
      updateLineGutter({ lintEnabled: isLintEnabled(), warnings: getCurrentLintWarnings() });
  });
  window.addEventListener('preference-storage-error', (event) => {
    if (event.detail.key !== STORAGE_KEYS.CONTENT) storageError();
  });
  if (!readStorageItem(STORAGE_KEYS.DISPLAY).ok) storageError();
  window.addEventListener('popstate', async () => {
    if (!(await closeThemeEditor())) {
      history.pushState({ settingsEntry: Boolean(editorUrl), editorUrl }, '', currentSettingsUrl);
      return;
    }
    const url = new URL(location.href);
    if (url.searchParams.get('view') === 'settings') showSettings(url.searchParams.get('section'));
    else showEditor();
  });
  const url = new URL(location.href);
  if (url.searchParams.get('view') === 'settings') showSettings(url.searchParams.get('section'));
}
