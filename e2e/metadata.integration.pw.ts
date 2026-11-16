import { expect, test } from 'playwright/test';

test.use({ javaScriptEnabled: false });

test('publishes the title and share card in the static home page', async ({ page }) => {
  await page.goto('/duofollow/');
  const canonical = 'https://hedgerock.github.io/duofollow/';
  const title = 'DuoFollow — Find who doesn’t follow you back on Duolingo';
  await expect(page).toHaveTitle(title);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /Compare your Duolingo follows/,
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical);
  const image = page.locator('meta[property="og:image"]');
  await expect(image).toHaveAttribute('content', `${canonical}duofollow-preview.png`);
  const response = await page.goto('/duofollow/duofollow-preview.png');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-type']).toContain('image/png');
});
