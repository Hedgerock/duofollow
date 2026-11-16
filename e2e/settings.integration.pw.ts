import { expect, test } from 'playwright/test';

import { connectorCommands, openComparison } from '@duofollow/e2e/connector-fixture';

test('applies appearance to the comparison and remembers it across reloads at 320 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const panel = await openComparison(page);
  const defaultRow = panel.locator('[data-following-id="2"]');
  await expect(defaultRow).toHaveCSS('height', '68px');

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/duofollow\/settings\/$/);
  await expect(page).toHaveTitle('DuoFollow — Settings');
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('combobox', { name: 'Text size' }).selectOption('large');
  await page.getByRole('combobox', { name: 'Typeface' }).selectOption('wide');
  await expect(page.locator('html')).toHaveCSS('font-size', '18px');
  await expect(page.locator('html')).toHaveCSS('font-family', /Verdana/);
  await page.getByRole('combobox', { name: 'Text size' }).selectOption('extra-large');
  await page.getByRole('combobox', { name: 'Typeface' }).selectOption('serif');
  await page.getByRole('checkbox', { name: 'Color vision mode' }).check();
  await expect(page.locator('html')).toHaveCSS('font-size', '20px');
  await expect(page.locator('html')).toHaveCSS('font-family', /Georgia/);

  const badges = page.getByRole('list', { name: 'Follow status legend' }).getByRole('listitem');
  const patterns = await badges.evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element, '::before').maskImage),
  );
  expect(patterns).toEqual([
    'none',
    expect.stringContaining('repeating-linear-gradient'),
    expect.stringContaining('radial-gradient'),
  ]);
  await page.getByRole('link', { name: 'Back to comparison' }).click();
  await expect(panel.locator('[data-following-id="2"]')).toHaveCSS('height', '85px');
  await expect(panel.locator('[data-following-id="3"]')).toHaveCSS('top', '85px');
  expect(
    (await connectorCommands(page)).filter((type) => type === 'GET_FOLLOWING_SUMMARY'),
  ).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  await page.goto('/duofollow/settings/index.html');
  await expect(page).toHaveURL(/\/duofollow\/settings\/$/);
  await expect(page.getByRole('combobox', { name: 'Text size' })).toHaveValue('extra-large');
  await expect(page.getByRole('combobox', { name: 'Typeface' })).toHaveValue('serif');
  await expect(page.getByRole('checkbox', { name: 'Color vision mode' })).toBeChecked();
  expect(await connectorCommands(page)).toEqual([]);
});

test('opens settings without Connector and ignores invalid persisted choices', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'duofollow.appearance',
      '{"fontSize":"constructor","fontFamily":"missing"}',
    );
  });
  await page.goto('/duofollow/settings/');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Text size' })).toHaveValue('standard');
  await expect(page.getByRole('combobox', { name: 'Typeface' })).toHaveValue('system');
  await expect(page.getByRole('checkbox', { name: 'Color vision mode' })).not.toBeChecked();
});
