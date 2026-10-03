import {
  choosePalette,
  toggleAppearance,
  openSettings,
  closeSettings,
} from './settings-helpers.js';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

const PALETTES = [
  ['matcha-peach', 'Matcha Peach'],
  ['lavender-butter', 'Lavender Butter'],
  ['sky-rose', 'Sky Rose'],
  ['sage-blush', 'Sage Blush'],
  ['lilac-lagoon', 'Lilac Lagoon'],
  ['apricot-sky', 'Apricot Sky'],
];
const SAMPLE =
  '# Palette notes\n\nReadable body text and [a link](https://example.com).\n\n> A little room for ideas.\n\nTry some `code` and <mark>highlighted text</mark>.\n';

async function fillSample(page) {
  await page.locator('#editor').fill(SAMPLE);
  await expect(page.locator('#preview h1')).toHaveText('Palette notes');
}

function readContrasts(root) {
  function luminance(color) {
    const channels = color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((value) => {
        const component = value / 255;
        return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
      });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  function background(element) {
    for (let current = element; current; current = current.parentElement) {
      const color = getComputedStyle(current).backgroundColor;
      if (color !== 'rgba(0, 0, 0, 0)') return color;
    }
    throw new Error('Missing opaque background');
  }
  return [
    '#editor',
    '.preview p',
    '.pane-title',
    '.prose a',
    '.prose code',
    '.prose mark',
    '.prose blockquote',
    '#exportMenuBtn',
  ].map((selector) => {
    const element = root.querySelector(selector);
    const ink = luminance(getComputedStyle(element).color);
    const surface = luminance(background(element));
    return (Math.max(ink, surface) + 0.05) / (Math.min(ink, surface) + 0.05);
  });
}

test('renders distinct, readable palettes in both appearances', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await fillSample(page);
  const surfaces = new Set();

  for (const [id, name] of PALETTES) {
    await choosePalette(page, name);
    await expect(page.locator('html')).toHaveAttribute('data-palette', id);
    for (const theme of ['light', 'dark']) {
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect
        .poll(async () => Math.min(...(await page.locator('html').evaluate(readContrasts))))
        .toBeGreaterThanOrEqual(4.5);
      const colors = await page.evaluate(() => ({
        workspace: getComputedStyle(document.documentElement)
          .getPropertyValue('--bg-primary')
          .trim(),
        editor: getComputedStyle(document.querySelector('.editor-pane')).backgroundColor,
        preview: getComputedStyle(document.querySelector('.preview-pane')).backgroundColor,
      }));
      expect(colors.editor).not.toBe(colors.preview);
      surfaces.add(JSON.stringify(colors));
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
        'content',
        colors.workspace
      );
      await toggleAppearance(page);
    }
  }
  expect(surfaces.size).toBe(12);
});

test('persists the palette independently of automatic and explicit appearance', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await choosePalette(page, 'Lavender Butter');
  expect(await page.evaluate(() => localStorage.getItem('md-preview-theme'))).toBeNull();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'lavender-butter');
  await toggleAppearance(page);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'lavender-butter');
  await openSettings(page);
  await expect(page.getByRole('button', { name: 'Lavender Butter', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await closeSettings(page);
  await choosePalette(page, 'Warm Paper');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'warm-paper');
});

test('falls back safely when a saved palette is unknown', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('md-preview-palette', 'retired-palette'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'warm-paper');
  await openSettings(page);
  await expect(
    page.locator('#settingsThemes').getByRole('button', { name: 'Warm Paper', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
});

test('allows session palette changes when storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem']) {
      Object.defineProperty(Storage.prototype, method, {
        value: () => {
          throw new DOMException('Storage disabled', 'SecurityError');
        },
      });
    }
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await choosePalette(page, 'Lilac Lagoon');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'lilac-lagoon');
  expect(errors).toEqual([]);
});

test('supports keyboard theme selection and returning to editor controls', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  const theme = page.getByRole('button', { name: 'Matcha Peach', exact: true });
  await theme.focus();
  await page.keyboard.press('Enter');
  await expect(theme).toBeFocused();
  await expect(theme).toHaveAttribute('aria-pressed', 'true');
  await closeSettings(page);
  await page.locator('#exportMenuBtn').click();
  await expect(page.locator('#exportMenuPopover')).toBeVisible();
});

