# Citation chips and AI response import

Date: 2026-09-30

Status: Approved by the user on 2026-09-30; implemented and verified.

## Decision

Build one citation/import module and use it in two places:

1. The existing md-preview editor, with inline citation rendering, an Add citation action, and a Paste with citations workflow.
2. A separate citation playground page in this repository, with paste input, editable Markdown, rendered output, and copy/download actions.

The standalone page is a separate tool with the same implementation, rather than a second product with duplicate parsing rules. It will run through the repository's Vite development server and production build. A downloadable single-file offline HTML application is outside this initial scope.

The supplied screenshot establishes the appearance: small, rounded, lightly outlined source labels beside a sentence. It does not provide the actual cited URLs. Example URLs below are placeholders for explaining the format, not research references.

## What success means

- A source link can appear as a pill such as `eScholarship` or `nyu` beside the relevant sentence.
- The underlying destination remains inspectable and clickable.
- The user can add a citation without remembering Markdown syntax.
- Pasted AI content retains source URLs when those URLs are present in the clipboard.
- The same Markdown can be saved, reopened, copied, and exported without a separate citation database.
- Missing destinations remain visible for repair. They never receive guessed URLs.
- Both surfaces process the draft locally, using bundled dependencies.

## Current project findings

The application uses a textarea, Marked, DOMPurify, and plain ES modules. `app.js` currently lets the browser perform a normal paste, then updates the gutter, saving, linting, and the mobile preview. It does not inspect rich clipboard data or recognize citations.

`lib/preview.js` already has a Marked renderer configuration and sanitizes every rendered document. Its hooks open permitted external links with `noopener noreferrer`. `lib/import-export.js` clones rendered content and embeds application CSS, which gives citation chips a direct path into HTML and print export.

`lib/editor-edit.js` preserves native undo when possible and creates a recovery version before applying a fallback edit. The new workflows should reuse it rather than assign directly to the textarea.

There are extensive pre-existing edits in this checkout. Implementation should modify only the citation integration points and retain those changes.

## Approaches considered

| Approach                                         | Benefit                                                              | Limitation                                                                               | Decision                                        |
| ------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Shared citation renderer plus clipboard importer | Supports this app and a separate tool; keeps sources in the document | Needs explicit rules for uncertain clipboard formats                                     | Recommended                                     |
| Style every hyperlink as a pill                  | Very small change                                                    | Ordinary prose links become citations; source information lost during copying stays lost | Insufficient                                    |
| Browser extension or provider-specific scraper   | Could access citations omitted from copied text                      | Requires installation and provider-specific maintenance; introduces a much larger scope  | Defer unless real examples show it is necessary |

## Portable citation format

Use standard Markdown links with a reserved link-title marker:

```markdown
This sentence has two sources. [eScholarship](https://example.org/paper 'cite') [nyu](https://example.edu/study 'cite')
```

Long documents can use reference links:

```markdown
This sentence has two sources. [eScholarship][cite-1] [nyu][cite-2]

[cite-1]: https://example.org/paper 'cite'
[cite-2]: https://example.edu/study 'cite'
```

Allow an optional source title using the exact prefix `cite: `:

```markdown
[eScholarship](https://example.org/paper 'cite: Full article title')
```

The app recognizes only the exact title `cite` or a title starting with `cite: `. An ordinary Markdown link remains an ordinary link. Other Markdown renderers still display working hyperlinks; pill styling belongs to this application. The title marker is an application convention, not a universal Markdown citation standard.

The visible label remains user-controlled. If the user supplies only a URL, default to its full hostname with a leading `www.` removed. Do not collapse unrelated sources by hostname. Two papers from the same website remain distinct citations.

Use inline links for small manual edits. The importer may use reference links to avoid repeating long destinations. Any generated reference names must avoid existing names, including CommonMark's case-insensitive normalization. Reuse an existing citation definition only when its destination and title match; preserve each occurrence's label.

## User workflows

### Add a custom citation

Add a Citation action beside the existing document tools. Add citation opens a small native dialog with Source label, URL, and optional Source title fields.

Capture the editor selection before opening the dialog. Insert the new citation at that location; a selected link can be converted when its complete Markdown link can be identified reliably. Do not guess the boundaries of a partially selected link. Validate an absolute HTTP or HTTPS destination, escape Markdown syntax in the label/title, and apply the edit through the existing undo/recovery helper.

