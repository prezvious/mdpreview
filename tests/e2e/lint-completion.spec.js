import { togglePreference } from './settings-helpers.js';
import { test, expect } from '@playwright/test';

test('standard lint rules recognize frontmatter and code context', async ({ page }) => {
  await page.goto('/');
  await togglePreference(page, '#lintToggle');
  await page
    .locator('#editor')
    .fill(
      [
        '---',
        'title: Demo',
        '---',
        '# Title',
        '',
        '```md',
        '#nospace',
        '** bad **',
        'line\t',
        '```',
        '',
      ].join('\n')
    );
  await expect(page.locator('#lintList .lint-item-message')).toHaveText([/MD010: Hard tabs/]);
  await expect(page.locator('#lintFixAll')).toBeHidden();
  await page.getByRole('button', { name: /Fix MD010: Hard tabs/ }).click();
  await expect(page.locator('#editor')).toHaveValue(/line \n```/);
});

test('individual and Fix all actions recheck the draft and preserve undo', async ({ page }) => {
  await page.goto('/');
  await togglePreference(page, '#lintToggle');
  const editor = page.locator('#editor');
  await editor.fill('#Title\nBody');
  await page.getByRole('button', { name: /Fix MD018:/ }).click();
  await expect(editor).toHaveValue('# Title\nBody');
  await editor.press('Control+z');
  await expect(editor).toHaveValue('#Title\nBody');
  await page.getByRole('button', { name: /Fix MD018:/ }).click();
  await expect(editor).toHaveValue('# Title\nBody');
  await page.locator('#lintFixAll').click();
  await expect(editor).toHaveValue('# Title\n\nBody\n');
  await editor.press('Control+z');
  await expect(editor).toHaveValue('# Title\nBody');
});

test('Fix all handles whitespace and newly exposed warnings', async ({ page }) => {
  await page.goto('/');
  await togglePreference(page, '#lintToggle');
  const editor = page.locator('#editor');
  await editor.fill('# Title\n\nA\tB \n\n\nTail');
  await page.locator('#lintFixAll').click();
  await expect(editor).toHaveValue('# Title\n\nA B\n\nTail\n');
  await expect(page.locator('#lintList .lint-item-message')).toHaveText(['No issues found']);
});

test('Fix all preserves tabs in both fenced and indented code', async ({ page }) => {
  await page.goto('/');
  await togglePreference(page, '#lintToggle');
  const editor = page.locator('#editor');
  const source = '# Title\n\n```js\n\tfn();\n```\n\n    \tconst x = 1;';
  await editor.fill(source);
  await page.locator('#lintFixAll').click();
  await expect(editor).toHaveValue(`${source}\n`);
  await expect(page.locator('#lintList .lint-item-message')).toHaveText([
    /MD010: Hard tabs/,
    /MD010: Hard tabs/,
  ]);
  await expect(page.locator('#lintFixAll')).toBeHidden();
});

test('completion inserts a Markdown snippet and keeps native undo', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill('');
  await editor.press('Control+Space');
  await expect(page.locator('#completionOptions [role="option"]')).toHaveCount(10);
  await editor.press('ArrowDown');
  await editor.press('Enter');
  await expect(editor).toHaveValue('## ');
  await editor.press('Control+z');
  await expect(editor).toHaveValue('');
});

test('explicit completion wraps selected Markdown text', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill('Read this text');
  await editor.evaluate((element) => element.setSelectionRange(5, 9));
  await editor.press('Control+Space');
  await page.getByRole('option', { name: /Bold/ }).click();
  await expect(editor).toHaveValue('Read **this** text');
  await expect(editor).toHaveJSProperty('selectionStart', 7);
  await expect(editor).toHaveJSProperty('selectionEnd', 11);
  await editor.press('Control+z');
  await expect(editor).toHaveValue('Read this text');
});

test('completion preserves a recovery copy when native undo is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    document.execCommand = () => false;
  });
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill('Read ');
  await editor.press('Control+Space');
  await page.getByRole('option', { name: /Bold/ }).click();
  await expect(editor).toHaveValue('Read ****');
  await page.locator('#historyBtn').click();
  await expect(page.locator('#historyList')).toContainText('Before completion');
  await expect(page.locator('#historyList')).toContainText('Read ');
});

test('quick fixes preserve the draft if undo and recovery storage are unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    document.execCommand = () => {
      throw new Error('Editing command disabled');
    };
    IDBFactory.prototype.open = () => {
      throw new Error('Recovery storage disabled');
    };
  });
  await page.goto('/');
  await togglePreference(page, '#lintToggle');
  const editor = page.locator('#editor');
  await editor.fill('#Title\nBody');
  await page.getByRole('button', { name: /Fix MD018:/ }).click();
  await expect(page.locator('#mdToast')).toContainText('Edit was not applied');
  await expect(editor).toHaveValue('#Title\nBody');
});

test('current headings and references are suggested before preview catches up', async ({
  page,
}) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill(
    '# Start\n\n## API\n\n## API\n\n[guide]: https://example.com\n\nSee [details](#'
  );
  await editor.press('Control+Space');
  await expect(page.getByRole('option', { name: /#api API/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /#api-1 API/ })).toBeVisible();
  await page.getByRole('option', { name: /#api-1 API/ }).click();
  await expect(editor).toHaveValue(/See \[details\]\(#api-1\)$/);
  await editor.press('Enter');
  await editor.type('See [the docs][');
  await expect(page.getByRole('option', { name: /\[guide\] Link reference/ })).toBeVisible();
});

test('heading anchors match preview for reference links and nested Setext headings', async ({
  page,
}) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill(
    '# [API][guide]\n\n> Nested title\n> ============\n\n[guide]: https://example.com\n\nSee [details](#'
  );
  await editor.press('Control+Space');
  await expect(page.getByRole('option', { name: /#api API/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /#nested-title Nested title/ })).toBeVisible();
  await expect(page.locator('#preview #user-content-api')).toHaveText('API');
  await expect(page.locator('#preview #user-content-nested-title')).toHaveText('Nested title');
  await page.getByRole('option', { name: /#api API/ }).click();
  await expect(editor).toHaveValue(/See \[details\]\(#api\)$/);
  await expect(page.locator('#preview a', { hasText: 'details' })).toHaveAttribute(
    'href',
    '#user-content-api'
  );
});

test('completion uses prior symbols and syntax for the six supported languages', async ({
  page,
}) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  const cases = [
    ['js', 'const apple = 1;\napp', 'apple'],
    ['ts', 'interface Thing {}\nThi', 'Thing'],
    ['py', 'count = 1\nco', 'count'],
    ['json', '{"apple": 1, "ap', 'apple'],
    ['html', '<section></section>\n<se', 'section'],
    ['css', '.box { color: red; }\n.box { col', 'color'],
  ];
  for (const [language, body, expected] of cases) {
    await editor.fill(`\`\`\`${language}\n${body}`);
    await editor.press('Control+Space');
    await expect(page.getByRole('option', { name: new RegExp(expected) })).toBeVisible();
  }
});

