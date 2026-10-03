import { expect } from '@playwright/test';

export async function openSettings(page, section = 'appearance') {
  if (!(await page.locator('#settingsPage').isVisible())) {
    if (!(await page.locator('#settingsBtn').isVisible()))
      await page.locator('#headerMenuBtn').click();
    await page.locator('#settingsBtn').click();
  }
  await page.locator(`[data-settings-section="${section}"]`).click();
  await expect(page.locator('#settingsPage')).toBeVisible();
}

export async function closeSettings(page) {
  await page.locator('#settingsBack').click();
  await expect(page.locator('#settingsPage')).toBeHidden();
}

export async function togglePreference(page, selector) {
  await openSettings(page, selector === '#remoteImagesToggle' ? 'privacy' : 'writing');
  await page.locator(selector).click();
  await closeSettings(page);
}

export async function setAppearance(page, appearance) {
  await openSettings(page);
  await page.locator(`[data-appearance="${appearance}"]`).click();
  await closeSettings(page);
}

export async function toggleAppearance(page) {
  const current = await page.locator('html').getAttribute('data-theme');
  await setAppearance(page, current === 'dark' ? 'light' : 'dark');
}

export async function choosePalette(page, name) {
  await openSettings(page);
  await page.locator('#settingsThemes').getByRole('button', { name, exact: true }).click();
  await closeSettings(page);
}