For source chips, use real anchor elements with visible keyboard focus, readable contrast in both themes, and text that can wrap for long labels. Show the article title and full URL on hover and keyboard focus through the existing tooltip patterns. Clicking a citation opens its actual destination. Keep enough separation between adjacent chips to make each target usable on touch screens.

### Paste an AI response

Paste with citations opens an import dialog with a paste field. The paste event captures `text/plain` and `text/html` synchronously. Clipboard inspection happens only after the user's paste gesture.

The dialog shows the candidate Markdown, a rendered preview, and source links found in the pasted content. The user can correct labels or mark uncertain links as citations, then Insert applies the result at the saved editor selection in one edit. If the document or insertion selection changed while the dialog was open, require choosing a current insertion point before applying; never silently overwrite intervening edits.

Regular paste in the main editor continues to accept normal Markdown, including the explicit `cite` format. The initial design uses the dedicated importer for rich response conversion because inspecting and correcting ambiguous source links is part of the operation. Automatic interception of every editor paste can be considered later after the conversion rules have been tested on real payloads.

The standalone page makes the paste field the primary input and uses the same conversion, source review, and rendering functions. Copy Markdown is the reliable transfer format. Rich HTML copying may also be offered where supported, with a Markdown fallback. Other applications choose which clipboard format and styling they retain, so identical appearance outside these two surfaces is not a compatibility guarantee.

## Clipboard rules and limits

| Available input                                                              | Handling                                                                          |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Markdown with explicit `cite` links                                          | Preserve the source and render chips                                              |
| Markdown with ordinary links                                                 | Preserve links; allow the user to mark selected source links as citations         |
| Rich HTML with hyperlinks                                                    | Sanitize and convert structure to Markdown while retaining valid destinations     |
| Rich HTML with explicit citation markers or linked superscripts              | Propose those links as citations; show the result for review                      |
| Numbered markers with a copied source list                                   | Resolve only an unambiguous marker-to-destination mapping from the pasted content |
| Bare source names, inaccessible reference IDs, or incomplete citation groups | Preserve their text and report the missing source information                     |
| Code containing citation-like text                                           | Preserve it as code; never transform citation syntax inside code spans or fences  |
| No usable rich data or failed conversion                                     | Keep the plain text available and explain the fallback                            |

Clipboard HTML and plain text can differ. Prefer the plain Markdown candidate when it already contains the document's structure and source URLs. Offer rich conversion when it recovers links or formatting missing from the plain text. Do not merge the two representations by guessing character offsets. The review dialog allows selecting the complete candidate instead.

A source list copied without its cited sentence cannot establish claim placement. A source label copied without a URL cannot identify the exact page. Internal provider IDs have meaning only with a supplied mapping. Some provider citation buttons may not be hyperlinks and may omit their destination from the clipboard. These limitations follow from missing input data; a parser cannot reliably invent the missing information.

Do not claim full native ChatGPT, Claude, or other-provider compatibility until actual clipboard samples from those providers have been tested. The universal supported contract is the explicit Markdown citation format. Provider-specific adapters should be small additions driven by observed payloads, not assumptions about private markup.

## Conversion and safety

Use a bundled HTML-to-Markdown converter with customizable rules, such as Turndown plus its GFM support, to preserve headings, lists, tables, emphasis, and fenced code. Avoid a large handwritten HTML parser. Load the converter when the import workflow opens so ordinary editor startup stays light.

Sanitize clipboard HTML before preview or conversion, restrict it to the structural content the converter needs, and keep it out of the live document. Reject executable content and resource-loading elements. Convert unsupported media to useful text where possible. Citation parsing itself performs no URL fetches, metadata scraping, favicon requests, or AI calls. Existing image loading rules continue to govern any Markdown images retained in the chosen candidate.

Allow only absolute HTTP/HTTPS URLs for generated citation links. Preserve query strings and fragments: they can identify a specific resource or passage. Do not strip parameters or resolve redirects automatically. Escape labels, destinations, and titles during Markdown serialization. Render through the existing sanitized preview pipeline.

The document source is authoritative. Any link/source list in a dialog or playground is derived state and must be rebuilt from the current source. It is not stored separately in localStorage.

## Suggested module boundaries

