import {
  AI_CITATION_PROMPT,
  missingSourceMarkers,
  renderCitationMarkdown,
  sourceGroups,
  updateSource,
} from './citations.js';
import { normalizeCitationClipboard } from './citation-import.js';

/** Shared paste, review, and preview surface for both entry points. */
export function createCitationImportView(container, { prefix, onChange }) {
  container.innerHTML = `
    <div class="citation-import-controls">
      <label for="${prefix}-candidate">Copy format</label>
      <select id="${prefix}-candidate" disabled><option>Paste a response to compare formats</option></select>
      <button type="button" data-role="prompt">Copy AI prompt</button>
    </div>
    <div class="citation-import-columns">
      <div class="citation-input-column">
        <label for="${prefix}-input">Paste response / edit Markdown</label>
        <textarea id="${prefix}-input" spellcheck="false" placeholder="Paste an AI response here. Source URLs stay in your Markdown."></textarea>
      </div>
      <section class="citation-output-column" aria-label="Citation preview">
        <h3>Preview</h3>
        <div class="citation-import-preview prose" data-role="preview"></div>
      </section>
    </div>
    <p class="citation-import-status" data-role="status" role="status" aria-live="polite">Paste a response, or type Markdown with source links.</p>
    <details class="citation-source-review">
      <summary data-role="summary">Review source links</summary>
      <p>Check a link to display it as a citation. Edit its label below.</p>
      <div data-role="sources"></div>
    </details>`;
  const input = container.querySelector('textarea');
  const candidate = container.querySelector('select');
  const preview = container.querySelector('[data-role="preview"]');
  const status = container.querySelector('[data-role="status"]');
  const sources = container.querySelector('[data-role="sources"]');
  const summary = container.querySelector('[data-role="summary"]');
  let candidates = [];
  let selectedCandidateId = '';
  let warnings = [];
  let revision = 0;
  let busy = false;

  function saveCandidateEdits() {
    const current = candidates.find((item) => item.id === selectedCandidateId);
    if (current) current.markdown = input.value;
  }

  function render() {
    const markdown = input.value;
    const groups = sourceGroups(markdown);
    const missing = missingSourceMarkers(markdown);
    preview.replaceChildren(renderCitationMarkdown(markdown));
    if (!markdown.trim()) preview.textContent = 'Your response will appear here.';
    sources.replaceChildren();
    groups.forEach((group, index) => {
      const row = document.createElement('div');
      row.className = 'citation-source-row';
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = group.cite;
      checkbox.indeterminate = !group.cite && group.occurrences.some((link) => link.cite);
      checkbox.setAttribute('aria-label', `Display ${group.label} as a citation`);
      label.append(checkbox, document.createTextNode('Citation'));
      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.value = group.label;
      labelInput.setAttribute('aria-label', `Source label ${index + 1}`);
      const destination = document.createElement('a');
      destination.href = group.href;
      destination.textContent = group.href;
      destination.target = '_blank';
      destination.rel = 'noopener noreferrer';
      checkbox.addEventListener('change', () => {
        input.value = updateSource(input.value, group, { cite: checkbox.checked });
        saveCandidateEdits();
        revision++;
        busy = false;
        render();
        sources.children[index]?.querySelector('input')?.focus();
      });
      labelInput.addEventListener('change', () => {
        input.value = updateSource(input.value, group, { label: labelInput.value });
        saveCandidateEdits();
        revision++;
        busy = false;
        render();
        sources.children[index]?.querySelector('input[type="text"]')?.focus();
      });
      row.append(label, labelInput, destination);
      sources.appendChild(row);
    });
    summary.textContent = `Review source links (${groups.length})`;
    const count = groups.filter((group) => group.occurrences.some((link) => link.cite)).length;
    let message = markdown.trim()
      ? `${groups.length} source link${groups.length === 1 ? '' : 's'} · ${count} citation${count === 1 ? '' : 's'}.`
      : 'Paste a response, or type Markdown with source links.';
    if (markdown.trim() && !groups.length)
      message += ' No source URLs found. Add missing URLs manually.';
    if (missing.length)
      message += ` ${missing.length} unresolved citation marker${missing.length === 1 ? '' : 's'}; attach the source URLs before using them.`;
    status.textContent = [...warnings, message].join(' ');
    if (!groups.length) sources.textContent = 'No linked sources yet.';
    onChange?.({ markdown, busy, missing });
  }

  input.addEventListener('input', () => {
    saveCandidateEdits();
    revision++;
    busy = false;
    warnings = [];
    render();
  });
  input.addEventListener('paste', async (event) => {
    if (!event.clipboardData) return;
    if (input.value && (input.selectionStart !== 0 || input.selectionEnd !== input.value.length))
      return;
    const text = event.clipboardData.getData('text/plain');
    const html = event.clipboardData.getData('text/html');
    if (!text && !html) return;
    event.preventDefault();
    const currentRevision = ++revision;
    selectedCandidateId = '';
    candidate.disabled = true;
    input.value = text;
    busy = true;
    render();
    status.textContent = 'Reading copied content…';
    const result = await normalizeCitationClipboard({ text, html });
    if (currentRevision !== revision) return;
    candidates = result.candidates;
    warnings = result.warnings;
    input.value = result.markdown;
    candidate.replaceChildren();
    for (const item of candidates) candidate.add(new Option(item.label, item.id));
    candidate.value = result.selectedId;
    selectedCandidateId = result.selectedId;
    candidate.disabled = candidates.length < 2;
    busy = false;
    render();
  });
  candidate.addEventListener('change', () => {
    saveCandidateEdits();
    const item = candidates.find((option) => option.id === candidate.value);
    if (!item) return;
    input.value = item.markdown;
    selectedCandidateId = item.id;
    revision++;
    busy = false;
    render();
  });
  container.querySelector('[data-role="prompt"]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(AI_CITATION_PROMPT);
      status.textContent =
        'Copied AI prompt. Ask your AI to use this format for portable citations.';
    } catch {
      status.textContent = `Copy this prompt: ${AI_CITATION_PROMPT}`;
    }
  });
  render();
  return {
    input,
    getMarkdown: () => input.value,
  };
}
