import { ConnectorError } from '@duofollow/extension/src/dto/ConnectorError';

import type { ConnectorTransport } from '@duofollow/src/api/extension/ConnectorTransport';

/** The website's Chrome/Edge transport. Runtime APIs are looked up at the time of each call. */
export function createChromiumTransport(extensionId: string): ConnectorTransport {
  return {
    request(message, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }
        const runtime = globalThis.chrome?.runtime;
        if (!runtime?.sendMessage) {
          reject(
            new ConnectorError(
              'CONNECTOR_UNAVAILABLE',
              'Chrome extension messaging is unavailable',
            ),
          );
          return;
        }
        if (!extensionId) {
          reject(
            new ConnectorError('CONNECTOR_UNAVAILABLE', 'VITE_DUOFOLLOW_EXTENSION_ID is missing'),
          );
          return;
        }
        let settled = false;
        const finish = (error?: unknown, result?: unknown) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener('abort', onAbort);
          if (error !== undefined) reject(error);
          else resolve(result);
        };
        const onAbort = () => finish(signal?.reason);
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
          runtime.sendMessage(extensionId, message, (result: unknown) => {
            // Chrome requires lastError to be read even for a late, cancelled reply.
            const error = runtime.lastError;
            finish(
              error
                ? new ConnectorError(
                    'CONNECTOR_UNAVAILABLE',
                    error.message ?? 'Connector channel closed',
                  )
                : undefined,
              result,
            );
          });
        } catch (error) {
          finish(error);
        }
      });
    },
    watch(onMessage, onDisconnect) {
      const runtime = globalThis.chrome?.runtime;
      if (!runtime?.connect || !extensionId) return;
      try {
        const port = runtime.connect(extensionId, { name: 'duofollow-access' });
        let connected = true;
        port.onMessage.addListener((message: unknown) => {
          if (connected) onMessage(message);
        });
        port.onDisconnect.addListener(() => {
          void runtime.lastError;
          if (!connected) return;
          connected = false;
          onDisconnect();
        });
        return () => {
          if (!connected) return;
          connected = false;
          port.disconnect();
        };
      } catch {
        // The regular status check also detects missing permissions.
      }
    },
  };
}