- `lib/citations.js`: recognizes the reserved title convention, validates citation destinations, serializes links, and exposes the Marked link renderer behavior. It does not import app DOM or storage modules.
- `lib/citation-import.js`: normalizes captured clipboard representations and returns candidate Markdown, source candidates, and unresolved-marker diagnostics. It does not modify the editor.
- `lib/citation-ui.js`: coordinates the app dialogs, editor selection, and existing safe edit helper.
- `citation-playground.html` and a small standalone entry module: compose the same shared functionality without initializing the main editor application.
- A shared citation stylesheet: supplies chip appearance to preview, playground, and exported HTML.

The implementation may adjust filenames to match existing conventions. Keep renderer registration idempotent; do not repeatedly register global Marked extensions as import previews update.

## Export and persistence

Markdown export retains source links and their markers verbatim. Saving and history already preserve the complete Markdown, so citation metadata needs no new storage format.

HTML export retains semantic anchors and chip styles. Print/PDF output uses the same styling, with enough contrast on paper and without reliance on hover interactions. Verify that adjacent chips do not clip or overflow at line breaks. The browser's PDF printer controls whether PDF links remain clickable; verify the supported browser rather than promise universal PDF behavior.

The new standalone page must be included in the production build. Verify service-worker handling before describing it as available offline. A built page is not automatically cached merely because the main app has offline support.

## Verification plan

Meaningful coverage should establish these behaviors:

1. Explicit inline and reference citations render with the correct label, destination, and optional title. Ordinary links stay ordinary.
2. Rich copied HTML retains valid source URLs, headings, lists, tables, and code. Numeric markers with ambiguous mappings remain unresolved.
3. Missing destinations never receive invented links. Unsafe schemes, markup, and injected labels do not execute or load resources.
4. Import inserts at the intended selection; native undo or the recovery version restores the previous document. Concurrent edits are preserved.
5. Citation syntax inside code is unchanged. Existing reference definitions survive repeated import without collisions.
6. Save/reload and Markdown/HTML export retain citations. Print presentation remains legible.
7. The app and standalone tool produce identical normalized output for the same clipboard fixture.
8. Keyboard and touch interactions work in light/dark themes and at a narrow viewport.

Run the repository's lint/format checks, build, and relevant Playwright coverage after implementation. Add the new rendering format to the kitchen-sink fixture as required by the contribution guide. Use actual sanitized clipboard fixtures before claiming provider-specific import coverage.

## Prompt the user can reuse with an AI

> Write your answer in Markdown. Put a source link immediately after each claim you cite, using `[short source name](full-source-url "cite")`. Use the exact cited page URL and only sources you actually consulted. Do not replace URLs with internal citation IDs. If the destination is unavailable, say that the source URL is missing. Preserve headings, lists, tables, and fenced code blocks.

This prompt requests an interoperable output format. It does not verify whether the AI's sources are real or support its claims; the tool preserves citations and presents their destinations for inspection.

## Evidence consulted

- [MDN: Element paste event](https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event): reading clipboard data during paste and overriding insertion.
- [W3C Clipboard API editor's draft](https://w3c.github.io/clipboard-apis/): clipboard representations, event access, and HTML/plain-text formats. This is a working draft.
- [Marked renderer documentation](https://marked.js.org/using_pro#renderer): extending the existing Markdown rendering path.
- [Turndown](https://github.com/mixmark-io/turndown) and [GFM plugin](https://github.com/mixmark-io/turndown-plugin-gfm): HTML-to-Markdown conversion and custom rules.
- [DOMPurify](https://github.com/cure53/DOMPurify): sanitization, already used in this repository.

## Approval

The user approved the shared module, existing-editor integration, separate playground, and dedicated rich-paste review workflow on 2026-09-30.

## Implementation and validation

The editor now has a Citations dialog with custom-source and reviewed-paste workflows. `/citation-playground.html` shares the citation renderer and importer, adds a custom-source form, and supports Markdown copy/download and self-contained HTML download. Generated links use inline Markdown to avoid creating reference-name collisions. Existing reference links are supported.

The standalone tool caches converters loaded before service-worker activation, and the service-worker version includes every HTML entry so playground-only updates invalidate its cache. The mobile dialog keeps Insert within its visible bounds. Citation CSS is imported through the main stylesheet so development and production HTML exports both retain chip styling.

Validation completed: lint and formatting checks, production build, the full 73-test regression run, an 18-test pass covering final citations/mobile/export behavior, and an 8-test pass covering the final offline changes. Desktop and mobile layouts were inspected in light and dark themes without horizontal overflow. Provider-specific native copy formats remain conditional on their supplied URLs; no authenticated provider compatibility is claimed.
