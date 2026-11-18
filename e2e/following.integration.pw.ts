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

test('highlights the matching nickname without resizing the searched list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const panel = await openComparison(page, {
    identity: {
      accountUsername: 'lingua_demo',
      profile: { displayName: 'Jer Sal', username: 'JerSal2' },
    },
  });
  const search = panel.getByRole('searchbox');
  const body = panel.locator('.virtual-following');
  const size = () =>
    body.evaluate((list) => {
      const box = list.getBoundingClientRect();
      return {
        y: box.top - list.closest('section')!.getBoundingClientRect().top,
        height: box.height,
      };
    });
  const initial = await size();

  await search.fill('ers');
  const matches = panel.locator('[data-following-id]');
  await expect(matches).toHaveCount(1);
  await expect(matches.first()).toContainText('@JerSal2');
  const highlight = matches.locator('mark');
  await expect(highlight).toHaveText('erS');
  await expect(highlight).toHaveAttribute('data-highlight', 'true');
  expect(await size()).toEqual(initial);
  await highlight.evaluate((mark) => {
    const range = document.createRange();
    range.selectNodeContents(mark);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await expect(highlight).not.toHaveAttribute('data-highlight');
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('erS');
  await expect(matches).toHaveCount(1);

  await search.fill('not-found');
  await expect(matches).toHaveCount(0);
  expect(await size()).toEqual(initial);
  await search.clear();
  await expect(matches).toHaveCount(3);
  expect(await size()).toEqual(initial);
});

test('keeps search in place when switching away from the legend', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const panel = await openComparison(page);
  const search = panel.getByRole('searchbox');
  const searchTop = () =>
    search.evaluate(
      (input) =>
        input.getBoundingClientRect().top - input.closest('section')!.getBoundingClientRect().top,
    );
  const initial = await searchTop();
  const listHeight = () =>
    panel.locator('.virtual-following').evaluate((list) => list.getBoundingClientRect().height);
  const initialHeight = await listHeight();
  const legend = panel.locator('.following-legend');
  const views = panel.getByRole('group', { name: 'Show follows' });
  await expect(legend).toBeVisible();

  for (const view of ['Mutual', 'Non-mutual']) {
    await views.getByRole('button', { name: view, exact: true }).click();
    await expect(legend).toBeHidden();
    expect(await searchTop()).toBe(initial);
    expect(await listHeight()).toBe(initialHeight);
  }
  await views.getByRole('button', { name: 'All received', exact: true }).click();
  await expect(legend).toBeVisible();
  expect(await searchTop()).toBe(initial);
});

for (const { label, refreshFields } of [
  { label: 'malformed', refreshFields: { following: {} } },
  { label: 'inconsistent', refreshFields: { checkedFollowing: 4 } },
]) {
  test(`reports a ${label} comparison and restores the previous list`, async ({ page }) => {
    const panel = await openComparison(page, { refreshFields });
    await expect(panel.locator('[data-following-id]')).toHaveCount(3);

    await page.getByRole('button', { name: 'Compare my follows' }).click();

    await expect(page.getByText('Could not compare follows')).toBeVisible();
    await expect(page.getByText('The response was unexpected.', { exact: false })).toBeVisible();
    await expect(panel.locator('[data-following-id]')).toHaveCount(3);
    await expect(panel.getByText('セリーナ')).toBeVisible();
  });
}

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
    { width: 796, height: 800 },
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

for (const fontSize of ['standard', 'large', 'extra-large'] as const) {
  test(`aligns the result cards and their counts at ${fontSize} text size`, async ({ page }) => {
    const incomplete = fontSize !== 'standard';
    if (incomplete) {
      await page.addInitScript((size) => {
        localStorage.setItem(
          'duofollow.appearance',
          JSON.stringify({ fontSize: size, fontFamily: 'wide' }),
        );
      }, fontSize);
    }
    await openComparison(page, {
      incomplete,
      refreshFields: {
        totalFollowing: 25_000,
        coverage: {
          following: 'cursor-present',
          followers: incomplete ? 'total-mismatch' : 'complete',
        },
      },
    });
    await page.getByRole('button', { name: 'Compare my follows' }).click();

    const cards = page.locator('.stats article');
    await expect(cards).toHaveCount(4);
    await expect(cards.first().getByRole('button', { name: /Partial/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    for (const locale of ['ru', 'en', 'uk']) {
      await page.locator('.topbar .language-select').selectOption(locale);
      for (const width of [1100, 900, 796, 761, 760, 651, 650, 390, 320]) {
        await page.setViewportSize({ width, height: 820 });
        const result = await cards.evaluateAll((elements) =>
          elements.map((card) => {
            const { y, height } = card.getBoundingClientRect();
            const countY = card.querySelector('strong')?.getBoundingClientRect().y;
            return { y, height, countY };
          }),
        );
        expect(new Set(result.map(({ y }) => y)).size).toBe(width > 760 ? 1 : 2);
        for (const card of result) {
          expect(card, `${locale}, ${width}px`).toEqual(result.find((first) => first.y === card.y));
        }
      }
    }
  });
}

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
