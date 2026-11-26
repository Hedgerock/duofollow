import { resolve } from 'node:path';

import { buildSync } from 'esbuild';
import { expect, test } from 'playwright/test';

// Exercise Firefox transport selection and real Window events in every available browser engine.
test.use({ userAgent: 'Mozilla/5.0 Gecko/20100101 Firefox/144.0' });

test('Firefox installation help appears when the content script is absent', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('duofollow.language', 'en'));
  await page.goto('/duofollow/');
  await expect(page.locator('.connection-dialog')).toBeVisible();
  await expect(page.locator('.connection-dialog')).toContainText('about:addons');
});
test('Firefox bridge carries comparison, SPA return and quick confirmation through the shared core', async ({
  page,
}) => {
  const source = buildSync({
    absWorkingDir: resolve('.'),
    entryPoints: ['e2e/firefox-extension-fixture.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    tsconfig: 'tsconfig.json',
  }).outputFiles[0].text;
  await page.addInitScript({ content: source });
  // The production bridge admits local development on 5173; preview still supplies the built assets.
  await page.route('http://127.0.0.1:5173/**', async (route) => {
    const url = route.request().url().replace(':5173', ':4173');
    await route.fulfill({ response: await route.fetch({ url }) });
  });
  await page.goto('http://127.0.0.1:5173/duofollow/');
  const row = page.locator('[data-following-id="202"]');
  await expect(row).toContainText('@Target');
  await page.getByRole('link', { name: 'Privacy Policy', exact: true }).first().click();
  await page.getByRole('link', { name: 'Back to comparison', exact: true }).click();
  await expect(row).toBeVisible();
  await expect(page.locator('.connection-dialog')).not.toBeVisible();
  await row.getByRole('button', { name: /^Unfollow / }).click();
  await page
    .getByRole('dialog', { name: 'Unfollow this user?' })
    .getByRole('button', { name: 'Unfollow', exact: true })
    .click();
  await expect(row).toHaveCount(0);
});
