import { execFileSync } from 'node:child_process';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium, expect, test } from 'playwright/test';

const mockNetwork = `
  globalThis.unfollowWrites = 0;
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    if (url.origin !== 'https://www.duolingo.com') throw new Error('Unexpected API origin');
    const path = url.pathname;
    if (options.method === 'DELETE' && path.endsWith('/101/follow/303')) {
      globalThis.unfollowWrites++;
      return Response.json({ successful: true });
    }
    if (options.method === 'DELETE' && path.endsWith('/101/follow/202')) {
      globalThis.unfollowWrites++;
      throw new Error('Lost DELETE response after applying the change');
    }
    if (options.method === 'GET' && path === '/2023-05-23/users') {
      return Response.json({ users: [{ id: 101, username: 'Learner' }] });
    }
    if (options.method === 'GET' && path.endsWith('/101/following')) {
      const users = [{ userId: 202, username: 'Target' }, { userId: 303, username: 'QuickTarget' }]
        .slice(globalThis.unfollowWrites);
      return Response.json({ following: { cursor: null, totalUsers: users.length, users } });
    }
    throw new Error('Unexpected API request');
  };
`;

test.beforeAll(() => {
  execFileSync(process.execPath, [resolve('extension/scripts/build.mjs')], { stdio: 'inherit' });
});

test('uses a real Connector window to authorize an unfollow and verifies a lost response', async ({
  browserName,
}, info) => {
  test.skip(browserName !== 'chromium');
  const extension = info.outputPath('connector');
  await cp(resolve('extension/dist'), extension, { recursive: true });
  const manifestPath = resolve(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.background.service_worker = 'test-background.js';
  // The test supplies consent below. It owns the browser profile and API fixtures.
  manifest.permissions.push(...manifest.optional_permissions);
  manifest.host_permissions = manifest.optional_host_permissions;
  delete manifest.optional_permissions;
  delete manifest.optional_host_permissions;

  await Promise.all([
    writeFile(manifestPath, JSON.stringify(manifest)),
    writeFile(resolve(extension, 'mock-network.js'), mockNetwork),
    writeFile(
      resolve(extension, 'test-background.js'),
      "import './mock-network.js'; import './background.js';",
    ),
  ]);
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    locale: 'en-US',
  });

  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).hostname;
    await worker.evaluate(() => chrome.storage.local.set({ duolingoAccessConsent: 1 }));
    await context.addCookies([
      {
        name: 'jwt_token',
        value: `fixture.${Buffer.from(JSON.stringify({ sub: 101, exp: 4_000_000_000 })).toString('base64url')}.signature`,
        url: 'https://www.duolingo.com',
      },
    ]);
    await context.route('http://localhost:5173/duofollow/', (route) =>
      route.fulfill({
        body: '<!doctype html><title>DuoFollow test page</title>',
        contentType: 'text/html',
      }),
    );
    const page = await context.newPage();
    await page.goto('http://localhost:5173/duofollow/');
    const send = <T>(message: object) =>
      page.evaluate(({ id, payload }) => chrome.runtime.sendMessage(id, payload), {
        id: extensionId,
        payload: message,
      }) as Promise<T>;
    const writes = () => worker.evaluate(() => Reflect.get(globalThis, 'unfollowWrites'));

    async function requestConfirmation() {
      const [popup, receipt] = await Promise.all([
        context.waitForEvent('page'),
        send<{ success: boolean; requestId: string }>({
          type: 'REQUEST_UNFOLLOW',
          username: 'Learner',
          targetUserId: 202,
        }),
      ]);
      expect(receipt.success).toBe(true);
      await expect(popup).toHaveURL(
        `chrome-extension://${extensionId}/unfollow-confirmation.html#${receipt.requestId}`,
      );
      const labels = await popup.evaluate(() => ({
        title: chrome.i18n.getMessage('unfollowTitle'),
        cancel: chrome.i18n.getMessage('unfollowCancel'),
        confirm: chrome.i18n.getMessage('unfollowConfirm'),
      }));
      await expect(popup.getByRole('heading', { name: labels.title })).toBeVisible();
      await expect(popup.getByText('@Learner', { exact: true })).toBeVisible();
      await expect(popup.getByText('@Target · ID 202', { exact: true })).toBeVisible();
      return { popup, receipt, labels };
    }

    const preference = () => send({ type: 'GET_QUICK_UNFOLLOW' });
    await expect(preference()).resolves.toEqual({
      success: true,
      enabled: false,
      confirmation: 'website',
    });
    const canceled = await requestConfirmation();
    const hint = canceled.popup.locator('#quick-unfollow-hint');
    await expect(hint).toBeVisible();
    const settingsPage = context.waitForEvent('page');
    await hint.getByRole('link').click();
    const settings = await settingsPage;
    await expect(settings).toHaveURL(
      `chrome-extension://${extensionId}/access.html#quick-unfollow`,
    );
    const consent = settings.getByRole('checkbox');
    await expect(consent).toBeEnabled();
    await expect(consent).not.toBeChecked();
    await expect(settings.locator('#quick-unfollow-terms')).toBeVisible();
    await consent.check();
    await expect
      .poll(preference)
      .toEqual({ success: true, enabled: true, confirmation: 'website' });
    await settings.reload();
    await expect(consent).toBeChecked();
    await expect(hint).toBeHidden();
    expect(await writes()).toBe(0);

    await canceled.popup.getByRole('button', { name: canceled.labels.cancel, exact: true }).click();
    await expect
      .poll(() =>
        send({
          type: 'GET_UNFOLLOW_STATUS',
          requestId: canceled.receipt.requestId,
        }),
      )
      .toMatchObject({ success: false, errorCode: 'UNFOLLOW_CANCELLED' });
    expect(await writes()).toBe(0);

    const approved = await requestConfirmation();
    await expect(approved.popup.locator('#quick-unfollow-hint')).toBeHidden();
    expect(await writes()).toBe(0);
    await approved.popup
      .getByRole('button', { name: approved.labels.confirm, exact: true })
      .click();
    await expect
      .poll(() =>
        send({
          type: 'GET_UNFOLLOW_STATUS',
          requestId: approved.receipt.requestId,
        }),
      )
      .toEqual({ success: true, targetUserId: 202 });
    expect(await writes()).toBe(1);

    const pagesBeforeQuick = context.pages().length;
    const quick = await send<{ success: boolean; requestId: string }>({
      type: 'REQUEST_QUICK_UNFOLLOW',
      username: 'Learner',
      targetUserId: 303,
    });
    expect(quick.success).toBe(true);
    expect(await writes()).toBe(1);
    await expect(
      send({
        type: 'CONFIRM_QUICK_UNFOLLOW',
        requestId: quick.requestId,
      }),
    ).resolves.toEqual({ success: true, targetUserId: 303 });
    expect(await writes()).toBe(2);
    expect(context.pages()).toHaveLength(pagesBeforeQuick);

    await consent.uncheck();
    await expect
      .poll(preference)
      .toEqual({ success: true, enabled: false, confirmation: 'website' });
    await settings.reload();
    await expect(consent).toBeEnabled();
    await expect(consent).not.toBeChecked();
  } finally {
    await context.close();
  }
});
