import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { openSettings, closeSettings, choosePalette, setAppearance } from './settings-helpers.js';

const SAMPLE =
  '# Settings notes\n\nReadable [links](https://example.com) and <mark>ideas</mark>.\n';

async function createTheme(page, name = 'Morning mist', color = '#e8f2fa') {
  await openSettings(page);
  await page.locator('#themeCreateBtn').click();
  await page.locator('#customThemeName').fill(name);
  await page.getByLabel('Workspace hex color', { exact: true }).fill(color);
  await page.locator('#themeEditorSubmit').click();
  await expect(page.locator('#themeEditorDialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
}

test('opens categories with history and preserves the live editing session', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill('A draft');
  await page.locator('#editor').press('End');
  await page.locator('#editor').press('!');
  const selection = await page
    .locator('#editor')
    .evaluate((editor) => [editor.selectionStart, editor.selectionEnd]);
  await openSettings(page, 'writing');
  await expect(page).toHaveURL(/view=settings&section=writing/);
  await expect(page.locator('.app')).toBeHidden();
  await expect(page.locator('.app')).toHaveAttribute('inert', '');
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(page).toHaveURL(/section=privacy/);
  await page.goBack();
  await expect(page.locator('#settingsPage')).toBeHidden();
  expect(
    await page.locator('#editor').evaluate((editor) => [editor.selectionStart, editor.selectionEnd])
  ).toEqual(selection);
  await page.locator('#editor').press('Control+z');
  await expect(page.locator('#editor')).toHaveValue('A draft');
  await page.goForward();
  await expect(page.locator('#settingsPrivacy')).toBeVisible();
  await closeSettings(page);
  await expect(page.locator('#settingsBtn')).toBeFocused();
});

test('opens direct Settings links, survives reload, and returns without prior app history', async ({
  page,
}) => {
  await page.goto('/?view=settings&section=writing');
  await expect(page.locator('#settingsWriting')).toBeVisible();
  await page.reload();
  await expect(page.locator('#settingsWriting')).toBeVisible();
  await closeSettings(page);
  await expect(page).toHaveURL('http://localhost:4173/');
  await expect(page.locator('#editor')).toBeVisible();
});

test('contains customization only in Settings and suspends document shortcuts', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#headerMenu button, #headerMenu a')).toHaveText([
    /Import/,
    /Export/,
    /Download .md/,
    /Download .html/,
    /Download .pdf/,
    /Settings/,
    /Contribute on GitHub/,
  ]);
  await page.locator('#editor').fill(SAMPLE);
  await openSettings(page);
  const downloads = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.keyboard.press('Control+s');
  await page.keyboard.press('Control+o');
  await page.keyboard.press('Control+Backslash');
  await expect(page.locator('#editorPane')).not.toHaveClass(/collapsed/);
  await expect(page.locator('#editor')).toHaveValue(SAMPLE);
  expect(downloads).toEqual([]);
  await page.evaluate(() => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(['# Dropped draft'], 'dropped.md', { type: 'text/markdown' }));
    document.body.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true }));
  });
  await expect(page.locator('#editor')).toHaveValue(SAMPLE);
  await expect(page.locator('#importConfirmDialog')).toBeHidden();
  await expect(page.getByRole('button', { name: /Add theme/i })).toHaveCount(0);
});

test('returns to the same scroll positions and pane layout after typography reflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 750 });
  await page.goto('/');
  const source =
    '# Long draft\n\n' +
    Array.from({ length: 100 }, (_, index) => `Paragraph ${index}.`).join('\n\n');
  await page.locator('#editor').fill(source);
  await expect(page.locator('#preview')).toContainText('Paragraph 99.');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#resizeHandle').press('ArrowRight');
  await page.locator('#editor').evaluate((editor) => {
    editor.setSelectionRange(10, 40, 'backward');
    editor.scrollTop = 550;
    document.getElementById('preview').scrollTop = 750;
  });
  const paneWidth = await page
    .locator('#editorPane')
    .evaluate((pane) => pane.getBoundingClientRect().width);
  await openSettings(page, 'writing');
  await page.locator('#setting-editorSize').fill('160');
  await page.locator('#setting-previewSize').fill('80');
  await closeSettings(page);
  expect(
    await page
      .locator('#editor')
      .evaluate((editor) => [
        editor.selectionStart,
        editor.selectionEnd,
        editor.selectionDirection,
        editor.scrollTop,
      ])
  ).toEqual([10, 40, 'backward', 550]);
  expect(await page.locator('#preview').evaluate((preview) => preview.scrollTop)).toBe(750);
  expect(
    await page.locator('#editorPane').evaluate((pane) => pane.getBoundingClientRect().width)
  ).toBe(paneWidth);
  await page.locator('#collapseEditor').click();
  await page.locator('#preview').evaluate((preview) => {
    preview.scrollTop = 800;
  });
  await openSettings(page);
  await closeSettings(page);
  await expect(page.locator('#editorPane')).toHaveClass(/collapsed/);
  expect(await page.locator('#preview').evaluate((preview) => preview.scrollTop)).toBe(800);
  await expect(page.locator('#preview')).toHaveCSS('font-size', '14.4px');
});

