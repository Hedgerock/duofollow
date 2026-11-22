import { unfollowConfirmationPage } from '@duofollow/extension/src/dto/UnfollowConfirmation';

import type {
  ExtensionPlatform,
  ExtensionSender,
  ExtensionStorage,
  ExtensionTab,
} from '@duofollow/extension/src/platform/ExtensionPlatform';

/** Chrome and Edge share one adapter; construction itself does not access browser APIs. */
export function createChromiumPlatform(api: () => typeof chrome = () => chrome): ExtensionPlatform {
  const storage = (area: 'local' | 'session'): ExtensionStorage => ({
    get: (key) => api().storage[area].get(key),
    set: (values) => api().storage[area].set(values),
    remove: (key) => api().storage[area].remove(key),
  });
  const sender = (value: chrome.runtime.MessageSender): ExtensionSender => ({
    id: value.id,
    url: value.url,
    frameId: value.frameId,
    documentId: value.documentId,
    tab: value.tab && { id: value.tab.id, index: value.tab.index, windowId: value.tab.windowId },
  });
  async function openSettings(source?: ExtensionTab): Promise<void> {
    if (source?.id === undefined) return api().runtime.openOptionsPage();
    const url = api().runtime.getURL('access.html');
    const { id, index, windowId } = source;
    const contexts = await api().runtime.getContexts?.({
      contextTypes: ['TAB'],
      frameIds: [0],
      windowIds: [windowId],
    });
    const settings = contexts?.find((context) => context.documentUrl?.split('#')[0] === url);
    if (settings) {
      const tab = await api().tabs.get(settings.tabId);
      const nextIndex = tab.index < index ? index : index + 1;
      if (tab.index !== nextIndex) await api().tabs.move(settings.tabId, { index: nextIndex });
      await api().tabs.update(settings.tabId, { active: true });
      return;
    }
    await api().tabs.create({ url, windowId, index: index + 1, openerTabId: id });
  }
  return {
    get id() {
      return api().runtime.id;
    },
    get sitePatterns() {
      return api().runtime.getManifest().externally_connectable?.matches ?? [];
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
          api().runtime.onMessage.addListener((message: unknown, source, reply) =>
            listener(message, sender(source), reply),
          ),
      },
      externalMessage: {
        addListener: (listener) =>
          api().runtime.onMessageExternal.addListener((message: unknown, source, reply) =>
            listener(message, sender(source), reply),
          ),
      },
      externalConnect: {
        addListener: (listener) =>
          api().runtime.onConnectExternal.addListener((port) =>
            listener({
              name: port.name,
              sender: port.sender && sender(port.sender),
              postMessage: (message) => port.postMessage(message),
              disconnect: () => port.disconnect(),
              onDisconnect: { addListener: (callback) => port.onDisconnect.addListener(callback) },
            }),
          ),
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
