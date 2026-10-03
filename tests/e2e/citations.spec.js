import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

async function pasteResponse(input, text, html = '') {
  await input.evaluate(
    (element, payload) => {
      const data = new DataTransfer();
      data.setData('text/plain', payload.text);
      if (payload.html) data.setData('text/html', payload.html);
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      );
    },
    { text, html }
  );
}

async function openImporter(page) {
  await page.locator('#citationsBtn').click();
  await page.getByRole('button', { name: 'Paste with citations', exact: true }).click();
  return page.locator('#citation-input');
}

test('inline and reference citations render while normal links and code stay unchanged', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('#editor')
    .fill(
      '# Sources\n\nClaim. [eScholarship](https://example.org/paper?q=1#passage "cite: Paper title") [nyu][source]\n\n[ordinary](https://example.net)\n\n`[code](https://example.com "cite")`\n\n[source]: https://example.edu/study "cite"'
    );
  const chips = page.locator('#preview a.citation-chip');
  await expect(chips).toHaveCount(2);
  await expect(chips.first()).toHaveText('eScholarship');
  await expect(chips.first()).toHaveAttribute('href', 'https://example.org/paper?q=1#passage');
  await expect(chips.first()).toHaveAttribute(
    'title',
    'Paper title\nhttps://example.org/paper?q=1#passage'
  );
  await expect(chips.first()).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('#preview a', { hasText: 'ordinary' })).not.toHaveClass(
    /citation-chip/
  );
  await expect(page.locator('#preview code')).toContainText('[code]');
});

test('custom citation uses the selected insertion point and native undo', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill('# Draft\n\nClaim.');
  await editor.press('Control+End');
  await page.locator('#citationsBtn').click();
  await page.locator('#citationUrl').fill('https://example.org/a(b)?q=1#part');
  await page.locator('#citationLabel').fill('A [quoted] source');
  await page.locator('#citationTitle').fill('A "title"');
  await page.getByRole('button', { name: 'Insert citation', exact: true }).click();
  await expect(page.locator('#citationDialog')).not.toBeVisible();
  await expect(page.locator('#preview .citation-chip')).toHaveText('A [quoted] source');
  await expect(page.locator('#preview .citation-chip')).toHaveAttribute(
    'href',
    'https://example.org/a(b)?q=1#part'
  );
  await editor.press('Control+z');
  await expect(editor).toHaveValue('# Draft\n\nClaim.');
});

test('unsafe citation destinations render without a clickable link', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill('[unsafe](javascript:alert%281%29 "cite")');
  await expect(page.locator('#preview a')).toHaveCount(0);
  await expect(page.locator('#preview .citation-missing')).toHaveText('unsafe');
  await page.locator('#citationsBtn').click();
  await page.locator('#citationUrl').fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Insert citation', exact: true }).click();
  await expect(page.locator('#citationMessage')).toContainText('HTTP or HTTPS');
});

