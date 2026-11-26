import { connectorCommands, openComparison } from '@duofollow/e2e/connector-fixture';
import { expect, test } from '@duofollow/e2e/test';

for (const width of [1100, 320]) {
  test(`keeps the header and footer fixed across routes at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await openComparison(page);
    const content = page.locator('.site-content');
    const header = page.locator('.topbar');
    const footer = page.locator('.page > footer');
    await expect(header.locator('.topbar-profile-text strong')).toBeVisible();
    const chromeBounds = () => Promise.all([header.boundingBox(), footer.boundingBox()]);
    const initialBounds = await chromeBounds();
    const [headerBounds, footerBounds] = initialBounds;
    expect(headerBounds?.y).toBe(0);
    expect(footerBounds && footerBounds.y + footerBounds.height).toBe(720);
    const scrollTop = () => content.evaluate((element) => element.scrollTop);
    await content.evaluate((element) => {
      element.scrollTop = 0;
    });
    await content.focus();
    await page.keyboard.press('PageDown');
    await expect.poll(scrollTop).toBeGreaterThan(0);
    expect(await chromeBounds()).toEqual(initialBounds);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await footer.getByRole('link', { name: /Privacy Policy/i }).click();
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await expect.poll(scrollTop).toBe(0);
    expect(await chromeBounds()).toEqual(initialBounds);
    await content.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect.poll(scrollTop).toBeGreaterThan(0);
    expect(await chromeBounds()).toEqual(initialBounds);

    await footer.getByRole('link', { name: 'Manage Duolingo access' }).click();
    await expect(page.getByRole('heading', { name: 'Duolingo access' })).toBeVisible();
    await expect.poll(scrollTop).toBe(0);
    expect(await chromeBounds()).toEqual(initialBounds);

    await header.locator('.site-home-link').click();
    await expect(page.getByRole('heading', { name: 'Duolingo follows' })).toBeVisible();
    await expect.poll(scrollTop).toBe(0);
    expect(await chromeBounds()).toEqual(initialBounds);
    expect(
      (await connectorCommands(page)).filter((type) => type === 'GET_FOLLOWING_SUMMARY'),
    ).toHaveLength(1);
  });
}
