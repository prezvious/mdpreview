# Confirmed audit repairs

The user approved fixing every confirmed issue in the 3 October audit. Use the audit's reproduction cases as acceptance criteria; preserve the existing working-tree changes and UI conventions.

1. Replace citation substring offsets with syntax-tree source ranges, protect code/HTML, and decode visible labels without changing escaped literals.
2. Install live KaTeX CSS, recognize multiline display math on cold startup, synchronize newly loaded highlight styles, and preserve automatic system-theme behavior.
3. Preserve annotated TeX from formatted clipboard content. If a mathematical expression cannot be converted, select the original text and explain the loss. Retain edits independently for each clipboard candidate.
4. Remove unused renderer dependencies from plain exports. Start print asset timeouts after document parsing rather than the iframe load event, and keep cleanup/error reporting accurate.
5. Clamp stored pane widths to the viewport; measure wrapped source-line heights for the gutter and navigation. Route single replacements through the common undo/recovery helper.
6. Apply the existing CSP across HTML routes. Add regression coverage for all fourteen findings, run lint/format/build and the full browser suite, and inspect the corrected math and wrapped-editor views.

No new feature design or deployment is required. The written audit already supplied the proposed fixes and the user's request authorizes implementing them.

Completed all six steps. All fourteen findings are repaired, with nineteen new regression cases. Lint, formatting, production build, and desktop/mobile visual checks passed. The full browser run passed 94 of 95 cases; the remaining timeout passed on an isolated rerun without code changes. Detailed validation and the timing limitation are recorded in the audit report's Repairs section.
