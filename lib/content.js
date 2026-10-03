import { dom } from './dom.js';
import { STORAGE_KEYS, DEFAULT_CONTENT, DEBOUNCE_DELAY } from './constants.js';
import { readStorageItem, setStorageItem } from './storage.js';
import { debounce } from './utils.js';
import { updatePreview } from './preview.js';
import { listSnapshots, saveSnapshot } from './draft-history.js';
import { isMobile, setCollapsed, setMobileView } from './layout.js';

const {
  editor,
  preview,
  saveStatus,
  draftAlert,
  draftAlertText,
  draftAlertOpenBtn,
  saveDownloadBtn,
  draftConflict,
  draftConflictMessage,
  keepLocalDraftBtn,
  useOtherDraftBtn,
  conflictDownloadBtn,
  historyBtn,
  historyDialog,
  historyList,
  historyCloseBtn,
} = dom;

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const PENDING_DRAFT_KEY = 'md-preview-pending-conflict-draft';
let savedText = null;
let hasConflict = false;
let lastSnapshotAt = 0;
let snapshotQueue = Promise.resolve(true);
let displayedSnapshots = [];
let downloadedConflictCopy = false;
let overwriteWithoutBackupConfirmed = false;

function readPendingDraft() {
  try {
    return sessionStorage.getItem(PENDING_DRAFT_KEY);
  } catch {
    return null;
  }
}

function preservePendingDraft() {
  try {
    sessionStorage.setItem(PENDING_DRAFT_KEY, editor.value);
  } catch {
    // The fixed warning and download action remain available.
  }
}

function clearPendingDraft() {
  try {
    sessionStorage.removeItem(PENDING_DRAFT_KEY);
  } catch {
    // Session storage may be blocked along with local storage.
  }
}

function setSaveState(state, message) {
  if (!saveStatus) return;
  saveStatus.dataset.state = state;
  saveStatus.textContent = message;
  if (saveDownloadBtn) saveDownloadBtn.hidden = state !== 'error';
  if (draftAlert) draftAlert.hidden = state !== 'error' && state !== 'conflict';
  if (draftAlertText) draftAlertText.textContent = message;
}

function clearConflict() {
  hasConflict = false;
  downloadedConflictCopy = false;
  overwriteWithoutBackupConfirmed = false;
  clearPendingDraft();
  if (draftConflict) draftConflict.hidden = true;
}

function showConflict() {
  if (!hasConflict) void queueSnapshot(editor.value, 'Unresolved tab conflict');
  hasConflict = true;
  preservePendingDraft();
  if (draftConflict) draftConflict.hidden = false;
  if (draftConflictMessage) {
    draftConflictMessage.textContent =
      'This draft changed in another tab. Autosave is paused until you choose a version.';
  }
  setSaveState('conflict', 'Another tab changed this draft');
}

function queueSnapshot(content, reason) {
  snapshotQueue = snapshotQueue.then(() => saveSnapshot(content, reason));
  return snapshotQueue;
}

/** Keep a previous saved version at most once every five minutes. */
function maybeSnapshotPrevious(previous, next) {
  if (!previous || previous === DEFAULT_CONTENT || previous === next) return;
  const now = Date.now();
  if (now - lastSnapshotAt < SNAPSHOT_INTERVAL_MS) return;
  lastSnapshotAt = now;
  void queueSnapshot(previous, 'Earlier draft');
}

export function markContentDirty() {
  downloadedConflictCopy = false;
  overwriteWithoutBackupConfirmed = false;
  if (hasConflict) {
    preservePendingDraft();
    return;
  }
  if (editor.value === savedText) {
    setSaveState('saved', 'Saved on this device');
  } else {
    setSaveState('saving', 'Saving…');
  }
}

