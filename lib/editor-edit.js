import { dom } from './dom.js';
import { captureSnapshot } from './content.js';
import { showToast } from './preview.js';

/** Replace the smallest changed range so textarea undo stays a single action. */
export async function applyEditorText(
  next,
  { selectionStart, selectionEnd, reason = 'Before edit' } = {}
) {
  const editor = dom.editor;
  const previous = editor.value;
  if (next === previous) return false;
  const originalSelection = [editor.selectionStart, editor.selectionEnd];

  let from = 0;
  while (from < previous.length && from < next.length && previous[from] === next[from]) from++;
  let oldEnd = previous.length;
  let newEnd = next.length;
  while (oldEnd > from && newEnd > from && previous[oldEnd - 1] === next[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  const insert = next.slice(from, newEnd);
  editor.focus();
  editor.setSelectionRange(from, oldEnd);
  let inputFired = false;
  const onInput = () => {
    inputFired = true;
  };
  editor.addEventListener('input', onInput, { once: true });
  let nativeUndo = false;
  try {
    nativeUndo = document.execCommand('insertText', false, insert);
  } catch {
    // Some browsers disable the native textarea editing command.
  } finally {
    editor.removeEventListener('input', onInput);
  }
  const fallback = !nativeUndo || editor.value !== next;
  if (fallback) {
    const attempted = editor.value;
    const preserved = await captureSnapshot(previous, reason);
    if (editor.value !== attempted) {
      showToast('Draft changed — try the edit again');
      return false;
    }
    if (!preserved) {
      editor.value = previous;
      editor.setSelectionRange(...originalSelection);
      if (attempted !== previous) editor.dispatchEvent(new Event('input', { bubbles: true }));
      showToast('Could not create a recovery copy. Edit was not applied.');
      return false;
    }
    editor.value = next;
    showToast('Edit applied. Restore the previous draft from History if needed.');
  }
  if (!inputFired || fallback) editor.dispatchEvent(new Event('input', { bubbles: true }));
  const start = selectionStart ?? from + insert.length;
  editor.setSelectionRange(start, selectionEnd ?? start);
  return true;
}
