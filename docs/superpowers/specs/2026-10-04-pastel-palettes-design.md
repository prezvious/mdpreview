# Selectable pastel palettes for mdfor.dev

Date: 2026-10-04
Status: Implemented and verified, with the user's correction that pastel palettes apply to the website only.

## Intent

Add six distinct, curated pastel combinations to the existing Markdown editor. The user selected selectable themes rather than replacing the current colors. Each palette supports light and dark appearance independently, and the existing Warm Paper / Espresso appearance remains the default for existing and new users.

The visual idea is a two-color stationery system: one pastel gives the writing surface its mood, the second colors highlights and small details. Readable ink and deeper accent colors keep the editor comfortable for long sessions. Preserve the current Fraunces, Hanken Grotesk, and JetBrains Mono typography and split-pane layout.

## Approaches considered

1. **Six curated pairs, recommended:** enough variety for different moods, with deliberate surface and accent roles. One palette picker, plus the existing light/dark toggle.
2. **A larger collection of twelve or more presets:** more choices, but many would be close variations and make selection slower.
3. **A custom color builder:** maximum flexibility, but requires controls, contrast handling, and saved custom themes beyond this request.

## Palette collection

The pair colors below identify each palette in swatches. They are not text colors; text and interactive accents use the deeper ink values in the token table.

| ID                | Name            | Pastel pair                          | Mood                          |
| ----------------- | --------------- | ------------------------------------ | ----------------------------- |
| `matcha-peach`    | Matcha Peach    | Sage `#D4E6C7`, peach `#F4CBB7`      | Fresh, warm, grounded         |
| `lavender-butter` | Lavender Butter | Lavender `#DDCCF1`, butter `#F4E3A3` | Dreamy, soft, quietly playful |
| `sky-rose`        | Sky Rose        | Sky `#C9E1F1`, rose `#F1CADB`        | Airy, cool, gentle            |
| `sage-blush`      | Sage Blush      | Sage `#CFDDC4`, blush `#F2CACE`      | Botanical, mellow, refined    |
| `lilac-lagoon`    | Lilac Lagoon    | Seafoam `#BEE4D9`, lilac `#DCCAF2`   | Fresh, unexpected, serene     |
| `apricot-sky`     | Apricot Sky     | Apricot `#F6D2B6`, sky `#C9DFF3`     | Sunny, spacious, optimistic   |

Matcha Peach is the recommended first palette to try. Lavender Butter and Lilac Lagoon provide the clearest alternatives for writers who prefer purple or cooler colors. Sage Blush differs from Matcha Peach through rose highlights and a plum accent; Apricot Sky reverses the warm/cool balance of Sky Rose.

## Proposed core tokens

The preview uses these exact values. Map Workspace to `--bg-primary`, Editor to `--bg-secondary` and `--code-bg`, Reading surface to `--bg-surface`, Ink to `--text-primary` and `--selection-fg`, Secondary text to `--text-secondary` and `--text-muted`, Accent/link to `--accent`, `--accent-muted`, `--link-color`, and `--blockquote-border`, and Border to `--border-color`. Add `--highlight-bg` for marks and bounded callouts, and use Highlight as the selection background.

Derive `--bg-tertiary` by mixing 88% Editor with 12% Ink, and `--border-hover` by mixing 70% Border with 30% Ink. Set `--accent-glow` to 12% Accent with transparency in light mode and 18% in dark mode. Retain existing appearance-specific shadows and semantic alert colors. Warm Paper retains its existing tokens. These mappings keep derived tokens deterministic rather than requiring further palette decisions.

| Palette         | Mode  | Workspace | Editor    | Reading surface | Highlight | Ink       | Secondary text | Accent/link | Border    |
| --------------- | ----- | --------- | --------- | --------------- | --------- | --------- | -------------- | ----------- | --------- |
| Matcha Peach    | Light | `#F7FAF4` | `#EAF3E5` | `#FFFBF5`       | `#F7DDCF` | `#28392D` | `#526050`      | `#426649`   | `#D2DECB` |
| Matcha Peach    | Dark  | `#18231C` | `#1E2D22` | `#233129`       | `#4C352C` | `#E5EEE1` | `#BAC7B4`      | `#C5DAB3`   | `#3C4D3D` |
| Lavender Butter | Light | `#F7F4FD` | `#EFE8FA` | `#FFFEF6`       | `#F6EAB5` | `#362B48` | `#635573`      | `#6C4F87`   | `#DAD0E7` |
| Lavender Butter | Dark  | `#231F2B` | `#2C2636` | `#30283D`       | `#4D4230` | `#EDE5F5` | `#C4B7CE`      | `#D8C1EE`   | `#494050` |
| Sky Rose        | Light | `#F3F9FD` | `#E5F0F8` | `#FFFAFC`       | `#F4DAE5` | `#293A49` | `#52687A`      | `#3C6585`   | `#CDDEE9` |
| Sky Rose        | Dark  | `#18232D` | `#1E2C38` | `#23333F`       | `#48303E` | `#E5EFF5` | `#B5C7D6`      | `#AECFE7`   | `#3A4D5B` |
| Sage Blush      | Light | `#F3F7F2` | `#E6EEE3` | `#FFFBFA`       | `#F7DEE0` | `#3D3036` | `#67565F`      | `#885466`   | `#D3DDCE` |
| Sage Blush      | Dark  | `#23271F` | `#2A3125` | `#30332B`       | `#493039` | `#EEE7E7` | `#C9BEC3`      | `#E1B5C3`   | `#44493C` |
| Lilac Lagoon    | Light | `#F0FAF8` | `#DEF1ED` | `#FAF6FF`       | `#E5D9F7` | `#234440` | `#466D65`      | `#306C65`   | `#C4DED7` |
| Lilac Lagoon    | Dark  | `#172725` | `#1E3430` | `#243A35`       | `#3A314A` | `#DEF1EB` | `#AFCAC0`      | `#A8DCD0`   | `#37534B` |
| Apricot Sky     | Light | `#FFF7EF` | `#F9EBDD` | `#F5FAFF`       | `#DDECF9` | `#43352B` | `#73624F`      | `#456A8A`   | `#E8D6C4` |
| Apricot Sky     | Dark  | `#2C221C` | `#382B21` | `#332921`       | `#293F50` | `#F3E7D8` | `#CEBBA3`      | `#B5D3EB`   | `#514333` |

