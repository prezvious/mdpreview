# MD Preview

[![CI](https://github.com/prezvious/mdpreview/actions/workflows/ci.yml/badge.svg)](https://github.com/prezvious/mdpreview/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A browser-based Markdown editor with instant preview, local draft recovery, and Markdown, HTML, and PDF export. It uses plain JavaScript and Vite, with no account or backend required. Drafts and settings stay in browser storage; user-selected external links and images can make network requests.

This repository builds on [Ihab Khattab's md-preview](https://github.com/ikhattab/md-preview), the project behind [mdfor.dev](https://mdfor.dev). That upstream deployment is maintained separately from this repository.

## Features and usage

- GitHub Flavored Markdown, syntax highlighting, KaTeX math, Mermaid diagrams, and YAML frontmatter.
- Autosave, up to 20 recovery versions, cross-tab conflict handling, heading navigation, and find/replace.
- Local Markdown linting and completion for Markdown and JavaScript, TypeScript, JSON, HTML, CSS, and Python code fences.
- Citation chips, reviewed import of copied AI responses, and a separate Citation playground.
- Light/dark appearance, pastel and custom themes, display preferences, mobile layouts, and remote-image blocking.
- Offline use after installation, with heavy renderers cached after use and a reload prompt for updates.

Run the app, type in the editor, and read the live preview beside it. Use **Import** or drag a `.md`, `.markdown`, or `.txt` file into the window; **Export** downloads Markdown or self-contained HTML, or opens the browser's PDF print dialog. **Settings** controls writing, appearance, and privacy preferences. Open `/citation-playground.html` for standalone citation conversion.

Use `Ctrl` on Windows/Linux or `Cmd` on macOS: `O` imports, `S` downloads Markdown, `Space` opens completion, and `\` toggles the editor pane on desktop. See [the usage guide](docs/usage.md) for syntax examples, citations, settings, and privacy details.

## Setup

Install Node.js 22.12+ (recommended) or Node.js 20.19+ within the 20.x release line, and npm. The exact supported range is in `package.json`.

```bash
git clone https://github.com/prezvious/mdpreview.git
cd mdpreview
npm ci
npm run dev
```

Open the URL Vite prints, normally `http://localhost:5173`. The lockfile makes installs reproducible. `.npmrc` disables dependency install scripts, sets a seven-day minimum release age, and saves exact versions when adding packages.

### Configuration and environment variables

No environment variables, API keys, database, or external service credentials are required. App preferences are configured in **Settings** and saved locally; defaults and storage keys are in `lib/constants.js`.

Playwright recognizes the standard `CI` environment variable to enable its CI reporter, retries, and server isolation. Local development needs no `.env` file. If a future integration requires configuration, document the variable names and placeholders in an `.env.example`; `.env` and `.env.*` are ignored, with example files explicitly allowed. Vite's `VITE_*` variables are embedded in browser bundles, so they must never contain secrets. Keep any future server credentials outside this static app.

## Commands and validation

| Command                               | Purpose                                                      |
| ------------------------------------- | ------------------------------------------------------------ |
| `npm run dev`                         | Development server with hot reload                           |
| `npm run build`                       | Build both HTML entry points and static assets into `dist/`  |
| `npm run preview`                     | Serve `dist/` on port 3000 with `_headers` applied           |
| `npm run lint`                        | Check JavaScript with ESLint                                 |
| `npm run format:check`                | Check formatting with Prettier                               |
| `npm run check`                       | Run lint and formatting checks                               |
| `npm run lint:fix` / `npm run format` | Apply lint or formatting fixes; review the resulting diff    |
| `npm run test:e2e`                    | Run the Chromium Playwright suite against a production build |

Before the first browser-test run:

```bash
npx playwright install chromium
npm run check
npm run build
npm run test:e2e
```

Playwright builds the app and serves it on port 4173 with the production Content Security Policy. Ensure no stale server is already running there: local runs can reuse an existing server. Tests cover rendering, sanitization, import/export, citations, offline use, draft recovery, lint/completion, themes, and settings. There are no separate unit-test or type-check commands. GitHub Actions runs checks, builds, and browser tests for `main` pushes and pull requests.

## Project structure

| Path                                                                         | Purpose                                                   |
| ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| `index.html`, `app.js`, `styles.css`                                         | Main editor layout, initialization, and shared styles     |
| `citation-playground.html`, `lib/citation-*`, `lib/citations.*`              | Citation rendering, import review, and standalone tools   |
| `lib/preview.js`, `lib/lazy-vendors.js`                                      | Markdown parsing, sanitized rendering, and lazy renderers |
| `lib/content.js`, `lib/storage.js`, `lib/draft-history.js`                   | Autosave, browser storage, and IndexedDB recovery         |
| `lib/lint*`, `lib/completion*`, `lib/document-navigation.js`                 | Worker-backed writing tools and navigation                |
| `lib/settings*`, `lib/theme*`, `lib/palettes*`, `lib/display-preferences.js` | Website appearance and writing preferences                |
| `sw.js`, `lib/offline.js`, `scripts/service-worker.js`                       | Offline lifecycle and generated build manifest            |
| `vite.config.js`, `scripts/cloudflare-headers.js`, `_headers`                | Build pipeline and hosting/preview headers                |
| `tests/e2e/`, `playwright.config.js`                                         | Browser tests and production preview configuration        |
| `docs/usage.md`, `docs/superpowers/`                                         | User guide and feature design records                     |

Main dependencies include Marked and its extensions, DOMPurify, highlight.js, KaTeX, Mermaid, markdownlint, Lezer parsers, Turndown, Lucide, and self-hosted Fontsource fonts. Heavy renderers load on demand; no third-party CDN is needed. `package-lock.json` records exact dependency versions.

## Deployment

```bash
npm run build
npm run preview
```

Publish the contents of `dist/` to a static host. For Cloudflare Pages, use `npm run build` as the build command and `dist` as the output directory. Configure hosting for this repository separately; connecting Git alone does not configure an automatic deployment.

`_headers` defines the Content Security Policy and caching rules for hosts that support that format; configure equivalent response headers on other hosts. Serve `/sw.js` with `Cache-Control: no-cache`. Offline installation requires HTTPS or localhost. The build assumes deployment at the origin root, including `/citation-playground.html` and `/sw.js`.

Website themes and display preferences are separate from exported and printed document styling. Preserve sanitization, security headers, and local draft storage when changing the app.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions and checks, [AGENTS.md](AGENTS.md) for coding-agent guidance, and [SECURITY.md](SECURITY.md) for private vulnerability reporting. Report ordinary bugs through [GitHub issues](https://github.com/prezvious/mdpreview/issues/new/choose).

[MIT](LICENSE), with the original copyright and attribution retained.