/** Return whether the current editor text is safely saved in this browser. */
export function saveContent({ force = false } = {}) {
  const current = readStorageItem(STORAGE_KEYS.CONTENT);
  if (!current.ok) {
    setSaveState('error', 'Could not save in this browser');
    return false;
  }

  if (!force && current.value !== savedText && current.value !== editor.value) {
    showConflict();
    return false;
  }
  if (current.value === editor.value) {
    savedText = current.value;
    clearConflict();
    setSaveState('saved', 'Saved on this device');
    return true;
  }
  if (!force && hasConflict) {
    showConflict();
    return false;
  }

  const previous = savedText;
  if (!setStorageItem(STORAGE_KEYS.CONTENT, editor.value)) {
    setSaveState('error', 'Could not save in this browser');
    return false;
  }
  savedText = editor.value;
  clearConflict();
  setSaveState('saved', 'Saved on this device');
  maybeSnapshotPrevious(previous, savedText);
  return true;
}

export function loadContent() {
  const stored = readStorageItem(STORAGE_KEYS.CONTENT);
  savedText = stored.value;
  editor.value = stored.value !== null ? stored.value : DEFAULT_CONTENT;
  const pending = readPendingDraft();
  if (stored.ok && pending !== null && pending !== stored.value) {
    editor.value = pending;
    showConflict();
  } else if (!stored.ok) {
    setSaveState('error', 'Autosave unavailable — download your work');
  } else if (stored.value === null) {
    setSaveState('ready', 'Starter document');
  } else {
    setSaveState('saved', 'Saved on this device');
  }
  if (!hasConflict) clearPendingDraft();
  updatePreview({ force: true });
}

function onOtherTabChange(event) {
  if (event.key !== STORAGE_KEYS.CONTENT && event.key !== null) return;
  const next = event.key === null ? null : event.newValue;
  if (next === savedText) return;
  if (next === editor.value) {
    savedText = next;
    clearConflict();
    setSaveState('saved', 'Saved on this device');
    return;
  }
  overwriteWithoutBackupConfirmed = false;
  showConflict();
}

async function keepLocalDraft() {
  const remote = readStorageItem(STORAGE_KEYS.CONTENT);
  if (!remote.ok) {
    setSaveState('error', 'Could not save in this browser');
    return;
  }
  if (remote.value !== null && remote.value !== editor.value) {
    const preserved = await queueSnapshot(remote.value, 'Other tab before overwrite');
    if (!preserved && !overwriteWithoutBackupConfirmed) {
      overwriteWithoutBackupConfirmed = true;
      if (draftConflictMessage) {
        draftConflictMessage.textContent =
          "Could not back up the other tab's version. Choose Keep this version again to overwrite it anyway.";
      }
      return;
    }
  }
  const latest = readStorageItem(STORAGE_KEYS.CONTENT);
  if (!latest.ok) {
    setSaveState('error', 'Could not save in this browser');
    return;
  }
  if (latest.value !== remote.value) {
    overwriteWithoutBackupConfirmed = false;
    showConflict();
    return;
  }
  saveContent({ force: true });
}

async function useOtherDraft(onReplace) {
  const remote = readStorageItem(STORAGE_KEYS.CONTENT);
  if (!remote.ok) {
    setSaveState('error', 'Could not read the other draft');
    return;
  }
  const localText = editor.value;
  if (localText !== savedText && localText !== remote.value) {
    const preserved = await queueSnapshot(localText, 'Before switching tabs');
    if (!preserved && !downloadedConflictCopy) {
      if (draftConflictMessage) {
        draftConflictMessage.textContent =
          'Recovery history is unavailable. Download your draft before switching.';
      }
      return;
    }
  }
  if (editor.value !== localText) return;
  const latest = readStorageItem(STORAGE_KEYS.CONTENT);
  if (!latest.ok) {
    setSaveState('error', 'Could not read the other draft');
    return;
  }
  savedText = latest.value;
  clearConflict();
  onReplace(latest.value ?? '');
  setSaveState('saved', 'Loaded from the other tab');
}

