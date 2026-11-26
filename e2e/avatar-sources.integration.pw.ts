import { expect, test } from '@duofollow/e2e/test';

test('permits approved avatar origins and blocks other image requests', async ({ page }) => {
  const allowed = [
    'https://simg-ssl.duolingo.com/avatar/test/medium',
    'https://d3gq3s1iyyx31w.cloudfront.net/static/render/test/medium',
  ];
  const blocked = 'https://unrelated.example/avatar.svg';
  const fetched: string[] = [];
  await page.route(
    /https:\/\/(?:simg-ssl\.duolingo\.com|d3gq3s1iyyx31w\.cloudfront\.net|unrelated\.example)\//,
    async (route) => {
      fetched.push(route.request().url());
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
      });
    },
  );
  await page.goto('/duofollow/');
  const results = await page.evaluate(
    async (urls) => {
      return await Promise.all(
        urls.map(
          (url) =>
            new Promise((resolve) => {
              const image = document.createElement('img');
              image.onload = () => resolve(true);
              image.onerror = () => resolve(false);
              image.src = url;
              document.body.append(image);
            }),
        ),
      );
    },
    [...allowed, blocked],
  );
  expect(results).toEqual([true, true, false]);
  expect(fetched.sort()).toEqual([...allowed].sort());
});
