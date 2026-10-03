# Repository guidance

## Architecture and constraints

- This is a static browser app using plain HTML, CSS, and JavaScript ES modules with Vite. `app.js` wires the editor; `lib/` holds feature modules. `citation-playground.html` is the second entry point.
- Keep drafts, recovery history, and settings local. Do not add analytics, remote fonts, third-party CDNs, or uploads of document content. User-selected remote images and links are existing exceptions; preserve the image-blocking preference.
- Sanitize Markdown and clipboard HTML with DOMPurify. Keep `_headers` and the production Content Security Policy compatible with both HTML entry points.
- Load heavy renderers through `lib/lazy-vendors.js`. Linting and completion use web workers; preserve their offline operation.
- Website palettes and display preferences must not change HTML/PDF export or printed document styling.
- Edit the source `sw.js` and `scripts/service-worker.js`, never generated `dist/sw.js`. Build hashing and precache manifests must cover both entry points and their required assets.

## Editing and validation

- Follow `.editorconfig`, `.prettierrc`, and `eslint.config.js`: two spaces, LF, semicolons, single quotes in JavaScript. Preserve unrelated local changes.
- Use `npm ci` and commit `package-lock.json` with dependency changes. Keep `.npmrc` free of credentials; it disables install scripts and sets dependency policy.
- See [README.md](README.md) for setup and [CONTRIBUTING.md](CONTRIBUTING.md) for contribution conventions.
- For application changes, run `npm run check`, `npm run build`, and the affected Playwright tests. For a release or broad change, run `npm run test:e2e`. There is no separate unit-test or type-check script.
- Playwright builds and serves the production app on port 4173 with `_headers`; ensure no stale preview server is being reused. Install Chromium with `npx playwright install chromium` when needed.
- For UI changes, verify light/dark appearances, mobile layout, keyboard navigation, and relevant export/offline behavior. Keep assertions focused on observable behavior.
- Never commit dependencies, generated builds, test reports, local audit reports, environment files, or credentials. No runtime environment variables are currently required; any future `VITE_*` values are public in the browser bundle.
