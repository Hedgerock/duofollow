import { acceptFirefoxBridge } from '@duofollow/extension/src/bridge/backgroundBridge';
import { startContentBridge } from '@duofollow/extension/src/bridge/contentBridge';
import { FIREFOX_PORT } from '@duofollow/extension/src/bridge/protocol';
import { unfollowConfirmationPage } from '@duofollow/extension/src/dto/UnfollowConfirmation';

import type {
  ExtensionMessageListener,
  ExtensionPlatform,
  ExtensionPort,
  ExtensionStorage,
  ExtensionTab,
} from '@duofollow/extension/src/platform/ExtensionPlatform';

/** Firefox SDK access is confined to this adapter; core and page protocols remain browser-neutral. */
export function createFirefoxPlatform(
  api: () => typeof browser = () => browser,
): ExtensionPlatform {
  const messages: ExtensionMessageListener[] = [];
  const connections: ((port: ExtensionPort) => void)[] = [];
  let listening = false;
  const patterns = () =>
    api()
      .runtime.getManifest()
      .content_scripts?.flatMap((script) => script.matches ?? []) ?? [];
  function listen() {
    if (listening) return;
    listening = true;
    api().runtime.onConnect.addListener((port) =>
      acceptFirefoxBridge(port, api().runtime.id, patterns(), messages, connections),
    );
  }
  const storage = (area: 'local' | 'session'): ExtensionStorage => ({
    get: (key) => api().storage[area].get(key),
    set: (values) => api().storage[area].set(values),
    remove: (key) => api().storage[area].remove(key),
  });
  async function openSettings(source?: ExtensionTab): Promise<void> {
    if (source?.id === undefined) return api().runtime.openOptionsPage();
    // A long-lived content-script port may outlive a move to another browser window.
    source = await api().tabs.get(source.id);
    const url = api().runtime.getURL('access.html');
    // Only the extension's own page is queried; no general tabs permission is requested.
    const settings = (await api().tabs.query({ url, windowId: source.windowId }))[0];
    if (settings?.id !== undefined) {
      const index = settings.index < source.index ? source.index : source.index + 1;
      if (settings.index !== index) await api().tabs.move(settings.id, { index });
      await api().tabs.update(settings.id, { active: true });
      return;
    }
    await api().tabs.create({
      url,
      windowId: source.windowId,
      index: source.index + 1,
      openerTabId: source.id,
    });
  }
  return {
    get id() {
      return api().runtime.id;
    },
    get sitePatterns() {
      return patterns();
    },
    extensionUrl: (path) => api().runtime.getURL(path),
    readCookie: async (url, name) => (await api().cookies.get({ url, name }))?.value,
    storage: { local: storage('local'), session: storage('session') },
    permissions: {
      contains: (value) => api().permissions.contains(value),
      request: (value) => api().permissions.request(value),
      remove: (value) => api().permissions.remove(value),
    },
    openSettings,
    openConfirmation: async (requestId) =>
      (
        await api().windows.create({
          url: api().runtime.getURL(unfollowConfirmationPage) + '#' + requestId,
          type: 'popup',
          focused: true,
          width: 440,
          height: 480,
        })
      )?.id,
    sendInternal: (message) => api().runtime.sendMessage(message),
    uiLanguage: () => api().i18n.getUILanguage(),
    events: {
      message: {
        addListener: (listener) =>
          api().runtime.onMessage.addListener((message: unknown, sender, reply) =>
            listener(message, sender, reply),
          ),
      },
      externalMessage: {
        addListener: (listener) => {
          messages.push(listener);
          listen();
        },
      },
      externalConnect: {
        addListener: (listener) => {
          connections.push(listener);
          listen();
        },
      },
      permissionsRemoved: {
        addListener: (listener) => api().permissions.onRemoved.addListener(listener),
      },
      storageChanged: { addListener: (listener) => api().storage.onChanged.addListener(listener) },
      windowRemoved: { addListener: (listener) => api().windows.onRemoved.addListener(listener) },
      action: { addListener: (listener) => api().action.onClicked.addListener(listener) },
    },
  };
}

export function startFirefoxContentScript(api: () => typeof browser = () => browser) {
  return startContentBridge(() => api().runtime.connect({ name: FIREFOX_PORT }));
}