test('unsupported fences use earlier words only', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill('```rust\nlet widget = 1;\nwid');
  await editor.press('Control+Space');
  await expect(page.getByRole('option', { name: /widget Earlier in this fence/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /function/ })).toHaveCount(0);
});

test('completion handles nested fences and replaces the full identifier', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  for (const source of [
    '> ```js\n> const apple = 1;\n> app',
    '- item\n\n  ```js\n  const apple = 1;\n  app',
    '> ```py\n> def apple():\n>     pass\n> \n> app',
    '```tsx\nconst apple = <section/>;\napp',
  ]) {
    await editor.fill(source);
    await editor.press('Control+Space');
    await page.getByRole('option', { name: /apple Earlier in this fence/ }).click();
    await expect(editor).toHaveValue(`${source}le`);
  }
  const source = '```js\nconst apple = 1;\nappremainder';
  await editor.fill(source);
  await editor.evaluate((element) => {
    const caret = element.value.lastIndexOf('app') + 3;
    element.setSelectionRange(caret, caret);
  });
  await editor.press('Control+Space');
  await expect(page.getByRole('option', { name: /apple Earlier in this fence/ })).toBeVisible();
  await editor.press('Enter');
  await expect(editor).toHaveValue('```js\nconst apple = 1;\napple');
});

test('completion excludes comments, strings, and Python references', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'completion') window.completedRequest = data.requestId;
        });
      }
      postMessage(data, ...args) {
        if (data.type === 'complete') window.requestedCompletion = data.requestId;
        super.postMessage(data, ...args);
      }
    };
  });
  await page.goto('/');
  const editor = page.locator('#editor');
  for (const source of [
    'Read `app`',
    '    app',
    '```js\n// app',
    '```js\nconst text = "app',
    '```json\n{"flag": "hello tr',
    '```py\noutput = phantom\npha',
    '```py\nfrom pathlib import Path as FilePath\nPat',
  ]) {
    await editor.fill(source);
    if (source.startsWith('Read'))
      await editor.evaluate((element) => element.setSelectionRange(9, 9));
    await editor.press('Control+Space');
    await expect
      .poll(() => page.evaluate(() => window.completedRequest === window.requestedCompletion))
      .toBe(true);
    await expect(page.locator('#completionMenu')).toBeHidden();
  }
  await editor.fill('```py\nfrom pathlib import Path as FilePath\nFil');
  await editor.press('Control+Space');
  await expect(page.getByRole('option', { name: /FilePath Earlier in this fence/ })).toBeVisible();
  await editor.fill('```json\n{"apple": 1, "ap');
  await editor.press('Control+Space');
  await expect(page.getByRole('option', { name: /apple Earlier in this fence/ })).toBeVisible();
  await editor.press('Enter');
  await expect(editor).toHaveValue('```json\n{"apple": 1, "apple"');
});

