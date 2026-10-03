// markdownlint's config-file resolver uses Node's require. In the browser editor
// we pass an explicit in-memory configuration and never resolve config files.
export function resolveModule() {
  throw new Error('Config-file module resolution is unavailable in the browser.');
}
