import { test as base } from 'playwright/test';
export { expect } from 'playwright/test';
export type { Locator } from 'playwright/test';

/** UI tests model the Firefox page bridge. Installed-extension tests use separate native SDK fixtures. */
export const test = base.extend({
  page: async ({ page, browserName }, use) => {
    if (browserName === 'firefox')
      await page.addInitScript(() => {
        let stop: (() => void) | undefined;
        const watchers = new Set<string>();
        const send = (client: string, value: Record<string, unknown>) =>
          window.postMessage(
            {
              channel: 'duofollow.firefox.v1',
              direction: 'to-page',
              client,
              ...value,
            },
            location.origin,
          );
        window.addEventListener('message', (event) => {
          const value = event.data;
          if (
            event.source !== window ||
            event.origin !== location.origin ||
            value?.channel !== 'duofollow.firefox.v1' ||
            value.direction !== 'to-extension'
          )
            return;
          const runtime = Reflect.get(window, 'chrome')?.runtime;
          if (!runtime) return;
          if (value.kind === 'request') {
            send(value.client, { kind: 'accepted', id: value.id });
            runtime.sendMessage('firefox-content-bridge', value.message, (response: unknown) =>
              send(value.client, { kind: 'reply', id: value.id, response }),
            );
          }
          if (value.kind === 'unwatch') {
            watchers.delete(value.client);
            if (!watchers.size) {
              stop?.();
              stop = undefined;
            }
          }
          if (value.kind === 'watch') {
            watchers.add(value.client);
            if (!stop && runtime.connect) {
              const port = runtime.connect('firefox-content-bridge');
              port.onMessage.addListener((message: unknown) =>
                watchers.forEach((client) => send(client, { kind: 'event', message })),
              );
              stop = () => port.disconnect();
            }
          }
        });
      });
    await use(page);
  },
});
