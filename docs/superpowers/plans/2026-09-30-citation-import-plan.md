# Citation implementation plan

Approved design: [Citation import](../specs/2026-09-30-citation-import-design.md).

Status: All steps completed and verified on 2026-09-30.

1. Add a shared citation convention, safe Markdown serializer, Marked renderer extension, and isolated sanitized preview. Verify ordinary links, code, unsafe schemes, and reference links.
2. Add lazy HTML conversion with Turndown/GFM, clipboard candidate selection, source review, and unresolved-marker reporting. Verify rich structure, exact URLs, fragment references, and repeated conversion.
3. Integrate Add citation and Paste with citations dialogs using the existing editor edit helper. Guard saved insertion points against document changes. Verify insertion, undo, recovery, and export.
4. Add a standalone citation playground using the same importer/renderer, build it as a second Vite entry, and include it in offline navigation. Verify production navigation and clipboard/download actions.
5. Add meaningful Playwright coverage and kitchen-sink examples; document usage. Run lint, formatting, build, and the full existing browser suite. Inspect desktop/mobile and both themes in a bounded visual pass.

Preserve existing uncommitted work. No publishing or deployment is part of this request.
