import { ConnectorError } from '@duofollow/extension/src/dto/ConnectorError';

export function assertDuolingoResponse(response: Response, message: string): void {
  if (response.ok) return;
  switch (response.status) {
    case 401:
      throw new ConnectorError('SIGNED_OUT', message);
    case 403:
      throw new ConnectorError('ACCESS_DENIED', message);
    case 429:
      throw new ConnectorError('RATE_LIMITED', message);
    default:
      throw new Error(message);
  }
}

export async function readDuolingoJson<T>(
  response: Response,
  message: string,
  signal: AbortSignal,
): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof SyntaxError) throw new ConnectorError('INVALID_RESPONSE', message);
    throw error;
  }
}
