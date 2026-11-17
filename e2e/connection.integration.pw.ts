import { expect, test } from 'playwright/test';

test.use({
  viewport: { width: 500, height: 640 },
  contextOptions: { reducedMotion: 'no-preference' },
});

for (const link of ['back to comparison', 'logo'] as const) {
  test(`connects after opening the privacy policy directly and returning via the ${link}`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const documentPath = location.pathname;
      const chrome = Reflect.get(window, 'chrome') ?? {};
      // Chromium can report the document's entry URL after same-document navigation.
      Object.defineProperty(chrome, 'runtime', {
        configurable: true,
        value: {
          sendMessage(_id: string, _message: unknown, reply: (status: unknown) => void) {
            queueMicrotask(() =>
              reply(documentPath === '/duofollow/' ? { session: 'ready' } : undefined),
            );
          },
        },
      });
      if (!Reflect.get(window, 'chrome')) Reflect.set(window, 'chrome', chrome);
    });

    await page.goto('/duofollow/privacy/ru/');
    const site = page.locator('.page');
    await expect(site.getByRole('heading', { name: 'Политика конфиденциальности' })).toBeVisible();
    const home =
      link === 'logo'
        ? site.locator('.site-home-link')
        : site.getByRole('link', { name: 'К сравнению' });
    await home.click();

    await expect(page).toHaveURL(/\/duofollow\/$/);
    await expect(page.locator('#duolingo-username')).toBeEnabled();
    await expect(page.locator('.connection-dialog')).toBeHidden();
  });
}

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

test('shows the rate limit while access is checked and unlocks after a successful retry', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('duofollow.language', 'en');
    const chrome = Reflect.get(window, 'chrome') ?? {};
    Object.defineProperty(chrome, 'runtime', {
      configurable: true,
      value: {
        sendMessage(_id: string, _message: unknown, reply: (status: unknown) => void) {
          queueMicrotask(() =>
            reply(
              Reflect.get(window, '__duofollowConnectionReady')
                ? { session: 'ready' }
                : { session: 'duolingo-unavailable', errorCode: 'RATE_LIMITED' },
            ),
          );
        },
      },
    });
    if (!Reflect.get(window, 'chrome')) Reflect.set(window, 'chrome', chrome);
  });
  await page.goto('/duofollow/');
  const dialog = page.getByRole('dialog', { name: 'Duolingo is limiting requests' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('inert', '');
  await page.evaluate(() => {
    Reflect.set(window, '__duofollowConnectionReady', true);
  });
  await dialog.getByRole('button', { name: 'Check again' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#duolingo-username')).toBeEnabled();
});
