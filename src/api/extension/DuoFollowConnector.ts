import type {
  FollowingComparisonResult,
  UnfollowResult,
} from '../../../extension/src/dto/DuolingoFollowingDto';

interface ConnectorResponse {
  success: boolean;
  message?: string;
  error?: string;
}

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

  async getFollowingSummary(username: string): Promise<FollowingComparisonResult> {
    const result = await this.send<FollowingComparisonResult>(
      { type: 'GET_FOLLOWING_SUMMARY', username },
      30_000,
    );
    if (
      result.success &&
      (!result.comparison?.accountUsername || result.comparison.nonMutualFollowing === undefined)
    ) {
      throw new Error('Outdated connector response. Reload the extension.');
    }
    return result;
  }

  async unfollow(username: string, targetUserId: number): Promise<UnfollowResult> {
    const result = await this.send<UnfollowResult>(
      { type: 'UNFOLLOW', username, targetUserId },
      45_000,
    );
    if (result.success === false && typeof result.error === 'string') return result;

    if (result.success !== true || result.targetUserId !== targetUserId) {
      throw new Error('Расширение вернуло неожиданный ответ.');
    }

    return result;
  }

  private async send<Result>(
    message:
      | { type: 'GET_FOLLOWING_SUMMARY'; username: string }
      | { type: 'UNFOLLOW'; username: string; targetUserId: number },
    timeoutMs: number,
  ): Promise<Result> {
    const runtime = globalThis.chrome?.runtime;

    if (!runtime?.sendMessage) {
      throw new Error('Chrome extension messaging is unavailable');
    }

    if (!this.extensionId) {
      throw new Error('VITE_DUOFOLLOW_EXTENSION_ID is missing');
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const response = new Promise<Result>((resolve, reject) => {
        runtime.sendMessage(this.extensionId, message, (result: Result | undefined) => {
          const error = runtime.lastError;

          if (error || !result) {
            reject(new Error(error?.message ?? 'Empty connector response'));
            return;
          }

          resolve(result);
        });
      });

      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Connector response timed out')), timeoutMs);
      });

      return await Promise.race([response, deadline]);
    } finally {
      clearTimeout(timeout);
    }
  }
}
