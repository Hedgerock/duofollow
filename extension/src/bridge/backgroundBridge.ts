import {
  FIREFOX_PORT,
  isBridgeId,
  isBridgeRecord,
  isBridgeUrl,
  isSiteCommand,
} from '@duofollow/extension/src/bridge/protocol';

import type { BridgePort } from '@duofollow/extension/src/bridge/protocol';
import type {
  ExtensionMessageListener,
  ExtensionPort,
  ExtensionSender,
} from '@duofollow/extension/src/platform/ExtensionPlatform';

/** Authenticates the native port before mapping isolated content-script metadata to core events. */
export function acceptFirefoxBridge(
  port: BridgePort & { name: string; sender?: ExtensionSender },
  extensionId: string,
  patterns: readonly string[],
  messageListeners: readonly ExtensionMessageListener[],
  connectListeners: readonly ((port: ExtensionPort) => void)[],
) {
  const source = port.sender;
  if (
    port.name !== FIREFOX_PORT ||
    source?.id !== extensionId ||
    source.frameId !== 0 ||
    source.tab?.id === undefined ||
    !source.url ||
    !isBridgeUrl(source.url, patterns)
  ) {
    port.disconnect();
    return;
  }
  const trustedOrigin = new URL(source.url).origin;
  let documentId: string | undefined;
  let closed = false;
  let watch: ExtensionPort | undefined;
  let disconnectWatch: (() => void)[] = [];
  const pending = new Set<string>();
  function send(value: unknown) {
    if (!closed) port.postMessage(value);
  }
  function unwatch() {
    watch = undefined;
    const callbacks = disconnectWatch;
    disconnectWatch = [];
    callbacks.forEach((callback) => callback());
  }
  port.onDisconnect.addListener(() => {
    closed = true;
    pending.clear();
    unwatch();
  });
  port.onMessage.addListener((value) => {
    if (closed || !isBridgeRecord(value)) return;
    if (value.kind === 'hello') {
      if (documentId || !isBridgeId(value.document)) {
        port.disconnect();
        return;
      }
      // Token is created once in the isolated content-script world, never supplied by page code.
      documentId = 'firefox:' + source.tab!.id + ':' + value.document;
      send({ kind: 'ready' });
      return;
    }
    if (
      !documentId ||
      typeof value.url !== 'string' ||
      !isBridgeUrl(value.url, patterns) ||
      new URL(value.url).origin !== trustedOrigin
    ) {
      port.disconnect();
      return;
    }
    const sender: ExtensionSender = { ...source, url: value.url, documentId };
    if (value.kind === 'watch') {
      if (value.enabled !== true) {
        unwatch();
        return;
      }
      if (watch) return;
      watch = {
        name: 'duofollow-access',
        sender,
        postMessage: (message) => send({ kind: 'event', message }),
        disconnect: unwatch,
        onDisconnect: { addListener: (callback) => disconnectWatch.push(callback) },
      };
      connectListeners.forEach((listener) => listener(watch!));
      return;
    }
    if (
      value.kind !== 'request' ||
      !isBridgeId(value.id) ||
      !isSiteCommand(value.message) ||
      pending.has(value.id) ||
      pending.size >= 64
    )
      return;
    const id = value.id;
    pending.add(id);
    let replied = false;
    const reply = (response: unknown) => {
      if (replied) return;
      replied = true;
      pending.delete(id);
      send({ kind: 'reply', id, response: response ?? null });
    };
    try {
      const waiting = messageListeners.some(
        (listener) => listener(value.message, sender, reply) === true,
      );
      if (!waiting && !replied) reply(null);
    } catch {
      reply(null);
    }
  });
}
