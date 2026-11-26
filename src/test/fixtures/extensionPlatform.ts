import { vi } from 'vitest';

import { FIREFOX_PORT } from '@duofollow/extension/src/bridge/protocol';
import { createChromiumPlatform } from '@duofollow/extension/src/platform/chromium';
import { createFirefoxPlatform } from '@duofollow/extension/src/platform/firefox';

import type {
  ExtensionMessageListener,
  ExtensionPermissions,
  ExtensionPlatform,
  ExtensionPort,
  ExtensionSender,
} from '@duofollow/extension/src/platform/ExtensionPlatform';

class Event<Listener extends (...args: never[]) => unknown> {
  listeners: Listener[] = [];
  addListener(listener: Listener) {
    this.listeners.push(listener);
  }
  emit(...args: Parameters<Listener>) {
    return this.listeners.map((listener) => listener(...args));
  }
}

/** One conformance fixture: direct capabilities and the real Chromium adapter over a fake SDK. */
export function extensionPlatformHarness(adapter: 'memory' | 'chromium' | 'firefox') {
  const events = {
    message: new Event<ExtensionMessageListener>(),
    externalMessage: new Event<ExtensionMessageListener>(),
    externalConnect: new Event<(port: ExtensionPort) => void>(),
    permissionsRemoved: new Event<(value: ExtensionPermissions) => void>(),
    storageChanged: new Event<
      (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void
    >(),
    windowRemoved: new Event<(id: number) => void>(),
    action: new Event<() => void>(),
  };
  const local: Record<string, unknown> = { duolingoAccessConsent: 1, quickUnfollowConsent: 2 };
  const session: Record<string, unknown> = {};
  function storage(values: Record<string, unknown>, area: string) {
    return {
      async get(key: string) {
        return structuredClone({ [key]: values[key] });
      },
      async set(next: Record<string, unknown>) {
        const changes = Object.fromEntries(
          Object.entries(next).map(([key, value]) => [
            key,
            { oldValue: values[key], newValue: value },
          ]),
        );
        Object.assign(values, structuredClone(next));
        events.storageChanged.emit(changes, area);
      },
      async remove(key: string) {
        const oldValue = values[key];
        delete values[key];
        events.storageChanged.emit({ [key]: { oldValue } }, area);
      },
    };
  }
  let granted = true;
  let userId = 101;
  const token = () =>
    `fixture.${btoa(JSON.stringify({ sub: userId, exp: 4_000_000_000 }))}.signature`;
  const extensionUrl = (file: string) =>
    adapter === 'firefox'
      ? 'moz-extension://fixture/' + file
      : `chrome-extension://fixture/${file}`;
  const localStore = storage(local, 'local'),
    sessionStore = storage(session, 'session');
  const openSettings = vi.fn(async () => {});
  const createWindow = vi.fn(async (_options: unknown) => ({ id: 42 }));
  const permissionApi = {
    contains: vi.fn(async () => granted),
    request: vi.fn(async () => granted),
    remove: vi.fn(async () => true),
  };
  const platform: ExtensionPlatform = {
    id: 'fixture',
    sitePatterns: ['https://hedgerock.github.io/*', 'http://localhost/*'],
    extensionUrl,
    readCookie: async () => token(),
    storage: { local: localStore, session: sessionStore },
    permissions: permissionApi,
    openSettings,
    openConfirmation: async (requestId) =>
      (await createWindow({ url: extensionUrl('unfollow-confirmation.html') + '#' + requestId }))
        .id,
    sendInternal: async () => undefined,
    uiLanguage: () => 'en',
    events,
  };
  const sdk = {
    action: { onClicked: events.action },
    cookies: { get: async () => ({ value: token() }) },
    permissions: { ...permissionApi, onRemoved: events.permissionsRemoved },
    storage: { local: localStore, session: sessionStore, onChanged: events.storageChanged },
    windows: { create: createWindow, onRemoved: events.windowRemoved },
    tabs: {
      create: vi.fn(async () => ({})),
      query: vi.fn(async () => []),
      get: async (id: number) => ({ id, index: 0, windowId: 1 }),
    },
    i18n: { getUILanguage: () => 'en' },
    runtime: {
      id: 'fixture',
      getManifest: () => ({
        externally_connectable: { matches: platform.sitePatterns },
        content_scripts: [{ matches: platform.sitePatterns }],
      }),
      onConnect: new Event<(port: unknown) => void>(),
      getURL: extensionUrl,
      getContexts: async () => [],
      openOptionsPage: openSettings,
      onMessage: events.message,
      onMessageExternal: events.externalMessage,
      onConnectExternal: events.externalConnect,
      sendMessage: async () => undefined,
    },
  };
  async function deliver(event: typeof events.message, message: unknown, sender: ExtensionSender) {
    const listener = event.listeners[0];
    if (!listener) throw new Error('Core has not registered its listener');
    let immediate: unknown;
    let resolve!: (value: unknown) => void;
    const pending = new Promise<unknown>((done) => {
      resolve = done;
    });
    const keepOpen = listener(message, sender, (value) => {
      immediate = value;
      resolve(value);
    });
    return keepOpen === true ? pending : immediate;
  }
  let currentPlatform =
    adapter === 'memory'
      ? platform
      : adapter === 'chromium'
        ? createChromiumPlatform(() => sdk as unknown as typeof chrome)
        : createFirefoxPlatform(() => sdk as unknown as typeof browser);
  const documents = new Map<string, string>();
  function firefoxExternal(message: unknown, source: ExtensionSender): Promise<unknown> {
    return new Promise((resolve) => {
      const messages = new Event<(message: unknown) => void>();
      const disconnected = new Event<() => void>();
      const port = {
        name: FIREFOX_PORT,
        sender: { ...source, id: 'fixture', tab: { id: 8, index: 0, windowId: 1 } },
        onMessage: messages,
        onDisconnect: disconnected,
        disconnect() {
          disconnected.emit();
          resolve(undefined);
        },
        postMessage(response: unknown) {
          if (
            typeof response === 'object' &&
            response !== null &&
            'kind' in response &&
            response.kind === 'reply'
          ) {
            resolve('response' in response ? (response.response ?? undefined) : undefined);
            disconnected.emit();
          }
        },
      };
      sdk.runtime.onConnect.emit(port);
      if (!messages.listeners.length) return;
      const key = source.documentId ?? 'missing';
      if (!documents.has(key)) documents.set(key, crypto.randomUUID());
      messages.emit({ kind: 'hello', document: documents.get(key) });
      messages.emit({ kind: 'request', id: crypto.randomUUID(), url: source.url, message });
    });
  }
  return {
    get platform() {
      return currentPlatform;
    },
    events,
    local,
    session,
    createWindow,
    openSettings,
    revoke() {
      granted = false;
      events.permissionsRemoved.emit({ permissions: ['cookies'] });
    },
    changeUser(id: number) {
      userId = id;
    },
    restartEvents() {
      for (const event of Object.values(events)) event.listeners.length = 0;
      if (adapter === 'firefox') {
        sdk.runtime.onConnect.listeners.length = 0;
        currentPlatform = createFirefoxPlatform(() => sdk as unknown as typeof browser);
      }
    },
    external: (message: unknown, sender: ExtensionSender) =>
      adapter === 'firefox'
        ? firefoxExternal(message, sender)
        : deliver(events.externalMessage, message, sender),
    internal: (message: unknown, sender: ExtensionSender) =>
      deliver(events.message, message, sender),
  };
}
