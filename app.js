/**
 * MD Preview — Application entry
 * Thin orchestrator wiring modules and event listeners
 */

import './lib/fonts.js';
import './styles.css';

import { dom } from './lib/dom.js';
import { bindPreviewLinkListeners, configureMarked, schedulePreviewUpdate } from './lib/preview.js';
import { updateLineGutter, syncGutterScroll, resetGutterCache } from './lib/gutter.js';
import { initTooltips } from './lib/tooltip.js';
import {
  debouncedLint,
  getCurrentLintWarnings,
  isLintEnabled,
  loadLintPreference,
  runInitialLint,
  toggleLint,
} from './lib/lint.js';
import { loadTheme, setTheme, getAppearancePreference } from './lib/theme.js';
import { loadDisplayPreferences } from './lib/display-preferences.js';
import { initSettings } from './lib/settings.js';
import {
  bindResizeListeners,
  handleViewportResize,
  initMobileView,
  isMobile,
  loadCollapseState,
  loadEditorWidth,
  loadScrollSyncPreference,
  setMobileView,
  switchToPreviewAfterPaste,
  throttledSyncEditorToPreview,
  throttledSyncPreviewToEditor,
  toggleCollapse,
  toggleScrollSync,
} from './lib/layout.js';
import {
  debouncedSave,
  initDraftSafety,
  loadContent,
  markContentDirty,
  normalizeEditorPosition,
  resetPaneScrollPositions,
  saveContent,
} from './lib/content.js';
import { bindImportExportListeners, downloadMarkdown } from './lib/import-export.js';
import { bindShortcuts } from './lib/shortcuts.js';
import { bindHeaderMenuListeners } from './lib/header-menu.js';
import { renderStaticIcons } from './lib/icons.js';
import { initMediaViewer } from './lib/media-viewer.js';
import { registerServiceWorker } from './lib/offline.js';
import {
  loadRemoteImagePreference,
  resetRemoteImageAllowance,
  toggleRemoteImageBlocking,
} from './lib/remote-images.js';
import { initDocumentNavigation } from './lib/document-navigation.js';
import { initCompletion } from './lib/completion.js';
import { initCitations } from './lib/citation-ui.js';

const {
  editor,
  preview,
  editorPane,
  collapseBtn,
  scrollSyncToggle,
  lintToggle,
  remoteImagesToggle,
  viewTabs,
} = dom;

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

function refreshGutter() {
  updateLineGutter({
    lintEnabled: isLintEnabled(),
    warnings: getCurrentLintWarnings(),
  });
}

function replaceDocumentText(text) {
  editor.value = text;
  resetRemoteImageAllowance();
  resetGutterCache();
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function setupEventListeners() {
  editor.addEventListener('input', () => {
    markContentDirty();
    schedulePreviewUpdate();
    refreshGutter();
    debouncedSave();
    debouncedLint(editor.value);
  });

  editor.addEventListener('paste', () => {
    setTimeout(() => {
      refreshGutter();
      debouncedSave();
      debouncedLint(editor.value);
      switchToPreviewAfterPaste();
    }, 0);
  });

  bindImportExportListeners();
  bindShortcuts();
  bindHeaderMenuListeners();
  bindPreviewLinkListeners();

  if (collapseBtn) {
    collapseBtn.addEventListener('click', toggleCollapse);
  }

  if (editorPane) {
    editorPane.addEventListener('click', (e) => {
      if (
        editorPane.classList.contains('collapsed') &&
        e.target !== collapseBtn &&
        !collapseBtn.contains(e.target)
      ) {
        toggleCollapse();
      }
    });
  }

  bindResizeListeners();

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (getAppearancePreference() === 'system') {
      setTheme(e.matches ? 'dark' : 'light', { persist: false });
    }
  });

  if (scrollSyncToggle) {
    scrollSyncToggle.addEventListener('click', toggleScrollSync);
  }

  if (lintToggle) {
    lintToggle.addEventListener('click', toggleLint);
  }

  if (remoteImagesToggle) {
    remoteImagesToggle.addEventListener('click', () => {
      toggleRemoteImageBlocking();
      schedulePreviewUpdate({ force: true });
    });
  }

  viewTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      setMobileView(tab.dataset.view);
    });
  });

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(handleViewportResize, 100);
  });

  editor.addEventListener('scroll', () => {
    syncGutterScroll();
    if (!isMobile()) {
      throttledSyncEditorToPreview();
    }
  });

  preview.addEventListener('scroll', () => {
    if (!isMobile()) {
      throttledSyncPreviewToEditor();
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (!saveContent()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

function init() {
  renderStaticIcons();
  initMediaViewer();
  initTooltips();
  configureMarked();
  loadTheme();
  loadDisplayPreferences();
  loadCollapseState();
  loadEditorWidth();
  loadScrollSyncPreference();
  loadLintPreference();
  loadRemoteImagePreference();
  loadContent();
  refreshGutter();
  resetPaneScrollPositions();
  normalizeEditorPosition();
  setupEventListeners();
  initDraftSafety({ onReplace: replaceDocumentText, onDownload: downloadMarkdown });
  initDocumentNavigation();
  initCompletion();
  initCitations();
  initMobileView();
  initSettings();
  runInitialLint();
  registerServiceWorker();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
