import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test('reports an autosave failure and lets the writer download the unsaved draft', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'md-preview-content')
        throw new DOMException('Storage full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.goto('/');
  await page.locator('#editor').fill('# Work that matters\n');
  await expect(page.locator('#saveStatus')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#saveStatus')).toContainText('Could not save');
  await page.locator('#collapseEditor').click();
  await expect(page.locator('#draftAlert')).toBeVisible();
  await page.locator('#draftAlertOpenBtn').click();
  await expect(page.locator('#editorPane')).not.toHaveClass(/collapsed/);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#saveDownloadBtn').click();
  const download = await downloadPromise;
  expect(await readFile(await download.path(), 'utf8')).toBe('# Work that matters\n');
});

test('pauses autosave on a cross-tab edit and preserves both versions', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.locator('#editor').fill('# First tab\n');
  await expect(page.locator('#saveStatus')).toHaveAttribute('data-state', 'saved');

  const other = await context.newPage();
  await other.goto('/');
  await other.locator('#editor').fill('# Other tab\n');
  await expect(other.locator('#saveStatus')).toHaveAttribute('data-state', 'saved');
  await expect(page.locator('#draftConflict')).toBeVisible();
  await expect(page.locator('#editor')).toHaveValue('# First tab\n');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => localStorage.getItem('md-preview-content'))).toBe(
    '# Other tab\n'
  );

  await page.reload();
  await expect(page.locator('#editor')).toHaveValue('# First tab\n');
  await expect(page.locator('#draftConflict')).toBeVisible();

  await page.locator('#keepLocalDraftBtn').click();
  await expect(page.locator('#draftConflict')).toBeHidden();
  await expect(page.locator('#saveStatus')).toHaveAttribute('data-state', 'saved');
  await page.locator('#historyBtn').click();
  await expect(page.locator('#historyList')).toContainText('Other tab before overwrite');
  await expect(page.locator('#historyList')).toContainText('# Other tab');
  await other.close();
});

test('keeps unsaved local edits in history when loading the other tab', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.locator('#editor').fill('# Shared start\n');
  await expect(page.locator('#saveStatus')).toHaveAttribute('data-state', 'saved');
  const other = await context.newPage();
  await other.goto('/');

  await page.locator('#editor').fill('# Updated remotely\n');
  await expect(page.locator('#saveStatus')).toHaveAttribute('data-state', 'saved');
  await expect(other.locator('#draftConflict')).toBeVisible();
  await other.locator('#editor').fill('# My unsaved notes\n');
  await other.locator('#useOtherDraftBtn').click();
  await expect(other.locator('#editor')).toHaveValue('# Updated remotely\n');
  await expect(other.locator('#saveStatus')).toHaveAttribute('data-state', 'saved');
  await other.locator('#historyBtn').click();
  await expect(other.locator('#historyList')).toContainText('# My unsaved notes');
  await other.close();
});

test('restores a recovery version without losing the current version', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill('# First version\n');
  await expect(page.locator('#saveStatus')).toHaveAttribute('data-state', 'saved');
  await page.locator('#editor').fill('# Second version\n');
  await expect(page.locator('#saveStatus')).toHaveAttribute('data-state', 'saved');

  await page.locator('#historyBtn').click();
  await expect(page.locator('#historyList')).toContainText('# First version');
  await page.locator('#historyList .history-restore').first().click();
  await expect(page.locator('#editor')).toHaveValue('# First version\n');
  await expect(page.locator('#saveStatus')).toHaveAttribute('data-state', 'saved');

  await page.locator('#historyBtn').click();
  await expect(page.locator('#historyList')).toContainText('# Second version');
});

test('navigates headings and finds and replaces literal text', async ({ page }) => {
  await page.goto('/');
  const source = [
    '---',
    'title: Hidden metadata',
    '---',
    '# Intro',
    '```md',
    '# Not a heading',
    '```',
    '## Details',
    'Alpha beta alpha.',
    'Conclusion',
    '----------',
  ].join('\n');
  await page.locator('#editor').fill(source);
  await page.locator('#outlineBtn').click();
  await expect(page.locator('#outlineList button')).toHaveCount(3);
  await expect(page.locator('#outlineList')).not.toContainText('Not a heading');
  await page.getByRole('button', { name: 'Details · L8' }).click();
  expect(await page.locator('#editor').evaluate((el) => el.selectionStart)).toBe(
    source.indexOf('## Details')
  );

  await page.locator('#findBtn').click();
  await page.locator('#findQuery').fill('alpha');
  await expect(page.locator('#findCount')).toHaveText('2 matches');
  await page.locator('#findNextBtn').click();
  await expect(page.locator('#editor')).toHaveJSProperty('selectionStart', source.indexOf('Alpha'));
  await page.locator('#replaceQuery').fill('Gamma');
  await page.locator('#replaceOneBtn').click();
  await expect(page.locator('#editor')).toHaveValue(/Gamma beta alpha/);
  await page.locator('#replaceAllBtn').click();
  await expect(page.locator('#editor')).toHaveValue(/Gamma beta Gamma/);
  await expect(page.locator('#findCount')).toHaveText('0 matches');
});

test('finds a distant heading in a long document on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const source = `# Start\n\n${Array.from({ length: 180 }, (_, i) => `Paragraph ${i}.`).join('\n\n')}\n\n## Destination\n`;
  await page.locator('#editor').fill(source);
  await page.locator('#outlineBtn').click();
  await page.getByRole('button', { name: /Destination · L/ }).click();
  const state = await page.locator('#editor').evaluate((el) => ({
    selection: el.selectionStart,
    scrollTop: el.scrollTop,
  }));
  expect(state.selection).toBe(source.indexOf('## Destination'));
  expect(state.scrollTop).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(
    0
  );
});

test('an outline jump aligns both panes in a long document', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await page.goto('/');
  const paragraphs = Array.from({ length: 80 }, (_, i) => `Paragraph ${i}.`).join('\n\n');
  await page.locator('#editor').fill(`# Start\n\n${paragraphs}\n\n## Destination\n\nEnd.\n`);
  await page.locator('#outlineBtn').click();
  await page.getByRole('button', { name: /Destination · L/ }).click();
  await expect(page.locator('#preview h2', { hasText: 'Destination' })).toBeInViewport();
  expect(await page.locator('#editor').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.locator('#preview').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test('a single replacement can be undone with the native editor shortcut', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill('# Alpha alpha\n');
  await page.locator('#findBtn').click();
  await page.locator('#findQuery').fill('alpha');
  await page.locator('#findNextBtn').click();
  await page.locator('#replaceQuery').fill('Beta');
  await page.locator('#replaceOneBtn').click();
  await expect(editor).toHaveValue('# Beta alpha\n');
  await editor.press('Control+z');
  await expect(editor).toHaveValue('# Alpha alpha\n');
});
