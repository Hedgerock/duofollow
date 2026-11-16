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

async function getRetryDeadline(): Promise<number> {
  try {
    const stored = (await chrome.storage.session.get(RETRY_KEY))[RETRY_KEY];
    if (typeof stored === 'number' && Number.isSafeInteger(stored)) {
      retryAt = Math.max(retryAt, stored);
    }
  } catch {
    // The active worker still enforces its in-memory deadline.
  }
  return retryAt;
}

export async function rememberDuolingoRateLimit(response: Response): Promise<void> {
  const deadline = retryDeadline(response.headers.get('Retry-After'), Date.now());
  await getRetryDeadline();
  if (deadline <= retryAt) return;
  retryAt = deadline;
  await chrome.storage.session.set({ [RETRY_KEY]: deadline }).catch(() => {});
}

export async function checkSessionRateLimit(): Promise<number> {
  const deadline = await getRetryDeadline();
  if (deadline > Date.now()) {
    throw new ConnectorError('RATE_LIMITED', 'Duolingo session check is waiting after HTTP 429');
  }
  return deadline;
}
