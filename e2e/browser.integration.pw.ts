import { expect, test } from 'playwright/test';

import { openComparison } from '@duofollow/e2e/connector-fixture';

test('comparison and access settings use the ID configured for the current browser', async ({
  page,
}) => {
  await openComparison(page, { activeAccount: true });
  await page.getByRole('link', { name: 'Manage Duolingo access', exact: true }).first().click();
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open settings', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const { ids, isEdge, commands } = await page.evaluate(() => ({
    ids: Reflect.get(window, '__duofollowTestExtensionIds') as string[],
    isEdge: /\bEdg\//.test(navigator.userAgent),
    commands: Reflect.get(window, '__duofollowTestCommands') as string[],
  }));
  expect(commands).toContain('GET_FOLLOWING_SUMMARY');
  expect(commands).toContain('OPEN_DUOLINGO_SETTINGS');
  expect(ids.length).toBeGreaterThan(2);
  expect(new Set(ids)).toEqual(
    new Set([isEdge ? 'ponmlkjihgfedcbaponmlkjihgfedcba' : 'abcdefghijklmnopabcdefghijklmnop']),
  );
});

for (const locale of ['en', 'ru', 'uk']) {
  test(`connection help uses the browser extension page in ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.addInitScript(
      (locale) => localStorage.setItem('duofollow.language', locale),
      locale,
    );
    await page.goto('/duofollow/');
    const dialog = page.locator('.connection-dialog');
    await expect(dialog).toBeVisible();
    const isEdge = await page.evaluate(() => /\bEdg\//.test(navigator.userAgent));
    await expect(dialog).toContainText(isEdge ? 'edge://extensions' : 'chrome://extensions');
    await expect(dialog).not.toContainText(isEdge ? 'chrome://extensions' : 'edge://extensions');
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  });
}
