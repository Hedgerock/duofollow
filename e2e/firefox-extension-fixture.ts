import { startConnector } from '@duofollow/extension/src/core/createConnector';
import {
  createFirefoxPlatform,
  startFirefoxContentScript,
} from '@duofollow/extension/src/platform/firefox';

/** In-page SDK double used only by the bridge integration test; production code is bundled unchanged. */
export function startFirefoxFixture() {
  localStorage.setItem('duofollow.language', 'en');
  let deleted = false;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    const url = new URL(String(input), location.href);
    if (url.origin !== 'https://www.duolingo.com') return nativeFetch(input, options);
    if (options?.method === 'DELETE') {
      deleted = true;
      return Response.json({ successful: true });
    }
    if (url.pathname.endsWith('/users/101'))
      return Response.json({ id: 101, username: 'Learner', picture: null });
    if (url.pathname.endsWith('/users'))
      return Response.json({ users: [{ id: 101, username: 'Learner' }] });
    if (url.pathname.endsWith('/following'))
      return Response.json({
        following: {
          cursor: null,
          totalUsers: deleted ? 0 : 1,
          users: deleted ? [] : [{ userId: 202, username: 'Target' }],
        },
      });
    if (url.pathname.endsWith('/followers'))
      return Response.json({ followers: { cursor: null, totalUsers: 0, users: [] } });
    throw new Error('Unexpected fixture request');
  };
  const event = <T extends (...args: never[]) => unknown>() => {
    const listeners: T[] = [];
    return {
      addListener: (listener: T) => listeners.push(listener),
      emit: (...args: Parameters<T>) => listeners.forEach((listener) => listener(...args)),
    };
  };
  const changed =
    event<
      (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void
    >();
  const store = (area: string, values: Record<string, unknown>) => ({
    get: async (key: string) => ({ [key]: values[key] }),
    set: async (next: Record<string, unknown>) => {
      const changes = Object.fromEntries(
        Object.entries(next).map(([key, value]) => [
          key,
          { oldValue: values[key], newValue: value },
        ]),
      );
      Object.assign(values, next);
      changed.emit(changes, area);
    },
    remove: async (key: string) => {
      const oldValue = values[key];
      delete values[key];
      changed.emit({ [key]: { oldValue } }, area);
    },
  });
  const connected = event<(port: unknown) => void>();
  const sdk = {
    runtime: {
      id: 'fixture',
      getURL: (file: string) => 'moz-extension://fixture/' + file,
      getManifest: () => ({ content_scripts: [{ matches: ['http://127.0.0.1/*'] }] }),
      onMessage: event(),
      onConnect: connected,
      connect: ({ name }: { name: string }) => {
        const toCore = event<(value: unknown) => void>(),
          toContent = event<(value: unknown) => void>(),
          off = event<() => void>();
        let closed = false;
        const disconnect = () => {
          if (!closed) {
            closed = true;
            off.emit();
          }
        };
        connected.emit({
          name,
          sender: {
            id: 'fixture',
            url: location.href,
            frameId: 0,
            tab: { id: 1, index: 0, windowId: 1 },
          },
          onMessage: toCore,
          onDisconnect: off,
          disconnect,
          postMessage: (value: unknown) =>
            queueMicrotask(() => toContent.emit(structuredClone(value))),
        });
        return {
          onMessage: toContent,
          onDisconnect: off,
          disconnect,
          postMessage: (value: unknown) =>
            queueMicrotask(() => toCore.emit(structuredClone(value))),
        };
      },
    },
    cookies: {
      get: async () => ({
        value: 'fixture.' + btoa(JSON.stringify({ sub: 101, exp: 4000000000 })) + '.signature',
      }),
    },
    permissions: { contains: async () => true, onRemoved: event() },
    storage: {
      local: store('local', { duolingoAccessConsent: 1, quickUnfollowConsent: 2 }),
      session: store('session', {}),
      onChanged: changed,
    },
    windows: { onRemoved: event() },
    action: { onClicked: event() },
  };
  const api = () => sdk as unknown as typeof browser;
  startConnector(createFirefoxPlatform(api));
  startFirefoxContentScript(api);
}
startFirefoxFixture();