test('rich paste retains structured content and source URLs with editable labels', async ({
  page,
}) => {
  await page.goto('/');
  const input = await openImporter(page);
  await pasteResponse(
    input,
    'Evidence 1. docs\nName Value\nAlpha 2\nconst answer = 42;',
    '<h2>Evidence</h2><p>A claim <sup><a href="https://example.org/paper?q=1#part">1</a></sup>. An <a href="https://example.net/docs">ordinary link</a>.</p><table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>Alpha</td><td>2</td></tr></tbody></table><pre><code>const answer = 42;\n[code](https://example.com "cite")</code></pre>'
  );
  const root = page.locator('#citationPasteView');
  await expect(root.locator('.citation-chip')).toHaveText('1');
  await expect(root.locator('[data-role="preview"] table')).toHaveCount(1);
  await expect(root.locator('[data-role="preview"] code')).toContainText('[code]');
  await expect(input).toHaveValue(/https:\/\/example.org\/paper\?q=1#part/);
  await root.locator('summary').click();
  await root.getByRole('textbox', { name: 'Source label 1', exact: true }).fill('Research');
  await root.getByRole('textbox', { name: 'Source label 1', exact: true }).press('Tab');
  await expect(root.locator('.citation-chip')).toHaveText('Research');
  await expect(
    root.locator('[data-role="preview"] a', { hasText: 'ordinary link' })
  ).not.toHaveClass(/citation-chip/);
});

test('Markdown candidate wins when it already includes source URLs; formats can be compared', async ({
  page,
}) => {
  await page.goto('/citation-playground.html');
  const input = page.locator('#playground-input');
  const markdown = '# Evidence\n\n**Claim** [Source](https://example.org/paper "cite")';
  await pasteResponse(
    input,
    markdown,
    '<h1>Evidence</h1><p><strong>Claim</strong> <a href="https://example.org/paper">Source</a></p>'
  );
  await expect(input).toHaveValue(markdown);
  await expect(page.locator('#playground-candidate')).toHaveValue('text');
  await page.locator('#playground-candidate').selectOption('html');
  await expect(input).not.toHaveValue(markdown);
  await expect(page.locator('[data-role="preview"] a')).toHaveAttribute(
    'href',
    'https://example.org/paper'
  );
});

test('source review updates repeated reference links without changing identical code', async ({
  page,
}) => {
  await page.goto('/citation-playground.html');
  const input = page.locator('#playground-input');
  await input.fill(
    '`[docs][ref]`\n\n[docs][ref] and [again][ref].\n\n[ref]: https://example.org/paper\n\n```md\n[docs][ref]\n```'
  );
  await page.locator('.citation-source-review').first().locator('summary').click();
  await page.getByRole('checkbox', { name: 'Display docs as a citation' }).check();
  await expect(page.locator('a.citation-chip')).toHaveCount(2);
  await expect(input).toHaveValue(/`\[docs\]\[ref\]`/);
  await expect(input).toHaveValue(/```md\n\[docs\]\[ref\]\n```/);
  await expect(page.locator('a.citation-chip').last()).toHaveText('again');
});

test('fragment citations resolve only when one copied source destination exists', async ({
  page,
}) => {
  await page.goto('/citation-playground.html');
  const input = page.locator('#playground-input');
  await pasteResponse(
    input,
    'Claim [1] [2]',
    '<p>Claim <a href="#fn1">[1]</a> <a href="#fn2">[2]</a></p><ol><li id="fn1"><a href="https://example.org/one">First source</a></li><li id="fn2"><a href="https://example.org/two">Second</a><a href="https://example.org/three">Third</a></li></ol>'
  );
  await expect(page.locator('a.citation-chip')).toHaveCount(1);
  await expect(page.locator('a.citation-chip')).toHaveAttribute('href', 'https://example.org/one');
  await expect(page.locator('[data-role="status"]')).toContainText('1 unresolved citation marker');
  await expect(page.locator('[data-role="preview"]')).toContainText('[2]');
});

test('unresolved provider IDs are reported while code markers are ignored', async ({ page }) => {
  await page.goto('/citation-playground.html');
  await page
    .locator('#playground-input')
    .fill('Claim [7] and \uE200cite\uE202turn0search0\uE201\n\n`[8]`\n\n```md\n[9]\n```');
  await expect(page.locator('[data-role="status"]')).toContainText('2 unresolved citation markers');
  await expect(page.locator('a.citation-chip')).toHaveCount(0);
});

test('clipboard markup cannot execute scripts or load images in import previews', async ({
  page,
}) => {
  const externalRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('evil.example')) externalRequests.push(request.url());
  });
  await page.goto('/citation-playground.html');
  await pasteResponse(
    page.locator('#playground-input'),
    'Safe',
    '<p>Safe</p><script>window.citationAttack=true</script><img src="https://evil.example/image" onerror="window.citationAttack=true"><iframe src="https://evil.example/frame"></iframe><a href="javascript:alert(1)">bad</a><p><a data-citation="1" href="https://example.org/source">&lt;img src=x onerror=alert(1)&gt;</a></p>'
  );
  await expect(page.locator('a.citation-chip')).toHaveCount(1);
  await expect(
    page.locator(
      '[data-role="preview"] img, [data-role="preview"] script, [data-role="preview"] iframe'
    )
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.citationAttack)).toBeUndefined();
  expect(externalRequests).toEqual([]);
});

