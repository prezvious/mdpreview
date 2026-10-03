import { togglePreference } from './settings-helpers.js';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { serviceWorker } from '../../scripts/service-worker.js';

const fixture = (
  await readFile(new URL('./fixtures/kitchen-sink.md', import.meta.url), 'utf8')
).replace(/\r\n/g, '\n');

let errors = [];

test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function waitForControl(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

function controllerScript(page) {
  return page.evaluate(() => navigator.serviceWorker.controller.scriptURL);
}

function cacheNames(page) {
  return page.evaluate(() => caches.keys());
}

/** Built files the page has loaded that the service worker hasn't cached yet. */
function uncachedBuiltFiles(page) {
  return page.evaluate(async () => {
    const urls = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => /^\/(chunks|assets)\//.test(new URL(name).pathname));
    const hits = await Promise.all(urls.map((url) => caches.match(url, { ignoreVary: true })));
    return urls.filter((_, index) => !hits[index]);
  });
}

test('opens offline after one visit, including highlighting, math, and diagrams', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.locator('#editor').fill(fixture);
  await expect(page.locator('#preview .mermaid.mermaid-rendered > svg')).toBeVisible();

  await waitForControl(page);
  await expect.poll(() => uncachedBuiltFiles(page)).toEqual([]);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('md-preview-content')))
    .toBe(fixture);

  await context.setOffline(true);
  await page.reload();

  const preview = page.locator('#preview');
  await expect(page.locator('#editor')).toHaveValue(fixture);
  await expect(preview.locator('h1')).toHaveText('Smoke Test');
  await expect(preview.locator('pre code.language-js .hljs-keyword')).toHaveText('const');
  await expect(preview.locator('.katex-display')).toHaveCount(1);
  await expect(preview.locator('.katex-error')).toHaveCount(0);
  await expect(preview.locator('.mermaid > svg')).toContainText('Start');
});

test('lint and all six code completion languages work offline after one visit', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.locator('#editor').fill('```js\nconst ready = true;\n```');
  await expect(page.locator('#preview pre code.language-js .hljs-keyword')).toHaveText('const');
  await waitForControl(page);
  await expect.poll(() => uncachedBuiltFiles(page)).toEqual([]);
  await context.setOffline(true);
  await page.reload();
  const editor = page.locator('#editor');
  for (const [language, body, expected] of [
    ['js', 'const apple = 1;\napp', 'apple'],
    ['ts', 'interface Thing {}\nThi', 'Thing'],
    ['py', 'count = 1\nco', 'count'],
    ['json', '{"apple": 1, "ap', 'apple'],
    ['html', '<section></section>\n<se', 'section'],
    ['css', '.box { color: red; }\n.box { col', 'color'],
  ]) {
    await editor.fill(`\`\`\`${language}\n${body}`);
    await editor.press('Control+Space');
    await expect(page.getByRole('option', { name: new RegExp(expected) })).toBeVisible();
  }
  await togglePreference(page, '#lintToggle');
  await editor.fill('#Title\nBody');
  await expect(page.locator('#lintList .lint-item-message').first()).toContainText('MD018');
});

test('offers a reload when a new version is ready, then switches over', async ({ page }) => {
  await page.goto('/');
  await waitForControl(page);

  // Stand-ins for what an older build and older lazy chunks would have left behind.
  await page.evaluate(async () => {
    await caches.open('md-precache-old');
    const runtime = await caches.open('md-runtime');
    await runtime.put('/chunks/removed.abc123.js', new Response('old'));
  });

  // A worker registered from another URL is treated as a new version, as after a deploy.
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js?next');
  });

  const toast = page.locator('#mdToast');
  await expect(toast).toContainText('Update available');
  // The running version keeps serving until the person chooses to reload.
  expect(await controllerScript(page)).toMatch(/\/sw\.js$/);
  expect(await cacheNames(page)).toContain('md-precache-old');

  await Promise.all([
    page.waitForEvent('load'),
    toast.getByRole('button', { name: 'Reload' }).click(),
  ]);
  await waitForControl(page);

  expect(await controllerScript(page)).toMatch(/\/sw\.js\?next$/);
  await expect.poll(() => cacheNames(page)).not.toContain('md-precache-old');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const runtime = await caches.open('md-runtime');
        return runtime.match('/chunks/removed.abc123.js');
      })
    )
    .toBeUndefined();
});

test('precaches what the app needs to start', async () => {
  const dist = new URL('../../dist/', import.meta.url);
  const worker = await readFile(new URL('sw.js', dist), 'utf8');
  const { version, precache, assets } = JSON.parse(worker.match(/const BUILD = (\{.*\});/)[1]);
  expect(version).toMatch(/^[0-9a-f]{10}$/);

  const html = await readFile(new URL('index.html', dist), 'utf8');
  const entry = html.match(/<script[^>]+src="([^"]+)"/)[1];
  const stylesheet = html.match(/<link rel="stylesheet"[^>]+href="([^"]+)"/)[1];
  expect(precache).toEqual(expect.arrayContaining([entry, stylesheet]));
  expect(precache.some((url) => /\/[^/]+-latin-400-normal\.[^/]+\.woff2$/.test(url))).toBe(true);
  expect(precache.some((url) => /\/completion-worker-[^/]+\.js$/.test(url))).toBe(true);
  expect(precache.some((url) => /\/lint-worker-[^/]+\.js$/.test(url))).toBe(true);

  // Shared startup chunks are precached; converters and heavy renderers stay lazy.
  const lazyAssets = assets.filter((url) => /KaTeX_|turndown|mermaid|katex|elk-/i.test(url));
  expect(lazyAssets.length).toBeGreaterThan(0);
  expect(lazyAssets.filter((url) => precache.includes(url))).toEqual([]);
  expect(precache).toContain('/citation-playground.html');
  expect(assets.some((url) => url.startsWith('/chunks/'))).toBe(true);
  for (const url of new Set([...precache, ...assets])) {
    await expect(readFile(new URL(url.slice(1), dist))).resolves.toBeDefined();
  }
});

test('serves the worker without long-lived caching', async ({ request }) => {
  const response = await request.get('/sw.js');
  expect(response.ok()).toBe(true);
  expect(response.headers()['cache-control']).toBe('no-cache');
});

test('changing only the playground HTML changes the offline cache version', () => {
  function versionFor(pageSource) {
    let emitted;
    serviceWorker().generateBundle.call(
      {
        emitFile: (asset) => {
          emitted = asset;
        },
      },
      {},
      {
        'index.html': { type: 'asset', source: '<h1>Editor</h1>' },
        'citation-playground.html': { type: 'asset', source: pageSource },
      }
    );
    return JSON.parse(emitted.source.match(/const BUILD = (\{.*\});/)[1]).version;
  }
  expect(versionFor('<h1>Original playground</h1>')).not.toBe(
    versionFor('<h1>Updated playground</h1>')
  );
});
