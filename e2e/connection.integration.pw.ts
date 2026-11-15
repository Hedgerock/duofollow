import { expect, test } from 'playwright/test';

test.use({ viewport: { width: 500, height: 640 }, reducedMotion: 'no-preference' });

for (const method of ['Close', 'Escape'] as const) {
  test(`keeps the Connector warning in a column during exit via ${method}`, async ({ page }) => {
    await page.goto('/duofollow/');
    const dialog = page.locator('.connection-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toHaveText('DuoFollow Connector is unavailable');
    await dialog.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map(({ finished }) => finished));
      const observer = new MutationObserver(() => {
        if (element.hasAttribute('open')) return;
        const { display, flexDirection } = getComputedStyle(element);
        element.setAttribute('data-exit-layout', `${display} ${flexDirection}`);
        observer.disconnect();
      });
      observer.observe(element, { attributes: true, attributeFilter: ['open'] });
    });

    if (method === 'Close')
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    else await page.keyboard.press('Escape');

    await expect(dialog).toHaveAttribute('data-exit-layout', 'flex column');
    await expect(dialog).toBeHidden();
    await expect(page.locator('main')).toHaveAttribute('inert', '');
  });
}
