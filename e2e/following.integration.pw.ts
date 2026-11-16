import { expect, test } from 'playwright/test';

import { connectorCommands, openComparison } from '@duofollow/e2e/connector-fixture';

test('filters received profiles and switches views without comparing again', async ({ page }) => {
  const panel = await openComparison(page);
  const count = panel.locator('.following-count');
  await expect(count.locator('strong')).toHaveText('3');
  const marker = panel.locator('.relationship-marker[data-relationship="mutual"]');
  await expect(marker).toHaveAccessibleName('Mutual');
  await expect(panel.locator('[data-following-id]')).toHaveCount(3);
  await panel.getByRole('searchbox').fill('セリ');
  await expect(panel.locator('[data-following-id]')).toHaveCount(1);
  await expect(count).toHaveText('1 of 3');
  await expect(panel.getByText('セリーナ')).toBeVisible();
  await panel
    .getByRole('group', { name: 'Show follows' })
    .getByRole('button', { name: 'Mutual', exact: true })
    .click();
  await expect(panel.getByRole('searchbox')).toHaveValue('セリ');
  await expect(panel.getByText('セリーナ')).toBeVisible();
  expect(
    (await connectorCommands(page)).filter((type) => type === 'GET_FOLLOWING_SUMMARY'),
  ).toHaveLength(1);
});

test('reports a malformed comparison and restores the previous list', async ({ page }) => {
  const panel = await openComparison(page, { refreshFields: { following: {} } });
  await expect(panel.locator('[data-following-id]')).toHaveCount(3);

  await page.getByRole('button', { name: 'Compare my follows' }).click();

  await expect(page.getByText('Could not compare follows')).toBeVisible();
  await expect(page.getByText('The response was unexpected.', { exact: false })).toBeVisible();
  await expect(panel.locator('[data-following-id]')).toHaveCount(3);
  await expect(panel.getByText('セリーナ')).toBeVisible();
});

test('tracks the cursor and exposes the same tooltip from the keyboard', async ({ page }) => {
  const panel = await openComparison(page);
  const marker = panel.locator('.relationship-marker[data-relationship="mutual"]');
  await marker.hover({ position: { x: 10, y: 15 } });
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toHaveText('Mutual');
  const markerBox = await marker.boundingBox();
  const start = await tooltip.boundingBox();
  if (!markerBox || !start) throw new Error('The relationship marker and tooltip must be visible');
  await page.mouse.move(markerBox.x + 12, markerBox.y + 35);
  await expect.poll(async () => (await tooltip.boundingBox())?.y ?? 0).toBeGreaterThan(start.y);
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);

  await page.mouse.move(0, 0);
  await marker.press('Space');
  await expect(tooltip).toHaveText('Mutual');
  await expect(marker).toBeFocused();
  await marker.press('Escape');
  await expect(tooltip).toHaveCount(0);
});

test('marks incomplete follower data at 320 px without offering unfollow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  const panel = await openComparison(page, { incomplete: true });
  await expect(panel.getByRole('button', { name: 'Non-mutual', exact: true })).toBeDisabled();
  await expect(panel.getByRole('group', { name: 'Show follows' })).toHaveAccessibleDescription(
    'A full followers list is required.',
  );
  await expect(panel.getByText('A full followers list is required.')).toBeVisible();
  const search = await panel.getByRole('searchbox').boundingBox();
  const sort = panel.getByRole('combobox', { name: 'Sort follows' });
  const sortBounds = await sort.boundingBox();
  expect(sortBounds).toMatchObject({ width: 44, y: search?.y });
  await sort.selectOption('name-asc');
  await expect(panel.locator('[data-following-id]').first()).toHaveAttribute(
    'data-following-id',
    '4',
  );
  const marker = panel.locator('.relationship-marker[data-relationship="unknown"]').first();
  await expect(marker).toHaveAccessibleName('Unconfirmed');
  await expect(panel.getByRole('button', { name: /^Unfollow / })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.setViewportSize({ width: 280, height: 760 });
  await expect
    .poll(() => page.locator('.page').evaluate((element) => element.getBoundingClientRect().width))
    .toBe(320);
});

test('updates the all-received list only after confirmed unfollow', async ({ page }) => {
  const panel = await openComparison(page);
  const row = panel.locator('[data-following-id="3"]');
  const action = row.getByRole('button', { name: /^Unfollow / });
  const dialog = page.getByRole('dialog', { name: 'Unfollow this user?' });

  await action.click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(row).toBeVisible();
  expect(await connectorCommands(page)).not.toContain('UNFOLLOW');

  await action.click();
  await dialog.getByRole('button', { name: 'Unfollow', exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(panel.locator('[data-following-id]')).toHaveCount(2);
  expect((await connectorCommands(page)).filter((type) => type === 'UNFOLLOW')).toHaveLength(1);
});
