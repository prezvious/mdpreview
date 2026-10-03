import { toggleAppearance } from './settings-helpers.js';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (localStorage.getItem('md-preview-content') === null) {
      localStorage.setItem('md-preview-content', '# Draft\n\nPlain text.\n');
    }
  });
});
test.afterEach(() => expect(errors).toEqual([]));

async function paste(input, text, html) {
  await input.evaluate(
    (element, payload) => {
      const data = new DataTransfer();
      data.setData('text/plain', payload.text);
      data.setData('text/html', payload.html);
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      );
    },
    { text, html }
  );
}

for (const [name, prefix, blank] of [
  ['blockquote', '> ', '>'],
  ['list', '  ', ''],
]) {
  test(`citation review protects identical links and numeric markers in ${name} code`, async ({
    page,
  }) => {
    await page.goto('/citation-playground.html');
    const code = `${name === 'list' ? '- ' : prefix}\`\`\`\n${prefix}[source](https://example.org)\n${prefix}[1]\n${prefix}\`\`\``;
    const input = page.locator('#playground-input');
    await input.fill(`${code}\n${blank}\n${prefix}[source](https://example.org)`);
    await expect(page.locator('[data-role="status"]')).not.toContainText('unresolved');
    await page.locator('#playgroundImport summary').click();
    await page.getByRole('checkbox', { name: 'Display source as a citation' }).click();
    await expect(input).toHaveValue(
      `${code}\n${blank}\n${prefix}[source](<https://example.org> "cite")`
    );
    await expect(page.locator('[data-role="preview"] .citation-chip')).toHaveCount(1);
  });
}

test('source review finds multiline links in lists and blockquotes', async ({ page }) => {
  await page.goto('/citation-playground.html');
  const input = page.locator('#playground-input');
  await input.fill(
    '> [quote\n> source](https://example.org/quote\n> "cite")\n\n- [list\n  source](https://example.org/list\n  "cite")'
  );
  await expect(page.locator('#playgroundImport summary')).toHaveText('Review source links (2)');
  await page.locator('#playgroundImport summary').click();
  await page.getByRole('textbox', { name: 'Source label 1', exact: true }).fill('Renamed');
  await page.getByRole('textbox', { name: 'Source label 1', exact: true }).press('Tab');
  await expect(input).toHaveValue(/^> \[Renamed\]\(<https:\/\/example.org\/quote> "cite"\)/);
  await expect(page.locator('a.citation-chip')).toHaveText(['Renamed', 'list source']);
});

test('citation labels decode entities once and retain escaped literal entities', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('#editor')
    .fill(
      '[A &amp; B](https://example.org/a "cite") [C &#x26; D](https://example.org/b "cite") [\\&amp;](https://example.org/c "cite") [`&amp;`](https://example.org/d "cite") [&amp without semicolon](https://example.org/e "cite")'
    );
  await expect(page.locator('#preview .citation-chip')).toHaveText([
    'A & B',
    'C & D',
    '&amp;',
    '&amp;',
    '&amp without semicolon',
  ]);
  await expect(page.locator('#preview .citation-chip').first()).toHaveAttribute(
    'aria-label',
    /Source: A & B/
  );
});

test('source review retains bare URLs beside links and code inside formatted text', async ({
  page,
}) => {
  await page.goto('/citation-playground.html');
  const input = page.locator('#playground-input');
  await input.fill(
    '**[Source](https://example.org/source) and www.example.org and `https://example.org/code`**'
  );
  await expect(page.locator('#playgroundImport summary')).toHaveText('Review source links (2)');
  await page.locator('#playgroundImport summary').click();
  await page.getByRole('checkbox', { name: 'Display www.example.org as a citation' }).click();
  await expect(input).toHaveValue(
    '**[Source](https://example.org/source) and [www.example.org](<http://www.example.org> "cite") and `https://example.org/code`**'
  );
});

test('cold multiline display math installs KaTeX styles and fonts', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.katex')).toHaveCount(0);
  await page.locator('#editor').fill('$$\n\\frac{a}{b}\n$$');
  await expect(page.locator('#preview .katex-display')).toHaveCount(1);
  await expect(page.locator('.katex-mathml')).toHaveCSS('position', 'absolute');
  await expect(page.locator('.katex-mathml')).toHaveCSS('clip-path', 'inset(50%)');
  await expect(page.locator('.katex-mathml')).toHaveCSS('width', '1px');
  await expect(page.locator('.katex-html .mathnormal').first()).toHaveCSS('font-family', /KaTeX/);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('16px KaTeX_Math'))).toBe(true);
});

