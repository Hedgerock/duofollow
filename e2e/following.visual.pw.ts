import { expect, test } from 'playwright/test';

import { openComparison } from '@duofollow/e2e/connector-fixture';

test.use({ contextOptions: { reducedMotion: 'no-preference' } });

test('desktop dark relationships and tooltip', async ({ page }) => {
  const panel = await openComparison(page);
  await page.mouse.move(0, 0);
  await expect(panel).toHaveScreenshot('relationships-desktop-dark.png', {
    animations: 'disabled',
  });
  await panel.locator('.relationship-marker[data-relationship="mutual"]').hover({
    position: { x: 10, y: 20 },
  });
  await expect(page.getByRole('tooltip')).toHaveScreenshot('relationship-tooltip-dark.png', {
    animations: 'disabled',
  });
});

test('320 px light relationships with partial coverage', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  const panel = await openComparison(page, { incomplete: true, theme: 'light' });
  await panel.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('relationships-mobile-light.png', {
    animations: 'disabled',
  });
});
