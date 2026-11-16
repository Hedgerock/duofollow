import { ConnectorError } from '@duofollow/extension/src/dto/ConnectorError';
import { duolingoEndpoints } from '@duofollow/extension/src/duolingoEndpoints';
import { checkSessionRateLimit } from '@duofollow/extension/src/duolingoRateLimit';
import {
  assertDuolingoResponse,
  readDuolingoJson,
} from '@duofollow/extension/src/duolingoResponse';

import type { DuolingoSessionStatus } from '@duofollow/extension/src/dto/ConnectorSession';

function readSessionUserId(token: string | undefined): string | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;

  try {
    const claims: { sub?: unknown; exp?: unknown } | null = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    );
    const subject = claims?.sub;
    if (typeof subject !== 'string' && typeof subject !== 'number') return null;

    const userId = Number(subject);
    if (!/^\d+$/.test(String(subject)) || !Number.isSafeInteger(userId) || userId <= 0) return null;
    if (typeof claims?.exp === 'number' && claims.exp * 1000 <= Date.now()) return null;

    return String(userId);
  } catch {
    return null;
  }
}

export async function getDuolingoSessionUserId(signal: AbortSignal): Promise<string | null> {
  signal.throwIfAborted();
  const cookie = await chrome.cookies.get({
    url: duolingoEndpoints.accountLookup.url().origin,
    name: 'jwt_token',
  });
  signal.throwIfAborted();
  return readSessionUserId(cookie?.value);
}

const READY_TTL_MS = 60_000;

interface SessionVerification {
  userId: string;
  signal: AbortSignal;
  readyAt?: number;
  pending?: Promise<DuolingoSessionStatus>;
}

let verification: SessionVerification | undefined;

/**
 * Checks the current Duolingo session after the worker has verified access.
 * Concurrent callers share the probe for the same account and grant. Successful results expire after 60 seconds.
 *
 * @param signal The current access grant’s signal. Revoking access cancels the probe and invalidates its result.
 */
export async function checkDuolingoSession(signal: AbortSignal): Promise<DuolingoSessionStatus> {
  const userId = await getDuolingoSessionUserId(signal);
  if (!userId) {
    if (verification?.signal === signal) verification = undefined;
    return 'signed-out';
  }

  const lastRetryAt = await checkSessionRateLimit();
  signal.throwIfAborted();
  if (verification?.userId !== userId || verification.signal !== signal) {
    verification = { userId, signal };
  }
  const active = verification;
  if (
    active.readyAt !== undefined &&
    active.readyAt >= lastRetryAt &&
    Date.now() - active.readyAt < READY_TTL_MS
  )
    return 'ready';
  active.pending ??= verifyDuolingoSession(userId, signal)
    .then(async (status) => {
      if (status === 'ready') await checkSessionRateLimit();
      if ((await getDuolingoSessionUserId(signal)) !== userId || verification !== active) {
        return 'signed-out';
      }
      if (status === 'ready') active.readyAt = Date.now();
      return status;
    })
    .finally(() => {
      active.pending = undefined;
    });
  return active.pending;
}

async function verifyDuolingoSession(
  userId: string,
  signal: AbortSignal,
): Promise<DuolingoSessionStatus> {
  const endpoint = duolingoEndpoints.followers;
  const url = endpoint.url(userId);
  url.searchParams.set('viewerId', userId);
  url.searchParams.set('pageSize', '1');

  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(5_000)]);
  const response = await fetch(url, {
    method: endpoint.method,
    credentials: 'include',
    cache: 'no-store',
    redirect: 'error',
    signal: requestSignal,
  });

  if (response.status === 401) return 'signed-out';
  await assertDuolingoResponse(response, `Duolingo session check returned HTTP ${response.status}`);
  const data = await readDuolingoJson<{ followers?: { users?: unknown } } | null>(
    response,
    'Duolingo session check returned invalid JSON',
    requestSignal,
  );
  if (!Array.isArray(data?.followers?.users)) {
    throw new ConnectorError('INVALID_RESPONSE', 'Duolingo session check returned an invalid page');
  }
  return 'ready';
}