async function openHistory() {
  if (!historyDialog || !historyList) return;
  await snapshotQueue;
  const snapshots = await listSnapshots();
  displayedSnapshots = snapshots ?? [];
  historyList.replaceChildren();

  if (snapshots === null || displayedSnapshots.length === 0) {
    const item = document.createElement('li');
    item.textContent =
      snapshots === null
        ? 'Recovery history is unavailable in this browser.'
        : 'No recovery versions are available yet.';
    historyList.appendChild(item);
  } else {
    for (const snapshot of displayedSnapshots) {
      const item = document.createElement('li');
      item.className = 'history-item';
      const details = document.createElement('div');
      const time = document.createElement('strong');
      time.textContent = new Date(snapshot.createdAt).toLocaleString();
      const summary = document.createElement('span');
      const firstLine = snapshot.content.split('\n').find((line) => line.trim()) ?? '(empty draft)';
      summary.textContent = `${snapshot.reason} · ${firstLine.slice(0, 90)}`;
      details.append(time, summary);
      const restore = document.createElement('button');
      restore.type = 'button';
      restore.className = 'history-restore';
      restore.dataset.id = String(snapshot.id);
      restore.textContent = 'Restore';
      item.append(details, restore);
      historyList.appendChild(item);
    }
  }
  historyDialog.showModal();
}

async function restoreSnapshot(id, onReplace) {
  const snapshot = displayedSnapshots.find((entry) => entry.id === id);
  if (!snapshot) return;
  const current = readStorageItem(STORAGE_KEYS.CONTENT);
  if (!current.ok) {
    setSaveState('error', 'Could not save in this browser');
    return;
  }
  if (current.value !== savedText) {
    showConflict();
    historyDialog.close();
    return;
  }
  const localText = editor.value;
  if (localText !== snapshot.content) {
    const preserved = await queueSnapshot(localText, 'Before restoring history');
    if (!preserved) {
      setSaveState('error', 'Could not preserve the current draft');
      return;
    }
  }
  if (editor.value !== localText) return;
  const latest = readStorageItem(STORAGE_KEYS.CONTENT);
  if (!latest.ok || latest.value !== savedText) {
    if (latest.ok) showConflict();
    else setSaveState('error', 'Could not save in this browser');
    historyDialog.close();
    return;
  }
  onReplace(snapshot.content);
  saveContent();
  historyDialog.close();
}

export function initDraftSafety({ onReplace, onDownload }) {
  window.addEventListener('storage', onOtherTabChange);
  draftAlertOpenBtn?.addEventListener('click', () => {
    if (isMobile()) setMobileView('editor');
    else setCollapsed(false);
    if (hasConflict) keepLocalDraftBtn?.focus();
    else saveDownloadBtn?.focus();
  });
  saveDownloadBtn?.addEventListener('click', onDownload);
  conflictDownloadBtn?.addEventListener('click', () => {
    onDownload();
    downloadedConflictCopy = true;
  });
  keepLocalDraftBtn?.addEventListener('click', keepLocalDraft);
  useOtherDraftBtn?.addEventListener('click', () => useOtherDraft(onReplace));
  historyBtn?.addEventListener('click', openHistory);
  historyCloseBtn?.addEventListener('click', () => historyDialog?.close());
  historyList?.addEventListener('click', (event) => {
    const button = event.target.closest('.history-restore');
    if (button) void restoreSnapshot(Number(button.dataset.id), onReplace);
  });
}

export function captureSnapshot(content, reason) {
  return queueSnapshot(content, reason);
}

export function normalizeEditorPosition() {
  if (!editor) return;
  editor.setSelectionRange(0, 0);
  editor.scrollTop = 0;
}

export function resetPaneScrollPositions() {
  if (editor) editor.scrollTop = 0;
  if (preview) preview.scrollTop = 0;
}

export function editorHasContent() {
  return editor.value.trim().length > 0;
}

export const debouncedSave = debounce(saveContent, DEBOUNCE_DELAY);
