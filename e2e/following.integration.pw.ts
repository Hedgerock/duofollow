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

test('matches the comparison skeleton to the result card heights during refresh', async ({
  page,
}) => {
  await openComparison(page, {
    holdRefresh: true,
  });
  const skeleton = page.locator('.comparison-skeleton');
  const stats = page.locator('.stats');
  const measure = () =>
    stats.locator('article').evaluateAll((cards) => cards.map((card) => card.clientHeight));
  const viewports = [
    { width: 1100, height: 900 },
    { width: 320, height: 820 },
  ];

  await page.getByRole('button', { name: 'Compare my follows' }).click();
  await expect(skeleton).toBeVisible();
  await expect(stats).toHaveAttribute('aria-hidden', 'true');
  const loadingHeights = [];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    loadingHeights.push(await measure());
  }

  await page.evaluate(() => window.dispatchEvent(new Event('duofollow-test:release-refresh')));
  await expect(skeleton).toBeHidden();
  await expect(stats).not.toHaveAttribute('aria-hidden', 'true');
  const resultHeights = [];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    resultHeights.push(await measure());
  }
  expect(loadingHeights).toEqual(resultHeights);
});

test('keeps collapsed result cards the same height with one partial-coverage label', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await openComparison(page, {
    refreshFields: { coverage: { following: 'cursor-present', followers: 'complete' } },
  });
  await page.getByRole('button', { name: 'Compare my follows' }).click();
  await page.locator('.topbar .language-select').selectOption('ru');

  const cards = page.locator('.stats article');
  await expect(cards).toHaveCount(4);
  await expect(cards.first().getByRole('button', { name: /Частично/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  const [firstHeight, ...otherHeights] = await cards.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().height),
  );
  expect(otherHeights).toEqual([firstHeight, firstHeight, firstHeight]);
});

test('explains partial coverage next to both counters at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const panel = await openComparison(page, {
    incomplete: true,
    refreshFields: { coverage: { following: 'cursor-present', followers: 'total-mismatch' } },
  });

  await page.getByRole('button', { name: 'Compare my follows' }).click();

  const stats = page.locator('.stats');
  const following = stats.locator('article').nth(0);
  const followers = stats.locator('article').nth(1);
  const followingToggle = following.getByRole('button', { name: /Partial/ });
  const followersToggle = followers.getByRole('button', { name: /Partial/ });
  const followersLabel = followersToggle.getByText('Partial');
  const followingPanel = following.locator('.comparison-coverage-panel');
  const followingExplanation = following.getByText(
    'Only profiles from the first part of the Duolingo list were checked.',
  );
  const followersExplanation = followers.getByText(
    'The number of profiles received differs from the total shown in Duolingo.',
  );

  await expect(followingToggle.getByText('Partial')).toBeVisible();
  await expect(followersLabel).toBeVisible();
  await expect(followingExplanation).toBeHidden();
  await expect(followersExplanation).toBeHidden();
  const statsHeight = () => stats.evaluate((element) => element.clientHeight);
  const closedHeight = await statsHeight();
  const followersHeight = () => followers.evaluate((element) => element.clientHeight);
  const closedFollowersHeight = await followersHeight();

  await followingToggle.press('Enter');
  await expect(followingToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(followingExplanation).toBeVisible();
  await expect(followingPanel).toHaveCSS('opacity', '1');
  await expect.poll(statsHeight).toBeGreaterThan(closedHeight);
  expect(await followersHeight()).toBe(closedFollowersHeight);

  await followingPanel.evaluate((element) => {
    element.addEventListener('transitionrun', (event) => {
      if (event instanceof TransitionEvent && event.propertyName === 'grid-template-rows') {
        element.setAttribute('data-collapse-started', 'true');
      }
    });
  });
  await followingToggle.press('Tab');
  await expect(followersToggle).toBeFocused();
  await expect(followingToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(followingPanel).toHaveAttribute('data-collapse-started', 'true');
  await expect(followingExplanation).toBeHidden();
  await expect.poll(statsHeight).toBe(closedHeight);

  await followingToggle.press('Space');
  await expect(followingExplanation).toBeVisible();
  await followingToggle.press('Escape');
  await expect(followingExplanation).toBeHidden();
  await expect(followingToggle).toBeFocused();
  await expect.poll(statsHeight).toBe(closedHeight);

  await expect(followersLabel).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await followersLabel.hover();
  await expect(followersLabel).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(followersLabel).toHaveCSS('transition-duration', '0s');
  await followersLabel.click();
  await expect(followersExplanation).toBeVisible();
  await expect(followers.locator('.comparison-coverage-panel')).toHaveCSS(
    'transition-duration',
    '0s',
  );
  await expect.poll(statsHeight).toBeGreaterThan(closedHeight);
  await expect(panel.getByRole('button', { name: 'Non-mutual', exact: true })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
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

test('confirms quick unfollow in the site dialog and keeps the card after cancel', async ({
  page,
}) => {
  const panel = await openComparison(page, { quickUnfollow: true });
  const target = panel.locator('[data-following-id="4"]');
  const action = target.getByRole('button', { name: /^Unfollow / });
  const dialog = page.getByRole('dialog', { name: 'Unfollow this user?' });
  await action.click();
  await expect(dialog).toBeVisible();
  expect(await connectorCommands(page)).not.toContain('REQUEST_QUICK_UNFOLLOW');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(target).toBeVisible();
  expect(await connectorCommands(page)).not.toContain('REQUEST_QUICK_UNFOLLOW');

  await action.click();
  await dialog.getByRole('button', { name: 'Unfollow', exact: true }).click();
  await expect(target).toHaveCount(0);
  expect((await connectorCommands(page)).filter((type) => type.includes('QUICK_UNFOLLOW'))).toEqual(
    [
      'GET_QUICK_UNFOLLOW',
      'GET_QUICK_UNFOLLOW',
      'REQUEST_QUICK_UNFOLLOW',
      'CONFIRM_QUICK_UNFOLLOW',
    ],
  );
});

test('refreshes the open unfollow dialog when quick unfollow is turned off', async ({ page }) => {
  const panel = await openComparison(page, { quickUnfollow: true });
  const target = panel.locator('[data-following-id="4"]');
  await target.getByRole('button', { name: /^Unfollow / }).click();
  const dialog = page.getByRole('dialog', { name: 'Unfollow this user?' });
  await expect(dialog.getByRole('button', { name: 'Unfollow', exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('duofollow-test:quick-unfollow', { detail: false }));
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Anna Rivers', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue in Connector', exact: true }).click();
  const commands = await connectorCommands(page);
  expect(commands).toContain('REQUEST_UNFOLLOW');
  expect(commands).not.toContain('REQUEST_QUICK_UNFOLLOW');
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
  expect(await connectorCommands(page)).not.toContain('REQUEST_UNFOLLOW');

  await action.click();
  await dialog.getByRole('button', { name: 'Continue in Connector', exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(panel.locator('[data-following-id]')).toHaveCount(2);
  expect(
    (await connectorCommands(page)).filter((type) => type === 'REQUEST_UNFOLLOW'),
  ).toHaveLength(1);
});
