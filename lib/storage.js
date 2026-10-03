/**
 * Safely get item from localStorage
 */
export function getStorageItem(key) {
  return readStorageItem(key).value;
}

/** Read a value without treating an unavailable store as an empty one. */
export function readStorageItem(key) {
  try {
    return { ok: true, value: localStorage.getItem(key) };
  } catch (e) {
    console.warn('localStorage not available:', e);
    return { ok: false, value: null };
  }
}

/**
 * Safely set item in localStorage
 */
export function setStorageItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn('localStorage not available:', e);
    window.dispatchEvent(new CustomEvent('preference-storage-error', { detail: { key } }));
    return false;
  }
}

export function removeStorageItem(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.warn('localStorage not available:', e);
    window.dispatchEvent(new CustomEvent('preference-storage-error', { detail: { key } }));
    return false;
  }
}
