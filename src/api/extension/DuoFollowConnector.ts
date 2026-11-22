import { ConnectorError } from '@duofollow/extension/src/dto/ConnectorError';
import {
  isConnectorFailure,
  isConnectorSuccess,
} from '@duofollow/extension/src/dto/ConnectorResult';
import { unfollowConfirmationMs } from '@duofollow/extension/src/dto/UnfollowConfirmation';
import { isRecord, isUserId } from '@duofollow/extension/src/dto/validation';
import { parseDuolingoAvatarUrl } from '@duofollow/extension/src/duolingoAvatarUrl';
import { createChromiumTransport } from '@duofollow/src/api/extension/chromiumTransport';
import { isFollowingComparison } from '@duofollow/src/api/extension/isFollowingComparison';

import type {
  ConnectedDuolingoAccount,
  ConnectorStatus,
} from '@duofollow/extension/src/dto/ConnectorSession';
import type {
  FollowingComparisonResult,
  UnfollowResult,
} from '@duofollow/extension/src/dto/DuolingoFollowingDto';
import type {
  UnfollowRequestResult,
  UnfollowStatusResult,
} from '@duofollow/extension/src/dto/UnfollowConfirmation';
import type { ConnectorTransport } from '@duofollow/src/api/extension/ConnectorTransport';

interface ConnectorResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ConnectorConnection {
  status: ConnectorStatus | 'session-changed';
  sessionUserId?: number;
  account?: ConnectedDuolingoAccount | null;
}

function readConnectedAccount(
  value: unknown,
  sessionUserId: number,
): ConnectedDuolingoAccount | null {
  if (!isRecord(value) || value.userId !== sessionUserId || typeof value.username !== 'string') {
    return null;
  }
  const username = value.username.trim();
  if (!username || /[\s/@?#]/u.test(username)) return null;

  return {
    userId: sessionUserId,
    username,
    picture: parseDuolingoAvatarUrl(value.picture)?.href ?? null,
  };
}

export type AccessChange = 'granted' | 'revoked' | 'disconnected';

/**
 * Exchanges messages with the browser extension and listens for permission changes.
 * Maps transport failures and incompatible responses into errors or connection states.
 */
export class DuoFollowConnector {
  private readonly transport: ConnectorTransport;
  constructor(target: string | ConnectorTransport) {
    this.transport = typeof target === 'string' ? createChromiumTransport(target) : target;
  }

  async ping(): Promise<ConnectorResponse> {
    const response = await this.transport.request({ type: 'PING' });
    if (!response) throw new Error('Empty connector response');
    return response as ConnectorResponse;
  }

  async getConnectionStatus(): Promise<ConnectorConnection> {
    try {
      const response = await this.send<unknown>(
        { type: 'GET_DUOLINGO_ACCESS', includeAccount: true },
        12_000,
      );
      if (!isRecord(response)) return { status: 'connector-outdated' };

      const status = response.session;
      if (status === 'ready' && isUserId(response.sessionUserId)) {
        return {
          status,
          sessionUserId: response.sessionUserId,
          account: readConnectedAccount(response.account, response.sessionUserId),
        };
      }
      if (status === 'duolingo-unavailable') {
        if (response.errorCode === 'RATE_LIMITED') return { status: 'rate-limited' };
        if (response.errorCode === 'TIMEOUT') return { status: 'duolingo-timeout' };
        if (response.errorCode === 'INVALID_RESPONSE')
          return { status: 'duolingo-response-invalid' };
      }
      if (
        status === 'ready' ||
        status === 'signed-out' ||
        status === 'session-changed' ||
        status === 'duolingo-unavailable' ||
        status === 'consent-required'
      ) {
        return { status };
      }

      return { status: 'connector-outdated' };
    } catch {
      return { status: 'connector-unavailable' };
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
    let connected = true;
    try {
      const stop = this.transport.watch(
        (message) => {
          if (!connected || !message || typeof message !== 'object') return;
          if ('access' in message && (message.access === 'granted' || message.access === 'revoked'))
            onChange(message.access);
          if ('quickUnfollow' in message && typeof message.quickUnfollow === 'boolean')
            onQuickUnfollowChange?.(message.quickUnfollow);
        },
        () => {
          if (!connected) return;
          connected = false;
          onChange('disconnected');
        },
      );
      if (!stop) return;
      return () => {
        if (!connected) return;
        connected = false;
        stop();
      };
    } catch {
      // The regular status check also detects missing permissions.
    }
  }

  async getFollowingSummary(
    username: string,
    sessionUserId?: number,
  ): Promise<FollowingComparisonResult> {
    const message =
      sessionUserId === undefined
        ? { type: 'GET_FOLLOWING_SUMMARY' as const, username }
        : { type: 'GET_FOLLOWING_SUMMARY' as const, username, sessionUserId };
    const result = await this.send<unknown>(message, 30_000);
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
      | { type: 'GET_DUOLINGO_ACCESS'; includeAccount: true }
      | { type: 'OPEN_DUOLINGO_SETTINGS' | 'GET_QUICK_UNFOLLOW' }
      | { type: 'GET_FOLLOWING_SUMMARY'; username: string; sessionUserId?: number }
      | {
          type: 'REQUEST_UNFOLLOW' | 'REQUEST_QUICK_UNFOLLOW';
          username: string;
          targetUserId: number;
        }
      | { type: 'GET_UNFOLLOW_STATUS' | 'CONFIRM_QUICK_UNFOLLOW'; requestId: string },
    timeoutMs: number,
  ): Promise<Result> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    try {
      const response = this.transport.request(message, controller.signal).then((result) => {
        if (!result) throw new ConnectorError('INVALID_RESPONSE', 'Empty connector response');
        return result as Result;
      });

      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new ConnectorError('TIMEOUT', 'Connector response timed out');
          controller.abort(error);
          reject(error);
        }, timeoutMs);
      });

      return await Promise.race([response, deadline]);
    } finally {
      clearTimeout(timeout);
    }
  }
}