test('an import refuses a stale document and retains its candidate for a new insertion point', async ({
  page,
}) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill('Original');
  const input = await openImporter(page);
  await input.fill('[Source](https://example.org "cite")');
  await editor.evaluate((element) => {
    element.value = 'Changed elsewhere';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.getByRole('button', { name: 'Insert response', exact: true }).click();
  await expect(page.locator('#citationMessage')).toContainText('Draft changed');
  await expect(editor).toHaveValue('Changed elsewhere');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await editor.press('Control+End');
  await page.locator('#citationsBtn').click();
  await expect(input).toHaveValue('[Source](https://example.org "cite")');
  await page.getByRole('button', { name: 'Insert response', exact: true }).click();
  await expect(editor).toHaveValue('Changed elsewhere[Source](https://example.org "cite")');
});

test('import fallback preserves a recovery version when native undo is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    document.execCommand = () => false;
  });
  await page.goto('/');
  await page.locator('#editor').fill('Original');
  const input = await openImporter(page);
  await input.fill('[Source](https://example.org "cite")');
  await page.getByRole('button', { name: 'Insert response', exact: true }).click();
  await page.locator('#historyBtn').click();
  await expect(page.locator('#historyList')).toContainText('Before citation import');
  await expect(page.locator('#historyList')).toContainText('Original');
});

test('standalone downloads retain Markdown and self-contained citation HTML', async ({ page }) => {
  await page.goto('/citation-playground.html');
  await page.getByRole('button', { name: 'Try example', exact: true }).click();
  await expect(page.locator('.citation-chip')).toHaveCount(2);
  const markdownDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .md', exact: true }).click();
  const markdown = await readFile(await (await markdownDownload).path(), 'utf8');
  expect(markdown).toContain('"cite: Example paper"');
  const htmlDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download HTML', exact: true }).click();
  const html = await readFile(await (await htmlDownload).path(), 'utf8');
  expect(html).toContain('class="citation-chip"');
  expect(html).toContain('href="https://example.org/paper"');
  expect(html).toContain('.citation-chip');
  expect(html).not.toContain('<script');
});

test('standalone inserts a custom citation without requiring Markdown syntax', async ({ page }) => {
  await page.goto('/citation-playground.html');
  await page.locator('#playground-input').fill('A claim.');
  await page.locator('#playground-input').press('Control+End');
  await page.getByText('Add a custom citation', { exact: true }).click();
  await page.locator('#playgroundSourceUrl').fill('https://www.example.org/paper');
  await page.getByRole('button', { name: 'Insert custom citation', exact: true }).click();
  await expect(page.locator('a.citation-chip')).toHaveText('example.org');
});

test('standalone remains usable offline after installation', async ({ page, context }) => {
  await page.goto('/citation-playground.html');
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error('Service worker not installed');
  });
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Try example', exact: true }).click();
  await expect(page.locator('.citation-chip')).toHaveCount(2);
});

test('mobile citation dialog keeps the insertion action inside its visible bounds', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  const input = await openImporter(page);
  await input.fill('[Source](https://example.org "cite")');
  const bounds = await page.locator('#citationDialog').boundingBox();
  const button = await page.locator('#citationInsert').boundingBox();
  expect(button.y).toBeGreaterThanOrEqual(bounds.y);
  expect(button.y + button.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  await page.getByRole('button', { name: 'Insert response', exact: true }).click();
  await expect(page.locator('#preview .citation-chip')).toHaveCount(1);
});

test('standalone rich conversion works offline after its first use, including an early paste', async ({
  page,
  context,
}) => {
  await page.goto('/citation-playground.html');
  const html = '<p>A claim <sup><a href="https://example.org/paper">1</a></sup></p>';
  await pasteResponse(page.locator('#playground-input'), 'A claim 1', html);
  await expect(page.locator('.citation-chip')).toHaveCount(1);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const names = await caches.keys();
        const urls = (
          await Promise.all(
            names.map(async (name) =>
              (await (await caches.open(name)).keys()).map((request) => request.url)
            )
          )
        ).flat();
        return urls.some((url) => url.includes('turndown.browser'));
      })
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await pasteResponse(page.locator('#playground-input'), 'A claim 1', html);
  await expect(page.locator('.citation-chip')).toHaveCount(1);
});
