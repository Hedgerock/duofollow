import { connectorCommands, openComparison } from '@duofollow/e2e/connector-fixture';
import { focusWithKeyboard } from '@duofollow/e2e/keyboard';
import { expect, test } from '@duofollow/e2e/test';

for (const viewport of [
  { width: 1100, height: 940 },
  { width: 796, height: 800 },
  { width: 320, height: 820 },
]) {
  test(`fits the complete list panel at the outer scroll limit at ${viewport.width} px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() =>
      localStorage.setItem(
        'duofollow.appearance',
        JSON.stringify({ fontSize: 'extra-large', fontFamily: 'system', colorVision: false }),
      ),
    );
    const panel = await openComparison(page, { profileCount: 1000 });
    await page.locator('.topbar .language-select').selectOption('uk');
    const content = page.locator('.site-content');
    const list = panel.locator('.virtual-following');
    const chrome = await Promise.all([
      page.locator('.topbar').boundingBox(),
      page.locator('footer').boundingBox(),
    ]);
    await content.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect
      .poll(async () => {
        const region = (await content.boundingBox())!;
        const bounds = (await panel.boundingBox())!;
        return (
          bounds.y >= region.y + 15 && bounds.y + bounds.height <= region.y + region.height - 15
        );
      })
      .toBe(true);
    const outerScroll = await content.evaluate((element) => element.scrollTop);
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(list.locator('[aria-posinset="1000"]')).toBeVisible();
    expect(await content.evaluate((element) => element.scrollTop)).toBe(outerScroll);
    expect(
      await Promise.all([
        page.locator('.topbar').boundingBox(),
        page.locator('footer').boundingBox(),
      ]),
    ).toEqual(chrome);
    expect(await list.locator('[data-following-id]').count()).toBeLessThanOrEqual(24);
    const listHeight = (await list.boundingBox())!.height;
    await panel.getByRole('searchbox').fill('no-profile-matches-this');
    await expect(list.locator('.empty')).toBeVisible();
    expect((await list.boundingBox())!.height).toBe(listHeight);
    expect(
      (await connectorCommands(page)).filter((type) => type === 'GET_FOLLOWING_SUMMARY'),
    ).toHaveLength(1);
  });
}

test('header tooltips support hover, keyboard, Escape and normal navigation', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  await openComparison(page);
  const settings = page.getByRole('link', { name: 'Settings', exact: true });
  const theme = page.getByRole('button', { name: 'Switch to light theme' });
  await expect(settings).not.toHaveAttribute('title');
  await expect(theme).not.toHaveAttribute('title');
  await theme.hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toHaveText('Switch to light theme');
  const bounds = (await tooltip.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(8);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(312);
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
  await page.mouse.move(0, 0);
  await focusWithKeyboard(page, settings);
  await expect(page.getByRole('tooltip')).toHaveText('Settings');
  await expect(settings).toHaveAttribute('aria-describedby', /\S+/);
  await settings.press('Enter');
  await expect(page).toHaveURL(/\/settings\/$/);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await focusWithKeyboard(page, page.locator('.site-home-link'));
  await expect(page.getByRole('tooltip')).toHaveText('Back to comparison');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/duofollow\/$/);
  expect(
    (await connectorCommands(page)).filter((type) => type === 'GET_FOLLOWING_SUMMARY'),
  ).toHaveLength(1);
});

test('the brand reacts without moving the header and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openComparison(page);
  const brand = page.locator('.site-home-link');
  const icon = brand.locator('img');
  const initial = await brand.boundingBox();
  await brand.hover();
  await expect
    .poll(() => icon.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe('none');
  expect(await brand.boundingBox()).toEqual(initial);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(icon).toHaveCSS('transform', 'none');
  await expect(icon).toHaveCSS('transition-duration', '0s');
});

for (const width of [1100, 320]) {
  test(`keeps the next unfollow button reachable below a hint at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 820 });
    const panel = await openComparison(page);
    const buttons = panel.locator('.profile-card-unfollow');
    const first = buttons.nth(0);
    const next = buttons.nth(1);
    await first.hover();
    const hint = page.getByRole('tooltip');
    await expect(hint).toHaveText('Unfollow');
    await expect(hint).toHaveCSS('pointer-events', 'none');
    const buttonBounds = (await first.boundingBox())!;
    const hintBounds = (await hint.boundingBox())!;
    expect(hintBounds.x + hintBounds.width).toBeLessThanOrEqual(buttonBounds.x - 7);
    expect(hintBounds.y).toBeGreaterThanOrEqual(buttonBounds.y - 1);
    expect(hintBounds.y + hintBounds.height).toBeLessThanOrEqual(
      buttonBounds.y + buttonBounds.height + 1,
    );
    // The previous below-button hint covered this upper part of the next action.
    await next.hover({ position: { x: 10, y: 2 } });
    await expect(hint).toHaveText('Unfollow');
    await next.click({ position: { x: 10, y: 2 } });
    await expect(page.locator('.unfollow-dialog')).toBeVisible();
    await expect(page.locator('.unfollow-dialog-profile')).toContainText('@anna_r');
    expect(
      (await connectorCommands(page)).filter((type) => type === 'GET_FOLLOWING_SUMMARY'),
    ).toHaveLength(1);
  });
}

for (const width of [1100, 320]) {
  test(`does not repeat fully visible profile text at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 820 });
    const panel = await openComparison(page, {
      identity: {
        accountUsername: 'lingua_demo',
        profile: { displayName: 'Bo Pedersen', username: 'BoPedersen' },
      },
    });
    const text = panel.locator('[data-following-id="4"] .profile-card-text');
    await text.locator('strong').hover();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await text.focus();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await expect(text).not.toHaveAttribute('title');
    await expect(text.locator('strong')).not.toHaveAttribute('title');
    await expect(text.locator('span')).not.toHaveAttribute('title');
  });
}

test('reveals a truncated username even when its display name fits', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const username = 'profile_' + 'x'.repeat(80);
  const panel = await openComparison(page, {
    identity: { accountUsername: 'lingua_demo', profile: { displayName: 'Bo', username } },
  });
  const text = panel.locator('[data-following-id="4"] .profile-card-text');
  await text.locator('span').hover();
  await expect(page.getByRole('tooltip')).toContainText('@' + username);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test.describe('touch status hints', () => {
  test.use({ hasTouch: true });
  test('opens the relationship hint by touch without starting a data command', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 820 });
    const panel = await openComparison(page);
    const before = await connectorCommands(page);
    await panel.locator('.relationship-marker[data-relationship="mutual"]').tap();
    await expect(page.getByRole('tooltip')).toHaveText('Mutual');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    expect(await connectorCommands(page)).toEqual(before);
  });
});
