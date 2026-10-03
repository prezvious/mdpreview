import { dom } from './dom.js';
import { applyEditorText } from './editor-edit.js';
import { markdownSources, serializeSource } from './citations.js';
import { createCitationImportView } from './citation-import-view.js';

export function initCitations() {
  const dialog = document.getElementById('citationDialog');
  const open = document.getElementById('citationsBtn');
  const addView = document.getElementById('citationAddView');
  const pasteView = document.getElementById('citationPasteView');
  const form = document.getElementById('citationForm');
  const label = document.getElementById('citationLabel');
  const url = document.getElementById('citationUrl');
  const title = document.getElementById('citationTitle');
  const insert = document.getElementById('citationInsert');
  const message = document.getElementById('citationMessage');
  const modes = [...dialog.querySelectorAll('[data-citation-mode]')];
  let mode = 'add';
  let saved;
  let importState = { markdown: '', busy: false };
  const importer = createCitationImportView(pasteView, {
    prefix: 'citation',
    onChange(state) {
      importState = state;
      if (mode === 'paste') insert.disabled = state.busy || !state.markdown.trim();
    },
  });

  function setMode(nextMode) {
    mode = nextMode;
    addView.hidden = mode !== 'add';
    pasteView.hidden = mode !== 'paste';
    modes.forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.citationMode === mode))
    );
    insert.textContent = mode === 'add' ? 'Insert citation' : 'Insert response';
    insert.disabled = mode === 'paste' && (importState.busy || !importState.markdown.trim());
    (mode === 'add' ? url : importer.input).focus();
  }

  open.addEventListener('click', () => {
    saved = {
      text: dom.editor.value,
      start: dom.editor.selectionStart,
      end: dom.editor.selectionEnd,
    };
    const link = markdownSources(saved.text).links.find(
      (source) => source.start === saved.start && source.end === saved.end
    );
    if (link) {
      label.value = link.label;
      url.value = link.href;
      title.value = link.title;
    }
    message.textContent = '';
    dialog.showModal();
    setMode(mode);
  });
  modes.forEach((button) =>
    button.addEventListener('click', () => setMode(button.dataset.citationMode))
  );
  document.getElementById('citationCancel').addEventListener('click', () => dialog.close());

  async function insertContent(event) {
    event.preventDefault();
    if (insert.disabled) return;
    if (
      dom.editor.value !== saved.text ||
      dom.editor.selectionStart !== saved.start ||
      dom.editor.selectionEnd !== saved.end
    ) {
      message.textContent =
        'Draft changed. Close this dialog, choose an insertion point, and reopen Citations. Your imported response is kept.';
      return;
    }
    let text = importer.getMarkdown();
    if (mode === 'add') {
      if (!form.reportValidity()) return;
      try {
        text = serializeSource({ label: label.value, href: url.value, title: title.value });
      } catch (error) {
        message.textContent = error.message;
        url.focus();
        return;
      }
      if (saved.start && /\S/.test(saved.text[saved.start - 1])) text = ` ${text}`;
      if (saved.end < saved.text.length && /\S/.test(saved.text[saved.end])) text += ' ';
    }
    const next = saved.text.slice(0, saved.start) + text + saved.text.slice(saved.end);
    const position = saved.start + text.length;
    insert.disabled = true;
    // A modal prevents focusing the editor; close it before the native undo edit.
    dialog.close();
    const applied = await applyEditorText(next, {
      selectionStart: position,
      reason: mode === 'add' ? 'Before citation' : 'Before citation import',
    });
    if (!applied) {
      dialog.showModal();
      message.textContent = 'The edit was not applied. Your source information is still here.';
    }
    insert.disabled = mode === 'paste' && (importState.busy || !importState.markdown.trim());
  }
  form.addEventListener('submit', insertContent);
  insert.addEventListener('click', insertContent);
}
