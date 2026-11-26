import {
  FIREFOX_CHANNEL,
  isBridgeId,
  isBridgeRecord,
  isSiteCommand,
} from '@duofollow/extension/src/bridge/protocol';

import type { BridgePort } from '@duofollow/extension/src/bridge/protocol';

/** Relays a bounded website protocol. Session cookies and the private document token never enter the page. */
export function startContentBridge(connect: () => BridgePort, target: Window = window) {
  if (target.top !== target) return () => {};
  const documentToken = crypto.randomUUID();
  const watchers = new Set<string>();
  const pending = new Map<string, { client: string; pageId: string }>();
  let port: BridgePort | undefined;
  let disposed = false;
  const emit = (client: string, value: Record<string, unknown>) =>
    target.postMessage(
      { channel: FIREFOX_CHANNEL, direction: 'to-page', client, ...value },
      target.location.origin,
    );
  function disconnected() {
    port = undefined;
    for (const { client, pageId } of pending.values())
      emit(client, { kind: 'reply', id: pageId, failed: true });
    pending.clear();
    watchers.forEach((client) => emit(client, { kind: 'disconnected' }));
  }
  function ensurePort(): BridgePort | undefined {
    if (port) return port;
    try {
      const current = connect();
      port = current;
      current.onDisconnect.addListener(() => {
        if (port === current) disconnected();
      });
      current.onMessage.addListener((value) => {
        if (port !== current || !isBridgeRecord(value)) return;
        if (value.kind === 'reply' && typeof value.id === 'string') {
          const request = pending.get(value.id);
          if (!request) return;
          pending.delete(value.id);
          emit(request.client, { kind: 'reply', id: request.pageId, response: value.response });
        } else if (value.kind === 'event') {
          watchers.forEach((client) => emit(client, { kind: 'event', message: value.message }));
        }
      });
      current.postMessage({ kind: 'hello', document: documentToken });
      if (watchers.size)
        current.postMessage({ kind: 'watch', enabled: true, url: target.location.href });
      return current;
    } catch {
      disconnected();
      return undefined;
    }
  }
  function onMessage(event: MessageEvent) {
    const value: unknown = event.data;
    if (
      disposed ||
      event.source !== target ||
      event.origin !== target.location.origin ||
      !isBridgeRecord(value) ||
      value.channel !== FIREFOX_CHANNEL ||
      value.direction !== 'to-extension' ||
      !isBridgeId(value.client)
    )
      return;
    const client = value.client;
    if (value.kind === 'watch' || value.kind === 'unwatch') {
      if (value.kind === 'watch' && watchers.size < 8) watchers.add(client);
      if (value.kind === 'unwatch') watchers.delete(client);
      try {
        (value.kind === 'watch' ? ensurePort() : port)?.postMessage({
          kind: 'watch',
          enabled: watchers.size > 0,
          url: target.location.href,
        });
      } catch {
        disconnected();
      }
      return;
    }
    if (!isBridgeId(value.id)) return;
    if (value.kind === 'cancel') {
      for (const [id, request] of pending)
        if (request.client === client && request.pageId === value.id) pending.delete(id);
      return;
    }
    if (value.kind !== 'request' || !isSiteCommand(value.message)) return;
    // Acknowledge the isolated script before waking the background page.
    emit(client, { kind: 'accepted', id: value.id });
    if (pending.size >= 64) {
      emit(client, { kind: 'reply', id: value.id, failed: true });
      return;
    }
    // Native request IDs are fresh even when the page reuses an ID.
    const id = crypto.randomUUID();
    const current = ensurePort();
    if (!current) {
      emit(client, { kind: 'reply', id: value.id, failed: true });
      return;
    }
    pending.set(id, { client, pageId: value.id });
    try {
      current.postMessage({
        kind: 'request',
        id,
        url: target.location.href,
        message: value.message,
      });
    } catch {
      disconnected();
    }
  }
  function onHide() {
    const current = port;
    disconnected();
    current?.disconnect();
  }
  function onShow() {
    if (watchers.size) ensurePort();
  }
  target.addEventListener('message', onMessage);
  target.addEventListener('pagehide', onHide);
  target.addEventListener('pageshow', onShow);
  return () => {
    disposed = true;
    onHide();
    watchers.clear();
    target.removeEventListener('message', onMessage);
    target.removeEventListener('pagehide', onHide);
    target.removeEventListener('pageshow', onShow);
  };
}
