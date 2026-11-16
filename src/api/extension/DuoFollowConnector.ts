import { ConnectorError } from '@duofollow/extension/src/dto/ConnectorError';
import {
  isConnectorFailure,
  isConnectorSuccess,
} from '@duofollow/extension/src/dto/ConnectorResult';
import { isFollowingComparison } from '@duofollow/src/api/extension/isFollowingComparison';

import type { ConnectorStatus } from '@duofollow/extension/src/dto/ConnectorSession';
import type {
  FollowingComparisonResult,
  UnfollowResult,
} from '@duofollow/extension/src/dto/DuolingoFollowingDto';

interface ConnectorResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export type AccessChange = 'granted' | 'revoked' | 'disconnected';

/**
 * Exchanges messages with the browser extension and listens for permission changes.
 * Maps transport failures and incompatible responses into errors or connection states.
 */
export class DuoFollowConnector {
  constructor(private readonly extensionId: string) {}

  ping(): Promise<ConnectorResponse> {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        reject(new Error('Chrome extension messaging is unavailable'));
        return;
      }

      chrome.runtime.sendMessage(
        this.extensionId,
        { type: 'PING' },
        (response: ConnectorResponse | undefined) => {
          const error = chrome.runtime.lastError;

          if (error) {
            reject(new Error(error.message));
            return;
          }

          if (!response) {
            reject(new Error('Empty connector response'));
            return;
          }

          resolve(response);
        },
      );
    });
  }

  async getConnectionStatus(): Promise<ConnectorStatus> {
    try {
      const response = await this.send<{ session?: unknown; errorCode?: unknown }>(
        { type: 'GET_DUOLINGO_ACCESS' },
        7_000,
      );
      const status = response.session;
      if (status === 'duolingo-unavailable') {
        if (response.errorCode === 'RATE_LIMITED') return 'rate-limited';
        if (response.errorCode === 'TIMEOUT') return 'duolingo-timeout';
        if (response.errorCode === 'INVALID_RESPONSE') return 'duolingo-response-invalid';
      }
      if (
        status === 'ready' ||
        status === 'signed-out' ||
        status === 'duolingo-unavailable' ||
        status === 'consent-required'
      ) {
        return status;
      }

      return 'connector-outdated';
    } catch {
      return 'connector-unavailable';
    }
  }

  async openDuolingoSettings(): Promise<void> {
    const result = await this.send<unknown>({ type: 'OPEN_DUOLINGO_SETTINGS' }, 7_000);
    if (!isConnectorSuccess(result)) throw new Error('Настройки Connector недоступны.');
  }

  watchAccessChanges(onChange: (change: AccessChange) => void): (() => void) | undefined {
    const runtime = globalThis.chrome?.runtime;
    if (!runtime?.connect || !this.extensionId) return;

    try {
      const port = runtime.connect(this.extensionId, { name: 'duofollow-access' });
      let connected = true;
      port.onMessage.addListener((message: unknown) => {
        if (
          message &&
          typeof message === 'object' &&
          'access' in message &&
          (message.access === 'granted' || message.access === 'revoked')
        ) {
          onChange(message.access);
        }
      });
      port.onDisconnect.addListener(() => {
        void runtime.lastError;
        if (!connected) return;
        connected = false;
        onChange('disconnected');
      });
      return () => {
        if (!connected) return;
        connected = false;
        port.disconnect();
      };
    } catch {
      // The regular status check also detects missing permissions.
    }
  }

  async getFollowingSummary(username: string): Promise<FollowingComparisonResult> {
    const result = await this.send<FollowingComparisonResult>(
      { type: 'GET_FOLLOWING_SUMMARY', username },
      30_000,
    );
    if (isConnectorFailure(result)) return result;
    if (!isConnectorSuccess(result) || !isFollowingComparison(result.comparison)) {
      throw new ConnectorError(
        'INVALID_RESPONSE',
        'Outdated connector response. Reload the extension.',
      );
    }
    return result;
  }

  async unfollow(username: string, targetUserId: number): Promise<UnfollowResult> {
    const result = await this.send<UnfollowResult>(
      { type: 'UNFOLLOW', username, targetUserId },
      45_000,
    );
    if (isConnectorFailure(result)) return result;

    if (!isConnectorSuccess(result) || result.targetUserId !== targetUserId) {
      throw new ConnectorError('UNFOLLOW_UNCONFIRMED', 'Расширение вернуло неожиданный ответ.');
    }

    return result;
  }

  private async send<Result>(
    message:
      | { type: 'GET_DUOLINGO_ACCESS' | 'OPEN_DUOLINGO_SETTINGS' }
      | { type: 'GET_FOLLOWING_SUMMARY'; username: string }
      | { type: 'UNFOLLOW'; username: string; targetUserId: number },
    timeoutMs: number,
  ): Promise<Result> {
    const runtime = globalThis.chrome?.runtime;
    const unfollow = message.type === 'UNFOLLOW';

    if (!runtime?.sendMessage) {
      throw new ConnectorError(
        'CONNECTOR_UNAVAILABLE',
        'Chrome extension messaging is unavailable',
      );
    }

    if (!this.extensionId) {
      throw new ConnectorError('CONNECTOR_UNAVAILABLE', 'VITE_DUOFOLLOW_EXTENSION_ID is missing');
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const response = new Promise<Result>((resolve, reject) => {
        runtime.sendMessage(this.extensionId, message, (result: Result | undefined) => {
          const error = runtime.lastError;

          if (error || !result) {
            const code = unfollow
              ? 'UNFOLLOW_UNCONFIRMED'
              : error
                ? 'CONNECTOR_UNAVAILABLE'
                : 'INVALID_RESPONSE';
            reject(new ConnectorError(code, error?.message ?? 'Empty connector response'));
            return;
          }

          resolve(result);
        });
      });

      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new ConnectorError(
                unfollow ? 'UNFOLLOW_UNCONFIRMED' : 'TIMEOUT',
                'Connector response timed out',
              ),
            ),
          timeoutMs,
        );
      });

      return await Promise.race([response, deadline]);
    } finally {
      clearTimeout(timeout);
    }
  }
}
