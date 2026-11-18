import { ConnectorError } from '@duofollow/extension/src/dto/ConnectorError';
import {
  isConnectorFailure,
  isConnectorSuccess,
} from '@duofollow/extension/src/dto/ConnectorResult';
import { unfollowConfirmationMs } from '@duofollow/extension/src/dto/UnfollowConfirmation';
import { isFollowingComparison } from '@duofollow/src/api/extension/isFollowingComparison';

import type { ConnectorStatus } from '@duofollow/extension/src/dto/ConnectorSession';
import type {
  FollowingComparisonResult,
  UnfollowResult,
} from '@duofollow/extension/src/dto/DuolingoFollowingDto';
import type {
  UnfollowRequestResult,
  UnfollowStatusResult,
} from '@duofollow/extension/src/dto/UnfollowConfirmation';

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

  watchAccessChanges(
    onChange: (change: AccessChange) => void,
    onQuickUnfollowChange?: (enabled: boolean) => void,
  ): (() => void) | undefined {
    const runtime = globalThis.chrome?.runtime;
    if (!runtime?.connect || !this.extensionId) return;

    try {
      const port = runtime.connect(this.extensionId, { name: 'duofollow-access' });
      let connected = true;
      port.onMessage.addListener((message: unknown) => {
        if (!connected || !message || typeof message !== 'object') return;
        if ('access' in message && (message.access === 'granted' || message.access === 'revoked')) {
          onChange(message.access);
        }
        if ('quickUnfollow' in message && typeof message.quickUnfollow === 'boolean') {
          onQuickUnfollowChange?.(message.quickUnfollow);
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
    const result = await this.send<unknown>({ type: 'GET_FOLLOWING_SUMMARY', username }, 30_000);
    if (isConnectorFailure(result)) return result;
    if (
      !isConnectorSuccess(result) ||
      !('comparison' in result) ||
      !isFollowingComparison(result.comparison)
    ) {
      throw new ConnectorError(
        'INVALID_RESPONSE',
        'Outdated connector response. Reload the extension.',
      );
    }
    return { success: true, comparison: result.comparison };
  }

  async getQuickUnfollowPreference(): Promise<boolean> {
    const result = await this.send<unknown>({ type: 'GET_QUICK_UNFOLLOW' }, 1_500).catch(
      () => null,
    );
    return (
      isConnectorSuccess(result) &&
      'enabled' in result &&
      result.enabled === true &&
      'confirmation' in result &&
      result.confirmation === 'website'
    );
  }

  async unfollow(username: string, targetUserId: number, quick = false): Promise<UnfollowResult> {
    const request = await this.send<UnfollowRequestResult>(
      { type: quick ? 'REQUEST_QUICK_UNFOLLOW' : 'REQUEST_UNFOLLOW', username, targetUserId },
      28_000,
    );
    if (isConnectorFailure(request)) {
      if (request.error === 'Unsupported message') {
        throw new ConnectorError('CONNECTOR_OUTDATED', request.error);
      }
      return request;
    }
    if (!isConnectorSuccess(request) || typeof request.requestId !== 'string' || !request.requestId)
      throw new ConnectorError('INVALID_RESPONSE', 'Расширение вернуло неожиданный ответ.');

    if (quick) {
      // Recover through the same receipt if the worker loses the confirmation reply.
      const result = await this.send<UnfollowResult>(
        { type: 'CONFIRM_QUICK_UNFOLLOW', requestId: request.requestId },
        15_000,
      ).catch(() => undefined);
      if (isConnectorFailure(result)) return result;
      if (isConnectorSuccess(result) && result.targetUserId === targetUserId) return result;
    }

    const deadline = Date.now() + unfollowConfirmationMs + 55_000;
    let failedChecks = 0;
    while (Date.now() < deadline) {
      let result: UnfollowStatusResult | undefined;
      try {
        result = await this.send<UnfollowStatusResult>(
          { type: 'GET_UNFOLLOW_STATUS', requestId: request.requestId },
          Math.min(15_000, deadline - Date.now()),
        );
        failedChecks = 0;
      } catch {
        // Status can be queried again if the worker was interrupted.
        if (++failedChecks >= 3) break;
      }
      if (isConnectorFailure(result)) return result;
      if (
        isConnectorSuccess(result) &&
        !('pending' in result) &&
        result.targetUserId === targetUserId
      )
        return result;
      if (
        result !== undefined &&
        (!isConnectorSuccess(result) || !('pending' in result) || result.pending !== true)
      )
        break;
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
    }

    throw new ConnectorError('UNFOLLOW_UNCONFIRMED', 'Исход отписки неизвестен.');
  }

  private async send<Result>(
    message:
      | { type: 'GET_DUOLINGO_ACCESS' | 'OPEN_DUOLINGO_SETTINGS' | 'GET_QUICK_UNFOLLOW' }
      | { type: 'GET_FOLLOWING_SUMMARY'; username: string }
      | {
          type: 'REQUEST_UNFOLLOW' | 'REQUEST_QUICK_UNFOLLOW';
          username: string;
          targetUserId: number;
        }
      | { type: 'GET_UNFOLLOW_STATUS' | 'CONFIRM_QUICK_UNFOLLOW'; requestId: string },
    timeoutMs: number,
  ): Promise<Result> {
    const runtime = globalThis.chrome?.runtime;

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
            const code = error ? 'CONNECTOR_UNAVAILABLE' : 'INVALID_RESPONSE';
            reject(new ConnectorError(code, error?.message ?? 'Empty connector response'));
            return;
          }

          resolve(result);
        });
      });

      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new ConnectorError('TIMEOUT', 'Connector response timed out')),
          timeoutMs,
        );
      });

      return await Promise.race([response, deadline]);
    } finally {
      clearTimeout(timeout);
    }
  }
}
