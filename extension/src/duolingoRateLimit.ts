import { ConnectorError } from '@duofollow/extension/src/dto/ConnectorError';

const RETRY_KEY = 'duolingoSessionRetryAt';
const DEFAULT_DELAY_MS = 60_000;
let retryAt = 0;

function retryDeadline(header: string | null, now: number): number {
  const value = header?.trim();
  if (!value) return now + DEFAULT_DELAY_MS;
  const deadline = /^\d+$/.test(value) ? now + Number(value) * 1_000 : Date.parse(value);
  return Number.isSafeInteger(deadline) && deadline >= now ? deadline : now + DEFAULT_DELAY_MS;
}

async function restoreRetryDeadline(): Promise<void> {
  try {
    const stored = (await chrome.storage.session.get(RETRY_KEY))[RETRY_KEY];
    if (typeof stored === 'number' && Number.isSafeInteger(stored)) {
      retryAt = Math.max(retryAt, stored);
    }
  } catch {
    // The active worker still enforces its in-memory deadline.
  }
}

export async function rememberDuolingoRateLimit(response: Response): Promise<void> {
  const deadline = retryDeadline(response.headers.get('Retry-After'), Date.now());
  if (deadline <= retryAt) return;
  retryAt = deadline;
  await restoreRetryDeadline();
  if (retryAt !== deadline) return;
  await chrome.storage.session.set({ [RETRY_KEY]: deadline }).catch(() => {});
}

export function assertDuolingoRateLimit(): number {
  if (retryAt > Date.now()) {
    throw new ConnectorError('RATE_LIMITED', 'Duolingo requests are paused after HTTP 429');
  }
  return retryAt;
}

export async function checkDuolingoRateLimit(signal: AbortSignal): Promise<number> {
  await restoreRetryDeadline();
  signal.throwIfAborted();
  return assertDuolingoRateLimit();
}
