import { FIREFOX_CHANNEL, isBridgeRecord } from '@duofollow/extension/src/bridge/protocol';
import { ConnectorError } from '@duofollow/extension/src/dto/ConnectorError';

import type { ConnectorTransport } from '@duofollow/src/api/extension/ConnectorTransport';

/** Website side of the Firefox content-script bridge. Abort cancels waiting, never replays a command. */
export function createFirefoxTransport(target: Window = window): ConnectorTransport {
  const client = crypto.randomUUID();
  let subscribers = 0;
  const send = (value: Record<string, unknown>) =>
    target.postMessage(
      {
        channel: FIREFOX_CHANNEL,
        direction: 'to-extension',
        client,
        ...value,
      },
      target.location.origin,
    );
  const incoming = (event: MessageEvent) =>
    event.source === target &&
    event.origin === target.location.origin &&
    isBridgeRecord(event.data) &&
    event.data.channel === FIREFOX_CHANNEL &&
    event.data.direction === 'to-page' &&
    event.data.client === client;
  const unavailable = () =>
    new ConnectorError('CONNECTOR_UNAVAILABLE', 'Firefox extension channel is unavailable');
  return {
    request(message, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }
        const id = crypto.randomUUID();
        const finish = (error?: unknown, response?: unknown) => {
          clearTimeout(timeout);
          target.removeEventListener('message', onMessage);
          signal?.removeEventListener('abort', onAbort);
          if (error !== undefined) reject(error);
          else resolve(response);
        };
        const onAbort = () => {
          send({ kind: 'cancel', id });
          finish(signal?.reason);
        };
        const onMessage = (event: MessageEvent) => {
          if (!incoming(event) || event.data.id !== id) return;
          if (event.data.kind === 'accepted') {
            clearTimeout(timeout);
            timeout = setTimeout(onTimeout, signal ? 180_000 : 5_000);
            return;
          }
          if (event.data.kind !== 'reply') return;
          finish(event.data.failed ? unavailable() : undefined, event.data.response);
        };
        const onTimeout = () => {
          send({ kind: 'cancel', id });
          finish(unavailable());
        };
        let timeout = setTimeout(onTimeout, 2_000);
        target.addEventListener('message', onMessage);
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
          send({ kind: 'request', id, message });
        } catch (error) {
          finish(error);
        }
      });
    },
    watch(onMessage, onDisconnect) {
      let active = true;
      subscribers++;
      const listener = (event: MessageEvent) => {
        if (!active || !incoming(event)) return;
        if (event.data.kind === 'event') onMessage(event.data.message);
        if (event.data.kind === 'disconnected') {
          stop();
          onDisconnect();
        }
      };
      const stop = () => {
        if (!active) return;
        active = false;
        target.removeEventListener('message', listener);
        if (--subscribers === 0) send({ kind: 'unwatch' });
      };
      target.addEventListener('message', listener);
      if (subscribers === 1) send({ kind: 'watch' });
      return stop;
    },
  };
}
