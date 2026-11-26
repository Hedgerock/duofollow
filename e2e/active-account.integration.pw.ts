import { connectorCommands, openComparison } from '@duofollow/e2e/connector-fixture';
import { expect, test } from '@duofollow/e2e/test';

test('automatically compares the connected account and refreshes it at 320 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openComparison(page, { activeAccount: true, holdRefresh: true });

  const account = page.locator('.connected-account-profile');
  await expect(account).toHaveText(/@lingua_demo.*Connected/u);
  await expect(account).toHaveAttribute('href', 'https://www.duolingo.com/profile/lingua_demo');
  await expect(page.locator('#duolingo-username')).toHaveCount(0);
  await expect(page.locator('.topbar-profile')).toHaveAttribute(
    'href',
    'https://www.duolingo.com/profile/lingua_demo',
  );
  const box = await account.boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);

  await page.getByRole('link', { name: 'Privacy Policy' }).click();
  await page.getByRole('link', { name: 'Back to comparison' }).click();
  await expect(account).toBeVisible();
  expect(
    (await connectorCommands(page)).filter((command) => command === 'GET_FOLLOWING_SUMMARY'),
  ).toHaveLength(1);

  const readyHeight = (await account.boundingBox())?.height;
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Refresh comparison' }).click();
  await expect(page.getByRole('button', { name: 'Comparing…' })).toBeDisabled();
  await expect(page.locator('.comparison-results')).toHaveAttribute('aria-busy', 'true');
  await expect(account).toHaveAttribute('inert', '');
  await expect(account.locator('.connected-account-details')).toBeHidden();
  const avatarSkeleton = account.locator('.profile-avatar.skeleton-bar');
  await expect(avatarSkeleton).toBeVisible();
  await expect(account.locator('.skeleton-bar')).toHaveCount(3);
  expect((await account.boundingBox())?.height).toBe(readyHeight);
  const animationName = () =>
    avatarSkeleton.evaluate((avatar) => getComputedStyle(avatar, '::after').animationName);
  await expect.poll(animationName).toBe('skeleton-shimmer');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(animationName).toBe('none');

  await page.evaluate(() => window.dispatchEvent(new Event('duofollow-test:release-refresh')));
  await expect(page.locator('.comparison-results')).toHaveAttribute('aria-busy', 'false');
  await expect(account).not.toHaveAttribute('inert', '');
  await expect(account.locator('.connected-account-details')).toBeVisible();
  await expect(account.locator('.skeleton-bar')).toHaveCount(0);
  expect(
    (await connectorCommands(page)).filter((command) => command === 'GET_FOLLOWING_SUMMARY'),
  ).toHaveLength(2);
});