test('rich copy keeps TeX annotations without duplicate visual math text', async ({ page }) => {
  await page.goto('/citation-playground.html');
  const input = page.locator('#playground-input');
  await paste(
    input,
    'Ratio a/b. Source',
    '<p>Ratio <span class="katex"><span class="katex-mathml"><math><semantics><mfrac><mi>a</mi><mi>b</mi></mfrac><annotation encoding="application/x-tex">\\frac{a}{b}</annotation></semantics></math></span><span class="katex-html">ba</span></span>. <a href="https://example.org">Source</a></p>'
  );
  await expect(input).toHaveValue('Ratio $\\frac{a}{b}$. [Source](<https://example.org>)');
  await expect(page.locator('#playground-candidate')).toHaveValue('html');
  await expect(page.locator('[data-role="status"]')).not.toContainText('without TeX');
});

test('unconvertible formatted math keeps the original text and reports the loss', async ({
  page,
}) => {
  await page.goto('/citation-playground.html');
  const input = page.locator('#playground-input');
  await paste(
    input,
    'Ratio a/b. Source',
    '<p>Ratio <math><mfrac><mi>a</mi><mi>b</mi></mfrac></math>. <a href="https://example.org">Source</a></p>'
  );
  await expect(page.locator('#playground-candidate')).toHaveValue('text');
  await expect(input).toHaveValue('Ratio a/b. Source');
  await expect(page.locator('[data-role="status"]')).toContainText('math without TeX source');
  await page.locator('#playground-candidate').selectOption('html');
  await expect(page.locator('[data-role="preview"]')).toContainText(
    'Equation could not be converted'
  );
});

test('switching clipboard formats preserves textarea and source-review edits independently', async ({
  page,
}) => {
  await page.goto('/citation-playground.html');
  const input = page.locator('#playground-input');
  const formats = page.locator('#playground-candidate');
  await paste(
    input,
    'Original [Source](https://example.org)',
    '<p>Original <a href="https://example.org">Source</a></p>'
  );
  await expect(formats).toBeEnabled();
  await formats.selectOption('text');
  const edited = 'Edited [Source](https://example.org)';
  await input.fill(edited);
  await formats.selectOption('html');
  await page.locator('#playgroundImport summary').click();
  await page.getByRole('textbox', { name: 'Source label 1', exact: true }).fill('Research');
  await page.getByRole('textbox', { name: 'Source label 1', exact: true }).press('Tab');
  await page.getByRole('checkbox', { name: 'Display Research as a citation' }).check();
  const editedHtml = await input.inputValue();
  await formats.selectOption('text');
  await expect(input).toHaveValue(edited);
  await formats.selectOption('html');
  await expect(input).toHaveValue(editedHtml);
  await expect(page.locator('.citation-chip')).toHaveText('Research');
});

test('plain HTML and PDF exports work offline without loading heavy renderers', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    window.print = () => {
      window.top.__plainPrinted = document.body.innerText;
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.locator('#exportMenuBtn').click();
  await page.locator('#exportHtmlBtn').click();
  const downloaded = page.waitForEvent('download');
  await page.locator('#exportDownloadBtn').click();
  const html = await readFile(await (await downloaded).path(), 'utf8');
  expect(html).toContain('Plain text.');
  await page.locator('#exportMenuBtn').click();
  await page.locator('#exportPdfBtn').click();
  await page.locator('#exportDownloadBtn').click();
  await expect.poll(() => page.evaluate(() => window.__plainPrinted)).toContain('Plain text.');
  const renderers = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => /marked-katex|mermaid|highlight|\/chunks\/core\./i.test(url))
  );
  expect(renderers).toEqual([]);
});

