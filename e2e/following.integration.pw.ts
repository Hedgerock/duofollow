import { expect, test } from 'playwright/test';
import { connectorCommands, openComparison } from './connector-fixture';

test('filters received profiles and switches views without comparing again', async ({ page }) => {
  const panel = await openComparison(page);
  const marker = panel.locator('.relationship-marker[data-relationship="mutual"]');
  await expect(marker).toHaveAccessibleName('Mutual');
  await expect(panel.locator('[data-following-id]')).toHaveCount(3);
  await panel.getByRole('searchbox').fill('セリ');
  await expect(panel.locator('[data-following-id]')).toHaveCount(1);
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
