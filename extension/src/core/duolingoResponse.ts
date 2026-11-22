import { ConnectorError } from '@duofollow/extension/src/dto/ConnectorError';

import type { DuolingoRateLimit } from '@duofollow/extension/src/core/duolingoRateLimit';

export function createDuolingoResponse(rateLimit: DuolingoRateLimit) {
  const { rememberDuolingoRateLimit } = rateLimit;
  async function assertDuolingoResponse(response: Response, message: string): Promise<void> {
    if (response.ok) return;
    switch (response.status) {
      case 401:
        throw new ConnectorError('SIGNED_OUT', message);
      case 403:
        throw new ConnectorError('ACCESS_DENIED', message);
      case 429:
        await rememberDuolingoRateLimit(response);
        throw new ConnectorError('RATE_LIMITED', message);
      default:
        throw new Error(message);
    }
  }

  async function readDuolingoJson(
    response: Response,
    message: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof SyntaxError) throw new ConnectorError('INVALID_RESPONSE', message);
      throw error;
    }
  }
  return { assertDuolingoResponse, readDuolingoJson };
}
export type DuolingoResponse = ReturnType<typeof createDuolingoResponse>;
