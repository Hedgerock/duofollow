import type { FollowingComparisonResult } from '../../../extension/src/dto/DuolingoFollowingDto';

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
    const runtime = globalThis.chrome?.runtime;

    if (!runtime?.sendMessage) {
      throw new Error('Chrome extension messaging is unavailable');
    }

    if (!this.extensionId) {
      throw new Error('VITE_DUOFOLLOW_EXTENSION_ID is missing');
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const response = new Promise<FollowingComparisonResult>((resolve, reject) => {
        runtime.sendMessage(
          this.extensionId,
          { type: 'GET_FOLLOWING_SUMMARY', username },
          (result: FollowingComparisonResult | undefined) => {
            const error = runtime.lastError;

            if (error || !result) {
              reject(new Error(error?.message ?? 'Empty connector response'));
              return;
            }

            if (
              result.success &&
              (!result.comparison?.accountUsername ||
                result.comparison.nonMutualFollowing === undefined)
            ) {
              reject(new Error('Outdated connector response. Reload the extension.'));
              return;
            }

            resolve(result);
          },
        );
      });

      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Connector response timed out')), 30_000);
      });

      return await Promise.race([response, deadline]);
    } finally {
      clearTimeout(timeout);
    }
  }
}