Use the paired highlight for marks, selections, or bounded callouts with readable foregrounds. Keep semantic warning/error/success colors distinct from decorative palette colors. Do not recolor ordinary Markdown meaning merely to display the pair.

## Interaction

Add a compact palette control beside the existing light/dark toggle. It opens a popover containing a two-column grid of paired swatches, names, and a visible selected indicator. Warm Paper remains an option. On narrow screens place this control in the existing More options panel, keeping its popover inside the viewport.

The approved header/menu order is Import, Export, Markdown linting, Automatic suggestions, Block remote images, Theme, Palette, and Contribute on GitHub. Use the same DOM order for visual layout and keyboard focus.

Selecting an option applies immediately and persists the palette preference locally. Selecting a palette does not set or override the existing appearance preference; users can keep following their operating system's light/dark setting. The existing theme button continues to toggle only appearance. There is no cycling through seven palettes on each click.

Use labeled native buttons with visible keyboard focus and selected state. Support normal tab order, Escape to close and return focus, and dismissal when clicking outside. Swatch color is accompanied by a name and selected indicator. Keep touch targets at least 44 pixels.

## Integration and data flow

Keep `data-theme="light|dark"` as the appearance attribute and add `data-palette` for the palette. Extend `lib/theme.js` with validated palette selection and a distinct storage key in `lib/constants.js`; use existing storage helpers. Load the palette before the initial rendered document. Missing, outdated, or unknown palette values fall back to Warm Paper without an error dialog. Storage failure still allows the current session's selection.

Use a small `lib/palettes.js` module for palette metadata, validated selection, and picker listeners, called by the existing theme initialization. The separate Citation playground also loads the saved palette; its existing appearance control and document download remain independent.

Define palette token overrides using the existing CSS variable names. Keep selection, links, code backgrounds, menus, dialogs, citations, and focus indicators coherent. Do not introduce a styling framework, change fonts, or refactor unrelated modules.

Syntax highlighting and Mermaid retain their existing light/dark behavior. A palette switch does not require re-parsing Markdown or changing diagram theme. The browser theme-color should reflect the selected appearance and palette.

Pastel palettes apply to the website only. HTML and PDF exports use the existing document styling and carry only the light/dark appearance attribute, never the website's palette attribute. The export appearance selector continues to offer current, light, or dark; current refers to light/dark appearance only. PDF keeps the existing light default and white print paper. Scope pastel overrides to screen media so direct browser printing also retains the standard document styling. An export must restore the live appearance without losing the website palette or saving a temporary export appearance.

## Completion criteria

- All six palettes and Warm Paper are available on desktop and mobile.
- Palette selection survives reload independently of light/dark mode and system appearance changes.
- All twelve new palette/appearance combinations preserve readable body text, secondary text, links, code, and highlighted content. Target contrast of at least 4.5:1 for ordinary text on its actual surface and 3:1 for focus indicators and essential control boundaries.
- Missing or invalid saved values safely use Warm Paper; blocked storage does not prevent session use.
- Keyboard dismissal and focus return work without interfering with the existing mobile or export menus.
- HTML and PDF exports and direct browser printing exclude the website palette, preserve standard document styling, and restore the live editor state.
- Run the repository's lint, formatting, build, relevant appearance/export/mobile checks, and focused new coverage for persistence and export palette exclusion. Inspect representative desktop/mobile light and dark screenshots.

## Scope boundary

This design adds palette choice and its required integration. It does not add custom color editing, change the Markdown feature set, rewrite the existing user changes, or publish the website.

## Preview validation

The interactive proposal was inspected in light and dark mode and at 1024, 736, and 320 pixels. All six palettes in both appearances passed computed contrast checks for body text on reading/editor/highlight surfaces, secondary text on workspace/editor surfaces, and accents on reading/editor surfaces. The minimum tested ratio was 4.88:1. Palette switching, Escape dismissal, focus return, viewport fit, and absence of JavaScript errors were checked. This validates the proposal preview, not the website implementation or export integration.

## Implementation validation

Implemented all six palettes, the desktop/mobile picker, independent persistence and appearance handling, browser theme-color synchronization, and shared palette loading on the Citation playground. Palette overrides are limited to screen media and require the root palette attribute; generated HTML and PDF documents omit that attribute. Direct printing uses the existing print styling. The website keeps its chosen palette after export.

Validation passed: production build; repository-wide lint and formatting checks; 13 new palette tests and 19 existing appearance, highlighting, export, print, mobile-header, and standalone citation regressions. Browser tests checked all twelve palette/appearance combinations for readable text and filled controls, HTML export in current/light/dark appearance, PDF in light/dark appearance, and direct printing. Desktop light/dark and mobile screenshots were inspected. No new dependencies were added.