test('keeps mobile themes within a scrolling Settings page', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await choosePalette(page, 'Apricot Sky');
  await openSettings(page);
  for (const [, name] of PALETTES) {
    const theme = page.getByRole('button', { name, exact: true });
    await theme.scrollIntoViewIfNeeded();
    await expect(theme).toBeInViewport({ ratio: 1 });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await closeSettings(page);
  await expect(page.locator('#headerMenuBtn')).toBeFocused();
});

for (const appearance of ['current', 'light', 'dark']) {
  test(`excludes the website palette from HTML export (${appearance})`, async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await fillSample(page);
    await choosePalette(page, 'Lavender Butter');
    await page.locator('#exportMenuBtn').click();
    await page.locator('#exportHtmlBtn').click();
    await page.locator('#exportTheme').selectOption(appearance);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#exportDownloadBtn').click();
    const download = await downloadPromise;
    const exported = await context.newPage();
    await exported.setContent(await readFile(await download.path(), 'utf8'));
    const theme = appearance === 'light' ? 'light' : 'dark';
    await expect(exported.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await exported.locator('html').getAttribute('data-palette')).toBeNull();
    await expect(exported.locator('body')).toHaveCSS(
      'background-color',
      theme === 'light' ? 'rgb(250, 247, 241)' : 'rgb(27, 25, 22)'
    );
    await expect(exported.locator('.prose a')).toHaveCSS(
      'color',
      theme === 'light' ? 'rgb(178, 90, 55)' : 'rgb(221, 146, 100)'
    );
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'lavender-butter');
    expect(await page.evaluate(() => localStorage.getItem('md-preview-theme'))).toBeNull();
    await exported.close();
  });
}

for (const appearance of ['light', 'dark']) {
  test(`excludes the website palette from PDF export (${appearance})`, async ({ page }) => {
    await page.addInitScript(() => {
      window.print = () => {
        window.top.__palettePrint = {
          palette: document.documentElement.getAttribute('data-palette'),
          theme: document.documentElement.getAttribute('data-theme'),
          background: getComputedStyle(document.body).backgroundColor,
          link: getComputedStyle(document.querySelector('.prose a')).color,
        };
        window.dispatchEvent(new Event('afterprint'));
      };
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await fillSample(page);
    await choosePalette(page, 'Sky Rose');
    await page.locator('#exportMenuBtn').click();
    await page.locator('#exportPdfBtn').click();
    await expect(page.locator('#exportTheme')).toHaveValue('light');
    await page.locator('#exportTheme').selectOption(appearance);
    await page.locator('#exportDownloadBtn').click();
    await expect
      .poll(() => page.evaluate(() => window.__palettePrint))
      .toEqual({
        palette: null,
        theme: appearance,
        background: appearance === 'light' ? 'rgb(255, 255, 255)' : 'rgb(27, 25, 22)',
        link: appearance === 'light' ? 'rgb(178, 90, 55)' : 'rgb(221, 146, 100)',
      });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'sky-rose');
  });
}

test('shares the website palette with the Citation playground, excluding its download', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await choosePalette(page, 'Lilac Lagoon');
  await page.goto('/citation-playground.html');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'lilac-lagoon');
  await page.locator('#playgroundExample').click();
  await expect(page.locator('.citation-chip')).toHaveCount(2);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#playgroundHtml').click();
  const download = await downloadPromise;
  const exported = await context.newPage();
  await exported.setContent(await readFile(await download.path(), 'utf8'));
  expect(await exported.locator('html').getAttribute('data-palette')).toBeNull();
  await expect(exported.locator('.citation-chip').first()).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)'
  );
  await expect(exported.locator('.citation-chip').first()).toHaveCSS('color', 'rgb(85, 85, 85)');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'lilac-lagoon');
  await exported.close();
});

test('keeps pastel colors out of direct browser printing', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await fillSample(page);
  await choosePalette(page, 'Sage Blush');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.prose a')).toHaveCSS('color', 'rgb(178, 90, 55)');
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'sage-blush');
  await expect(page.locator('.prose a')).toHaveCSS('color', 'rgb(136, 84, 102)');
});
