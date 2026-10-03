# Pastel palette implementation plan

Approved design: `../specs/2026-10-04-pastel-palettes-design.md`.

The user approved the six selectable palettes and specified that pastel colors belong to the website only. Existing document colors continue to apply to HTML, PDF, and direct printing.

1. Add screen-only CSS tokens for the twelve new palette/appearance combinations. Apply paired colors to editor/preview surfaces, selection, links, and ordinary highlighted content while keeping existing semantic alert colors. Check contrast on actual rendered surfaces.
2. Add one palette registry and a compact labeled picker in the existing header. Use safe storage helpers and an independent palette preference; keep system appearance automatic until an explicit appearance choice. Update browser theme-color when appearance or palette changes.
3. Make the picker usable from the mobile More options panel, with selected indicators, keyboard focus, Escape dismissal, outside-click dismissal, and viewport fit. Preserve existing export-menu and mobile-header behavior.
4. Keep palette attributes out of exported HTML and PDF documents. Scope all decorative palette overrides to screen media to exclude them from direct print. Clarify export appearance wording and document website-only palettes.
5. Add meaningful browser coverage for selection persistence, appearance independence, invalid/blocked storage, keyboard/mobile behavior, all twelve color combinations, HTML/PDF palette exclusion, and direct printing. Run lint, formatting, production build, and relevant regressions; inspect desktop/mobile screenshots.

Preserve the user's existing work. No unrelated refactoring, new dependencies, or publishing.

Completed all five steps. Validation passed: production build, repository-wide lint/formatting checks, 13 new palette tests, and 19 existing related browser regressions. Saved palettes also apply to the Citation playground, with its download retaining standard document colors.