for (const [size, spacing, scale] of [
  [80, 1.2, 90],
  [160, 2.2, 125],
]) {
  test(`completion, wrapping and lint navigation survive display limits (${size}%)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    const source = `# Title\n\n${'long text '.repeat(20)}\n#nospace\n`;
    await page.locator('#editor').fill(source);
    await openSettings(page, 'writing');
    await page.locator('#setting-editorSize').fill(String(size));
    await page.locator('#setting-editorSpacing').fill(String(spacing));
    await page.locator('#lintToggle').click();
    await openSettings(page);
    await page.locator('#setting-interfaceScale').fill(String(scale));
    await closeSettings(page);
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('button', { name: /Warning on line 4: MD018/ }).click();
    expect(await page.locator('#editor').evaluate((editor) => editor.selectionStart)).toBe(
      source.indexOf('#nospace')
    );
    await page.locator('#editor').press('Control+Space');
    await expect(page.locator('#completionMenu')).toBeVisible();
    await expect(page.locator('#completionMenu')).toBeInViewport({ ratio: 1 });
    const alignment = await page.evaluate(() => {
      const editor = document.getElementById('editor');
      const mirror = document.querySelector('.completion-caret-mirror');
      const caret = mirror.querySelector('span');
      const gutter = document.querySelector('.line-number:nth-child(4)');
      const top =
        editor.getBoundingClientRect().top +
        caret.getBoundingClientRect().top -
        mirror.getBoundingClientRect().top;
      return {
        delta: Math.abs(top - gutter.getBoundingClientRect().top),
        lineHeight: parseFloat(getComputedStyle(editor).lineHeight),
      };
    });
    expect(alignment.delta).toBeLessThan(alignment.lineHeight / 2 + 2);
  });
}

