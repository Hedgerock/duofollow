import { expect, test } from 'playwright/test';

import { connectorCommands, openComparison } from '@duofollow/e2e/connector-fixture';

for (const closeKey of ['Escape', 'Enter']) {
  test(`restores the select hint after native picker ${closeKey} without moving the pointer`, async ({
    page,
  }) => {
    const panel = await openComparison(page);
    const select = panel.getByRole('combobox', { name: 'Sort follows' });
    await select.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Sort follows');
    await select.click();
    await expect.poll(() => select.evaluate((element) => element.matches(':open'))).toBe(true);
    // Keep the native popup open beyond the tooltip removal animation.
    await page.waitForTimeout(250);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    if (closeKey === 'Enter') await page.keyboard.press('ArrowDown');
    await page.keyboard.press(closeKey);
    await expect.poll(() => select.evaluate((element) => element.matches(':open'))).toBe(false);
    await expect(page.getByRole('tooltip')).toHaveText('Sort follows');
    if (closeKey === 'Enter') await expect(select).toHaveValue('name-asc');
  });
}

test('restores a keyboard select hint and dismisses it again with Escape', async ({ page }) => {
  const panel = await openComparison(page);
  const select = panel.getByRole('combobox', { name: 'Sort follows' });
  await page.mouse.move(0, 0);
  await select.focus();
  await expect(page.getByRole('tooltip')).toHaveText('Sort follows');
  await select.press('Alt+ArrowDown');
  await expect.poll(() => select.evaluate((element) => element.matches(':open'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveText('Sort follows');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('hands the hint to the next marker without overlapping portals or restarting its entrance', async ({
  page,
}) => {
  const panel = await openComparison(page);
  const first = panel.locator('.relationship-marker').nth(0);
  const next = panel.locator('.relationship-marker').nth(1);
  await first.hover();
  await expect(page.getByRole('tooltip')).toHaveText('Mutual');
  await expect(page.getByRole('tooltip')).toHaveCSS('opacity', '1');
  await page.evaluate(() => {
    const counts = [document.querySelectorAll('.ui-tooltip').length];
    Reflect.set(window, '__tooltipPortalCounts', counts);
    new MutationObserver(() =>
      counts.push(document.querySelectorAll('.ui-tooltip').length),
    ).observe(document.body, { childList: true });
  });
  await next.hover();
  const hint = page.getByRole('tooltip');
  await expect(hint).toHaveText('Non-mutual');
  await expect(page.locator('.ui-tooltip')).toHaveCount(1);
  expect(await page.evaluate(() => Math.max(...Reflect.get(window, '__tooltipPortalCounts')))).toBe(
    1,
  );
  await expect(hint).toHaveCSS('animation-name', 'none');
  await expect(hint).toHaveCSS('opacity', '1');
  await expect(hint).toHaveCSS('pointer-events', 'none');
});

test('moving onto the hint cannot keep it open or intercept the element beneath it', async ({
  page,
}) => {
  await openComparison(page);
  await page.locator('.site-home-link').hover();
  const hint = page.getByRole('tooltip');
  await expect(hint).toHaveText('Back to comparison');
  await expect(hint).toHaveCSS('pointer-events', 'none');
  const bounds = (await hint.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('respects reduced motion from the first tooltip opening', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openComparison(page);
  await page.locator('.site-home-link').hover();
  const hint = page.getByRole('tooltip');
  await expect(hint).toHaveText('Back to comparison');
  await expect(hint).toHaveCSS('animation-name', 'none');
  await expect(hint).toHaveCSS('transition-duration', '0s');
});

test('turns hints off and on without changing accessible names, navigation, or comparison state', async ({
  page,
}) => {
  await openComparison(page);
  await expect(page.locator('.relationship-marker').first()).toHaveCSS('cursor', 'help');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const choice = page.getByRole('checkbox', { name: 'Show tooltips' });
  await expect(choice).toBeChecked();
  await page.getByRole('button', { name: 'Switch to light theme' }).hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  // Change the setting while the pointer and open hint remain on the theme button.
  await choice.evaluate((element) => (element as HTMLInputElement).click());
  await expect(choice).not.toBeChecked();
  await expect(page.locator('.ui-tooltip')).toHaveCount(0);
  const theme = page.getByRole('button', { name: 'Switch to light theme' });
  await theme.hover();
  await theme.focus();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await theme.click();
  await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to comparison', exact: true }).click();
  await page.locator('.relationship-marker').first().hover();
  await expect(page.locator('.relationship-marker').first()).toHaveCSS('cursor', 'default');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  expect(
    (await connectorCommands(page)).filter((type) => type === 'GET_FOLLOWING_SUMMARY'),
  ).toHaveLength(1);
  await page.goto('/duofollow/settings/');
  await expect(choice).not.toBeChecked();
  await expect(page.locator('.page')).toHaveAttribute('data-tooltips', 'false');
  await choice.check();
  await page.getByRole('button', { name: 'Switch to light theme' }).hover();
  await expect(page.getByRole('tooltip')).toHaveText('Switch to light theme');
  await page.getByRole('link', { name: 'Back to comparison', exact: true }).click();
  await page.getByRole('button', { name: 'All received', exact: true }).click();
  await expect(page.locator('.relationship-marker').first()).toHaveCSS('cursor', 'help');
});

test('enables hints by default in a fresh browser without saved appearance', async ({ page }) => {
  await page.goto('/duofollow/settings/');
  expect(await page.evaluate(() => localStorage.getItem('duofollow.appearance'))).toBeNull();
  await expect(page.getByRole('checkbox', { name: 'Show tooltips' })).toBeChecked();
  await expect(page.locator('.page')).toHaveAttribute('data-tooltips', 'true');
  await page.locator('.site-home-link').hover();
  await expect(page.getByRole('tooltip')).toHaveText('Back to comparison');
});

test('defaults hints on for old and invalid preferences and translates the option', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('duofollow.appearance', JSON.stringify({ tooltips: 'false' })),
  );
  await page.goto('/duofollow/settings/');
  await expect(page.getByRole('checkbox', { name: 'Show tooltips' })).toBeChecked();
  await page.locator('.language-select').selectOption('ru');
  await expect(page.getByRole('checkbox', { name: 'Показывать подсказки' })).toBeChecked();
  await page.locator('.language-select').selectOption('uk');
  await expect(page.getByRole('checkbox', { name: 'Показувати підказки' })).toBeChecked();
});
