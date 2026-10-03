const DB_NAME = 'md-preview-recovery';
const STORE_NAME = 'snapshots';
const MAX_SNAPSHOTS = 20;

let dbPromise;

function openHistory() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

/** Save a bounded recovery copy. Returns false if browser storage is unavailable. */
export async function saveSnapshot(content, reason) {
  try {
    const db = await openHistory();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const done = transactionDone(transaction);
    const [latest, keys] = await Promise.all([
      requestResult(store.openCursor(null, 'prev')),
      requestResult(store.getAllKeys()),
    ]);
    if (latest?.value.content !== content) {
      store.add({ content, reason, createdAt: Date.now() });
      for (const key of keys.slice(0, Math.max(0, keys.length + 1 - MAX_SNAPSHOTS))) {
        store.delete(key);
      }
    }
    await done;
    return true;
  } catch (error) {
    console.warn('Draft history unavailable:', error);
    return false;
  }
}

/** Newest first, or null when the history store cannot be read. */
export async function listSnapshots() {
  try {
    const db = await openHistory();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const entries = await requestResult(transaction.objectStore(STORE_NAME).getAll());
    return entries.reverse();
  } catch (error) {
    console.warn('Draft history unavailable:', error);
    return null;
  }
}