test('creates isolated light and dark theme colors and persists the selection', async ({
  page,
}) => {
  await page.goto('/');
  const original = await page
    .locator('html')
    .evaluate((root) => getComputedStyle(root).getPropertyValue('--bg-primary'));
  await openSettings(page);
  await page.locator('#themeCreateBtn').click();
  await page.locator('#customThemeName').fill('Morning mist');
  await page.getByLabel('Workspace hex color', { exact: true }).fill('#e8f2fa');
  expect(
    await page
      .locator('html')
      .evaluate((root) => getComputedStyle(root).getPropertyValue('--bg-primary'))
  ).toBe(original);
  await expect(page.locator('#customThemePreview')).toHaveCSS(
    'background-color',
    'rgb(232, 242, 250)'
  );
  await page.locator('[data-edit-mode="dark"]').click();
  await page.getByLabel('Workspace hex color', { exact: true }).fill('#152530');
  await page.locator('#themeEditorSubmit').click();
  await expect(page.getByRole('button', { name: 'Morning mist', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await closeSettings(page);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(232, 242, 250)');
  await setAppearance(page, 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(21, 37, 48)');
  await page.reload();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(21, 37, 48)');
});

test('unchanged copies preserve built-in colors in both appearances', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Warm Paper', 'Lavender Butter']) {
    await choosePalette(page, name);
    const before = [];
    for (const mode of ['light', 'dark']) {
      await setAppearance(page, mode);
      before.push(
        await page.evaluate(() => {
          const root = getComputedStyle(document.documentElement);
          return [
            '--bg-primary',
            '--bg-secondary',
            '--bg-surface',
            '--text-primary',
            '--text-muted',
            '--code-bg',
            '--selection-bg',
            '--accent-glow',
          ].map((token) => root.getPropertyValue(token).trim());
        })
      );
    }
    await openSettings(page);
    await page.getByRole('button', { name: `Duplicate ${name}`, exact: true }).click();
    await page.locator('#themeEditorSubmit').click();
    await closeSettings(page);
    for (const [index, mode] of ['light', 'dark'].entries()) {
      await setAppearance(page, mode);
      expect(
        await page.evaluate(() => {
          const root = getComputedStyle(document.documentElement);
          return [
            '--bg-primary',
            '--bg-secondary',
            '--bg-surface',
            '--text-primary',
            '--text-muted',
            '--code-bg',
            '--selection-bg',
            '--accent-glow',
          ].map((token) => root.getPropertyValue(token).trim());
        })
      ).toEqual(before[index]);
    }
  }
});

test('edits, duplicates, deletes and resets without losing documents or saved themes', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#editor').fill(SAMPLE);
  await createTheme(page);
  await page.getByRole('button', { name: 'Edit Morning mist', exact: true }).click();
  await page.locator('#customThemeName').fill('Evening mist');
  await page.locator('#themeEditorSubmit').click();
  await expect(page.getByRole('button', { name: 'Morning mist', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Duplicate Evening mist', exact: true }).click();
  await page.locator('#themeEditorSubmit').click();
  await expect(
    page.getByRole('button', { name: 'Evening mist copy', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Delete Evening mist copy', exact: true }).click();
  await page.locator('#settingsConfirmCancel').click();
  await expect(page.getByRole('button', { name: 'Evening mist copy', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Evening mist copy', exact: true }).click();
  await page.locator('#settingsConfirmAccept').click();
  await expect(page.getByRole('button', { name: 'Warm Paper', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.locator('#settingsReset').click();
  await page.locator('#settingsConfirmAccept').click();
  await expect(page.getByRole('button', { name: 'Evening mist', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('md-preview-theme'))).toBeNull();
  await closeSettings(page);
  await expect(page.locator('#editor')).toHaveValue(SAMPLE);
});

test('requires valid colors, warns on contrast, and guards dirty edits on Escape and Back', async ({
  page,
}) => {
  await page.goto('/');
  await openSettings(page);
  await page.locator('#themeCreateBtn').click();
  await page.locator('#customThemeName').fill('Soft ink');
  await page.getByLabel('Text hex color', { exact: true }).fill('invalid');
  await page.locator('#themeEditorSubmit').click();
  await expect(page.locator('#themeEditorDialog')).toBeVisible();
  await expect(page.getByLabel('Text hex color', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true'
  );
  await page.getByLabel('Text hex color', { exact: true }).fill('#faf7f1');
  await expect(page.locator('#customThemeWarnings')).toContainText('You can still save');
  await page.keyboard.press('Escape');
  await expect(page.locator('#settingsConfirmDialog')).toBeVisible();
  await page.locator('#settingsConfirmCancel').click();
  await expect(page.locator('#themeEditorDialog')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#settingsConfirmDialog')).toBeVisible();
  await page.locator('#settingsConfirmCancel').click();
  await expect(page).toHaveURL(/view=settings/);
  await page.locator('#themeEditorSubmit').click();
  await expect(page.getByRole('button', { name: 'Soft ink', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.locator('#settingsReset').click();
  await page.locator('#settingsConfirmAccept').click();
  await expect(page.getByRole('button', { name: 'Warm Paper', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

test('applies text sizing independently of interface scale and keeps gutter rows aligned', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#editor').fill('# A note\n\nA long line '.repeat(15));
  await openSettings(page, 'writing');
  for (const [key, value] of Object.entries({
    editorSize: '160',
    previewSize: '160',
    editorSpacing: '2.2',
    previewSpacing: '2.2',
  })) {
    await page.locator(`#setting-${key}`).fill(value);
  }
  await openSettings(page);
  await page.locator('#setting-interfaceScale').fill('125');
  await closeSettings(page);
  await expect(page.locator('#editor')).toHaveCSS('font-size', '23.04px');
  await expect(page.locator('#preview')).toHaveCSS('font-size', '27.2px');
  const measurements = await page.evaluate(() => {
    const lineHeight = parseFloat(getComputedStyle(document.getElementById('editor')).lineHeight);
    const gutter = document.querySelector('.line-number').getBoundingClientRect().height;
    return [lineHeight, gutter];
  });
  expect(Math.abs(measurements[0] - measurements[1])).toBeLessThan(1);
  await page.reload();
  await expect(page.locator('#editor')).toHaveCSS('font-size', '23.04px');
});

test('high contrast remembers themes and uses readable light and dark colors', async ({ page }) => {
  await page.goto('/');
  await choosePalette(page, 'Lavender Butter');
  await openSettings(page);
  await page.locator('[data-contrast-choice="high"]').click();
  await closeSettings(page);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await setAppearance(page, 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 17, 17)');
  await openSettings(page);
  await page.locator('[data-contrast-choice="normal"]').click();
  await closeSettings(page);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(35, 31, 43)');
});

test('invalid stored records cannot inject CSS and fall back safely', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'md-preview-custom-themes',
      JSON.stringify({
        version: 1,
        themes: [
          {
            id: 'custom-evil',
            name: 'bad',
            baseId: 'warm-paper',
            light: { '--bg-primary': 'red;}body{display:none' },
          },
        ],
      })
    );
    localStorage.setItem('md-preview-palette', 'custom-evil');
    localStorage.setItem(
      'md-preview-display-preferences',
      JSON.stringify({ version: 1, editorSize: 9999, interfaceScale: 'bad', contrast: 'unknown' })
    );
    localStorage.setItem('md-preview-theme', 'invalid');
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'warm-paper');
  await expect(page.locator('#editor')).toHaveCSS('font-size', '14.4px');
  await openSettings(page);
  await expect(page.locator('#settingsThemes > .theme-card')).toHaveCount(7);
});

test('storage failure retains session custom themes and reports the failure', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, 'setItem', {
      value: () => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      },
    });
  });
  await page.goto('/');
  await createTheme(page, 'Session colors');
  await expect(page.locator('#settingsStorageStatus')).toContainText('could not be saved');
  await page.getByRole('button', { name: 'Duplicate Session colors', exact: true }).click();
  await page.locator('#themeEditorSubmit').click();
  await expect(page.getByRole('button', { name: 'Session colors', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Session colors copy', exact: true })
  ).toBeVisible();
});

test('mobile Settings and the color editor fit at maximum interface scale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await openSettings(page);
  await page.locator('#setting-interfaceScale').fill('125');
  for (const section of ['appearance', 'writing', 'privacy']) {
    await openSettings(page, section);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await expect(page.locator('#settingsBack')).toBeInViewport({ ratio: 1 });
  }
  await openSettings(page);
  await page.locator('#themeCreateBtn').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await expect(page.locator('#themeEditorSubmit')).toBeInViewport({ ratio: 1 });
  await page.locator('#themeEditorCancel').click();
  await closeSettings(page);
});

test('HTML export and printing ignore all website display preferences and custom colors', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.locator('#editor').fill(SAMPLE);
  await createTheme(page, 'Export boundary', '#eeccff');
  await openSettings(page, 'writing');
  await page.locator('#setting-previewSize').fill('160');
  await page.locator('#setting-previewSpacing').fill('2.2');
  await openSettings(page);
  await page.locator('#setting-interfaceScale').fill('125');
  await page.locator('[data-contrast-choice="high"]').click();
  await closeSettings(page);
  await page.locator('#exportMenuBtn').click();
  await page.locator('#exportHtmlBtn').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDownloadBtn').click();
  const file = await downloadPromise;
  const exported = await context.newPage();
  await exported.setContent(await readFile(await file.path(), 'utf8'));
  await expect(exported.locator('.prose')).toHaveCSS('font-size', '17px');
  await expect(exported.locator('.prose p')).toHaveCSS('line-height', '29.75px');
  await expect(exported.locator('body')).toHaveCSS('background-color', 'rgb(250, 247, 241)');
  expect(await exported.locator('html').getAttribute('data-custom-theme')).toBeNull();
  await exported.close();
  await openSettings(page);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#settingsPage')).toBeHidden();
  await expect(page.locator('#preview')).toBeVisible();
  await expect(page.locator('#preview')).toHaveCSS('font-size', '17px');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('#settingsPage')).toBeVisible();
});

test('Settings and custom theme creation work offline', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await openSettings(page);
  await createTheme(page, 'Offline mist');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Offline mist', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

test('edited Warm Paper roles update the panes and their dependent colors', async ({ page }) => {
  await page.goto('/');
  await createTheme(page, 'Paper panes');
  await page.getByRole('button', { name: 'Edit Paper panes', exact: true }).click();
  await page.getByLabel('Editor hex color', { exact: true }).fill('#dceaf2');
  await page.getByLabel('Reading surface hex color', { exact: true }).fill('#fff0ed');
  await page.getByLabel('Accent / link hex color', { exact: true }).fill('#395677');
  await page.locator('#themeEditorSubmit').click();
  await closeSettings(page);
  await expect(page.locator('#editorPane')).toHaveCSS('background-color', 'rgb(220, 234, 242)');
  await expect(page.locator('#previewPane')).toHaveCSS('background-color', 'rgb(255, 240, 237)');
  await page.locator('#editor').fill('# Colors\n\nA [link](https://example.com) and `code`.\n');
  await expect(page.locator('#preview code')).toHaveCSS('background-color', 'rgb(220, 234, 242)');
  await expect(page.locator('#preview a')).toHaveCSS('color', 'rgb(57, 86, 119)');
});

test('catalog writes preserve unrelated edits and deletions from another tab', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await createTheme(page, 'First theme');
  const other = await context.newPage();
  await other.goto('/');
  await createTheme(other, 'Second theme');
  await page.getByRole('button', { name: 'Edit First theme', exact: true }).click();
  await page.locator('#customThemeName').fill('Renamed first');
  await page.locator('#themeEditorSubmit').click();
  await other.getByRole('button', { name: 'Delete Second theme', exact: true }).click();
  await other.locator('#settingsConfirmAccept').click();
  await expect(other.getByRole('button', { name: 'Renamed first', exact: true })).toBeVisible();
  await expect(other.getByRole('button', { name: 'First theme', exact: true })).toHaveCount(0);
  await other.getByRole('button', { name: 'Delete Renamed first', exact: true }).click();
  await other.locator('#settingsConfirmAccept').click();
  await createTheme(page, 'Third theme');
  await expect(page.getByRole('button', { name: 'Second theme', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Renamed first', exact: true })).toHaveCount(0);
  await other.close();
});

for (const appearance of ['light', 'dark']) {
  test(`PDF export excludes custom colors, sizing and contrast (${appearance})`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.print = () => {
        window.top.__settingsPrint = {
          theme: document.documentElement.dataset.theme,
          customTheme: document.documentElement.getAttribute('data-custom-theme'),
          display: document.documentElement.getAttribute('data-website-display'),
          background: getComputedStyle(document.body).backgroundColor,
          fontSize: getComputedStyle(document.querySelector('.prose')).fontSize,
          lineHeight: getComputedStyle(document.querySelector('.prose p')).lineHeight,
        };
        window.dispatchEvent(new Event('afterprint'));
      };
    });
    await page.goto('/');
    await page.locator('#editor').fill(SAMPLE);
    await createTheme(page, 'Print boundary', '#eeccff');
    await openSettings(page, 'writing');
    await page.locator('#setting-previewSize').fill('160');
    await page.locator('#setting-previewSpacing').fill('2.2');
    await openSettings(page);
    await page.locator('#setting-interfaceScale').fill('125');
    await page.locator('[data-contrast-choice="high"]').click();
    const selected = await page.locator('html').getAttribute('data-custom-theme');
    await closeSettings(page);
    await page.locator('#exportMenuBtn').click();
    await page.locator('#exportPdfBtn').click();
    await page.locator('#exportTheme').selectOption(appearance);
    await page.locator('#exportDownloadBtn').click();
    await expect
      .poll(() => page.evaluate(() => window.__settingsPrint))
      .toEqual({
        theme: appearance,
        customTheme: null,
        display: null,
        background: appearance === 'light' ? 'rgb(255, 255, 255)' : 'rgb(27, 25, 22)',
        fontSize: '17px',
        lineHeight: '29.75px',
      });
    await expect(page.locator('html')).toHaveAttribute('data-custom-theme', selected);
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
    await expect(page.locator('#preview')).toHaveCSS('font-size', '27.2px');
    await openSettings(page, 'writing');
    await expect(page.locator('#setting-previewSpacing')).toHaveValue('2.2');
  });
}

test('Citation playground loads custom themes while its download keeps standard styling', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await createTheme(page, 'Citation mist', '#eeccff');
  const selected = await page.locator('html').getAttribute('data-custom-theme');
  await page.goto('/citation-playground.html');
  await expect(page.locator('html')).toHaveAttribute('data-custom-theme', selected);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(238, 204, 255)');
  await page.locator('#playgroundExample').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#playgroundHtml').click();
  const file = await downloadPromise;
  const exported = await context.newPage();
  await exported.setContent(await readFile(await file.path(), 'utf8'));
  expect(await exported.locator('html').getAttribute('data-custom-theme')).toBeNull();
  await expect(exported.locator('.citation-chip').first()).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)'
  );
  await expect(exported.locator('.citation-chip').first()).toHaveCSS('color', 'rgb(85, 85, 85)');
  await exported.close();
});
