import { expect, type Locator, test } from 'playwright/test';

import { connectorCommands, openComparison } from '@duofollow/e2e/connector-fixture';

const identity = {
  accountUsername: 'test_profile_'.repeat(6),
  profile: {
    displayName: 'ДужеДовгеІм’яКористувача'.repeat(8),
    username: 'alphabet_'.repeat(8),
  },
};

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'duofollow.appearance',
      JSON.stringify({ fontSize: 'extra-large', fontFamily: 'wide', colorVision: false }),
    );
  });
});

async function expectNoInlineOverflow(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect
    .poll(() => locator.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(1);
}

test('keeps the header controls inside the viewport with a long result username', async ({
  page,
}) => {
  await openComparison(page, { identity });
  const header = page.locator('.topbar');
  const controls = header.locator('.topbar-controls');
  const username = header.locator('.topbar-profile-text strong');
  await header.getByRole('combobox').selectOption('uk');
  await expect(page.locator('html')).toHaveCSS('font-size', '20px');
  for (const width of [320, 551, 673, 1100]) {
    await page.setViewportSize({ width, height: 700 });
    await expectNoInlineOverflow(page.locator('html'));
    await expectNoInlineOverflow(controls);
    await expect(username).toHaveAttribute('title', '@' + identity.accountUsername);
    await expect(header.getByRole('link', { name: 'Налаштування' })).toBeInViewport();
  }
});

test('wraps the translated list heading beside a five-digit search total', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const panel = await openComparison(page, { identity, profileCount: 10_000 });
  await page.locator('.topbar .language-select').selectOption('ru');
  await panel.getByRole('searchbox').fill(identity.profile.username);

  const heading = panel.getByRole('heading', { name: 'Все полученные' });
  const count = panel.locator('.following-count');
  await expect(count).toHaveText(/^1 из 10\s000$/);
  await expectNoInlineOverflow(heading);
  await expectNoInlineOverflow(count);
  await expectNoInlineOverflow(panel);

  const row = panel.locator('[data-following-id="4"]');
  await expect(row).toHaveAttribute('aria-setsize', '1');
  await expect(row.locator('.profile-card-text strong')).toHaveAttribute(
    'title',
    identity.profile.displayName,
  );
  await expect(row.locator('.profile-card-text span')).toHaveCSS('text-overflow', 'ellipsis');
  await expect(row.getByRole('button', { name: /^Отписаться/ })).toBeVisible();
});

test('keeps the Ukrainian coverage explanation inside its card at 125% text size', async ({
  page,
}) => {
  const panel = await openComparison(page, {
    refreshFields: { coverage: { following: 'cursor-present', followers: 'complete' } },
  });
  await page.getByRole('button', { name: 'Compare my follows' }).click();
  await page.locator('.topbar .language-select').selectOption('uk');
  await expect(page.locator('html')).toHaveCSS('font-size', '20px');

  const card = page.locator('.stats article').first();
  const toggle = card.getByRole('button', { name: /Частково/ });
  const explanation = card.getByText('Перевірено лише профілі з першої частини списку Duolingo.');

  for (const width of [1100, 320]) {
    await page.setViewportSize({ width, height: 820 });
    await toggle.click();
    await expectNoInlineOverflow(explanation);
    const cardBounds = await card.boundingBox();
    const explanationBounds = await explanation.boundingBox();
    const listBounds = await panel.boundingBox();
    if (!cardBounds || !explanationBounds || !listBounds) {
      throw new Error('The coverage card, explanation, and list must be visible');
    }
    const explanationBottom = explanationBounds.y + explanationBounds.height;
    expect(explanationBottom).toBeLessThanOrEqual(cardBounds.y + cardBounds.height);
    expect(explanationBottom).toBeLessThan(listBounds.y);

    await toggle.press('Escape');
    await expect(explanation).toBeHidden();
  }
});

test('keeps the Ukrainian Connector retry label in its button in a short window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 250 });
  await page.addInitScript(() => localStorage.setItem('duofollow.language', 'uk'));
  await page.goto('/duofollow/');

  const dialog = page.getByRole('dialog');
  const retry = dialog.getByRole('button', { name: 'Перевірити знову' });
  const close = dialog.getByRole('button', { name: 'Закрити', exact: true });
  await expectNoInlineOverflow(retry);
  await expectNoInlineOverflow(dialog.locator('.connection-dialog-actions'));
  await dialog.getByRole('button', { name: 'Як встановити з проєкту' }).click();
  const body = dialog.locator('.connection-dialog-body');
  await expect
    .poll(() => body.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);
  await expect(retry).toBeInViewport({ ratio: 1 });
  await expect(close).toBeInViewport({ ratio: 1 });
  await retry.click();
  await expect(dialog.getByRole('status')).toHaveText('Підключення ще не відновлено.');
  await expectNoInlineOverflow(body);
  await close.click();
  await expect(dialog).toBeHidden();
});

test('keeps cancellation reachable with long profile details in the unfollow dialog', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 360 });
  const panel = await openComparison(page, { identity });
  const row = panel.locator('[data-following-id="4"]');
  const unfollow = row.getByRole('button', { name: /^Unfollow / });
  await unfollow.click();

  const dialog = page.getByRole('dialog', { name: 'Unfollow this user?' });
  const cancel = dialog.getByRole('button', { name: 'Cancel' });
  await expectNoInlineOverflow(dialog);
  await expectNoInlineOverflow(dialog.locator('.unfollow-dialog-profile-text'));
  await expect(dialog.getByText(identity.profile.displayName, { exact: true })).toHaveCount(1);
  await expect(cancel).toBeFocused();
  await expect(cancel).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(unfollow).toBeFocused();
  expect(await connectorCommands(page)).not.toContain('REQUEST_UNFOLLOW');
});