test('a pending completion cannot reopen after dismissal or a caret move', async ({ page }) => {
  await page.addInitScript(() => {
    window.completionReplies = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      addEventListener(type, listener, options) {
        return super.addEventListener(
          type,
          (event) => {
            if (event.data?.type === 'completion')
              window.completionReplies.push(() => listener.call(this, event));
            else listener.call(this, event);
          },
          options
        );
      }
    };
  });
  await page.goto('/');
  const editor = page.locator('#editor');
  for (const dismiss of ['Escape', 'ArrowLeft', 'Tab']) {
    await editor.fill('Read ');
    await editor.press('Control+Space');
    await expect
      .poll(() => page.evaluate(() => window.completionReplies.length))
      .toBeGreaterThan(0);
    await editor.press(dismiss);
    await page.evaluate(() => window.completionReplies.splice(0).forEach((reply) => reply()));
    await expect(page.locator('#completionMenu')).toBeHidden();
  }
});

test('code suggestions respect syntax context', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill('```html\n<di');
  await editor.press('Control+Space');
  await expect(page.getByRole('option', { name: /div/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /class/ })).toHaveCount(0);

  await editor.fill('```html\n<div cl');
  await editor.press('Control+Space');
  await expect(page.getByRole('option', { name: /class/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /div/ })).toHaveCount(0);

  await editor.fill('```json\n{"flag": tr');
  await editor.press('Control+Space');
  await expect(page.getByRole('option', { name: /true/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /flag/ })).toHaveCount(0);

  await editor.fill('```css\na { display: fl');
  await editor.press('Control+Space');
  await expect(page.getByRole('option', { name: /flex/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /color/ })).toHaveCount(0);
});

test('automatic suggestions can be disabled without disabling the hotkey', async ({ page }) => {
  await page.goto('/');
  const toggle = page.locator('#autoCompletionToggle');
  await togglePreference(page, '#autoCompletionToggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const editor = page.locator('#editor');
  await editor.fill('- [');
  await expect(page.locator('#completionMenu')).toBeHidden();
  await editor.press('Control+Space');
  await expect(page.getByRole('option', { name: /Unchecked task/ })).toBeVisible();
});

test('touch completion stays in the mobile viewport', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 640 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill('Read ');
  await page.locator('#completionBtn').tap();
  await expect(page.getByRole('option', { name: /Bold/ })).toBeVisible();
  const menu = await page.locator('#completionMenu').boundingBox();
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(320);
  expect(menu.y).toBeGreaterThanOrEqual(0);
  expect(menu.y + menu.height).toBeLessThanOrEqual(640);
  await page.getByRole('option', { name: /Bold/ }).tap();
  await expect(editor).toHaveValue('Read ****');
  await context.close();
});

test('completion follows a caret near the top of a scrolled long document', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.evaluate((element) => {
    const rows = Array.from({ length: 200 }, (_, index) => `Line ${index}.`);
    rows[100] = 'Read ';
    element.value = rows.join('\n');
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#preview')).toContainText('Line 199.');
  await editor.evaluate((element) => {
    element.focus();
    const caret = element.value.indexOf('Read ') + 5;
    element.setSelectionRange(caret, caret);
    element.scrollTop = 100 * parseFloat(getComputedStyle(element).lineHeight) - 60;
  });
  await editor.press('Control+Space');
  await expect(page.getByRole('option', { name: /Bold/ })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const field = document.getElementById('editor');
        const menu = document.getElementById('completionMenu');
        const style = getComputedStyle(field);
        const lineHeight = parseFloat(style.lineHeight);
        const expected =
          field.getBoundingClientRect().top +
          parseFloat(style.paddingTop) +
          101 * lineHeight -
          field.scrollTop +
          8;
        return Math.abs(menu.getBoundingClientRect().top - expected);
      })
    )
    // The caret glyph is slightly shorter than the line box because of font leading.
    .toBeLessThan(5);
  expect(
    await page.locator('.completion-caret-mirror').evaluate((element) => {
      return Math.abs(element.scrollTop - document.getElementById('editor').scrollTop);
    })
  ).toBeLessThan(1);
});