test('plain export omits unused math fonts even after the renderer has loaded', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#editor').fill('$E=mc^2$');
  await expect(page.locator('#preview .katex')).toHaveCount(1);
  await page.locator('#editor').fill('# Plain export\n\nOnly text.');
  await expect(page.locator('#preview .katex')).toHaveCount(0);
  await page.locator('#exportMenuBtn').click();
  await page.locator('#exportHtmlBtn').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDownloadBtn').click();
  const download = await downloadPromise;
  const html = await readFile(await download.path(), 'utf8');
  expect(html).toContain('Only text.');
  expect(html).not.toMatch(/font-family:\s*["']?KaTeX_/);
});

test('a pending raw HTML image reaches the PDF image timeout and print cleanup', async ({
  page,
}) => {
  test.setTimeout(40_000);
  await page.route('https://images.example/hang.png', () => {});
  await page.addInitScript(() => {
    window.print = () => {
      window.top.__rawPrinted = true;
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  await page.goto('/');
  await page
    .locator('#editor')
    .fill('# Print\n\n<img src="https://images.example/hang.png" alt="Pending">');
  await expect(page.locator('#preview img')).toHaveCount(1);
  await page.locator('#exportMenuBtn').click();
  await page.locator('#exportPdfBtn').click();
  await page.locator('#exportDownloadBtn').click();
  await expect(page.locator('iframe[title="print"]')).toBeAttached();
  await expect.poll(() => page.evaluate(() => window.__rawPrinted), { timeout: 15_000 }).toBe(true);
  await expect(page.locator('iframe[title="print"]')).toHaveCount(0);
  await expect(page.locator('#exportDownloadBtn')).toBeEnabled();
});

test('stored editor width fits narrow desktop viewports, reloads, mobile and zen mode', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('md-preview-editor-width', '1100'));
  await page.goto('/');
  await expect
    .poll(() => page.locator('#editorPane').evaluate((element) => element.offsetWidth))
    .toBe(1100);
  await page.setViewportSize({ width: 1000, height: 700 });
  await expect
    .poll(() => page.locator('#previewPane').evaluate((element) => element.offsetWidth))
    .toBeGreaterThanOrEqual(299);
  await page.reload();
  await expect
    .poll(() => page.locator('#previewPane').evaluate((element) => element.offsetWidth))
    .toBeGreaterThanOrEqual(299);
  await page.locator('#collapseEditor').click();
  await page.setViewportSize({ width: 800, height: 700 });
  await page.locator('#editorPane').click();
  await expect
    .poll(() => page.locator('#previewPane').evaluate((element) => element.offsetWidth))
    .toBeGreaterThanOrEqual(299);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.locator('#editorPane').evaluate((element) => element.style.flexBasis))
    .toBe('');
  await page.setViewportSize({ width: 1000, height: 700 });
  await expect
    .poll(() => page.locator('#previewPane').evaluate((element) => element.offsetWidth))
    .toBeGreaterThanOrEqual(299);
});

test('first highlighting load follows the current dark theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.locator('#editor').fill('```js\nconst x = 1;\n```');
  await expect(page.locator('#preview .hljs-keyword')).toHaveText('const');
  expect(await page.locator('#hljs-theme-dark').evaluate((element) => element.disabled)).toBe(
    false
  );
  expect(await page.locator('#hljs-theme-light').evaluate((element) => element.disabled)).toBe(
    true
  );
});

test('system theme changes remain automatic until the writer chooses a theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  expect(await page.evaluate(() => localStorage.getItem('md-preview-theme'))).toBeNull();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('md-preview-theme'))).toBeNull();
  await toggleAppearance(page);
  expect(await page.evaluate(() => localStorage.getItem('md-preview-theme'))).toBe('light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('wrapped source lines keep gutter numbers aligned through pane resizing', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const source = `${'long text '.repeat(50)}\n# Heading`;
  await page.locator('#editor').fill(source);
  async function lineAlignment() {
    await page.locator('#editor').evaluate((element) => {
      element.focus();
      element.setSelectionRange(element.value.indexOf('#'), element.value.indexOf('#'));
    });
    await page.locator('#editor').press('Control+Space');
    await expect(page.locator('#completionMenu')).toBeVisible();
    return page.evaluate(() => {
      const editor = document.querySelector('#editor');
      const mirror = document.querySelector('.completion-caret-mirror');
      const caret = mirror.querySelector('span');
      const gutter = document.querySelector('.line-number:nth-child(2)');
      const top =
        editor.getBoundingClientRect().top +
        caret.getBoundingClientRect().top -
        mirror.getBoundingClientRect().top;
      return Math.abs(top - gutter.getBoundingClientRect().top);
    });
  }
  await expect.poll(lineAlignment).toBeLessThan(8);
  await page.locator('#editor').press('Escape');
  await page.setViewportSize({ width: 1000, height: 720 });
  await expect.poll(lineAlignment).toBeLessThan(8);
});

for (const nativeMode of ['false', 'throw']) {
  test(`single replacement preserves recovery when native editing returns ${nativeMode}`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate((mode) => {
      document.execCommand = () => {
        if (mode === 'throw') throw new DOMException('Disabled', 'NotSupportedError');
        return false;
      };
    }, nativeMode);
    await page.locator('#editor').fill('# Alpha alpha\n');
    await page.locator('#findBtn').click();
    await page.locator('#findQuery').fill('Alpha');
    await page.locator('#findNextBtn').click();
    await page.locator('#replaceQuery').fill('Beta');
    await page.locator('#replaceOneBtn').click();
    await expect(page.locator('#editor')).toHaveValue('# Beta alpha\n');
    await page.locator('#historyBtn').click();
    await expect(page.locator('#historyList')).toContainText('Before replacing text');
    await page.locator('#historyList .history-restore').first().click();
    await expect(page.locator('#editor')).toHaveValue('# Alpha alpha\n');
  });
}

test('all HTML entry routes receive the application CSP', async ({ request }) => {
  for (const path of ['/', '/index.html', '/citation-playground.html']) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
  }
});
