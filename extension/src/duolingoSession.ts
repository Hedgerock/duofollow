import { isUserId } from '@duofollow/extension/src/dto/validation';
import { duolingoEndpoints } from '@duofollow/extension/src/duolingoEndpoints';
import { parseRelationshipPage } from '@duofollow/extension/src/duolingoPayload';
import {
  assertDuolingoRateLimit,
  checkDuolingoRateLimit,
} from '@duofollow/extension/src/duolingoRateLimit';
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
    if (!/^\d+$/.test(String(subject)) || !isUserId(userId)) return null;
    if (typeof claims?.exp === 'number' && claims.exp * 1000 <= Date.now()) return null;

    return String(userId);
  } catch {
    return null;
  }
}

async function readSessionCookie(signal: AbortSignal): Promise<string | undefined> {
  signal.throwIfAborted();
  const cookie = await chrome.cookies.get({
    url: duolingoEndpoints.accountLookup.url().origin,
    name: 'jwt_token',
  });
  signal.throwIfAborted();
  return cookie?.value;
}

export async function getDuolingoSessionUserId(signal: AbortSignal): Promise<string | null> {
  return readSessionUserId(await readSessionCookie(signal));
}

export async function identifyUnfollowSession(
  requestId: string,
  signal: AbortSignal,
): Promise<{ userId: string; fingerprint: string } | null> {
  const token = await readSessionCookie(signal);
  const userId = readSessionUserId(token);
  if (!userId) return null;

  // The request ID makes the digest specific to this attempted operation.
  const bytes = new TextEncoder().encode(`${requestId}:${token}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  signal.throwIfAborted();
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return { userId, fingerprint };
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

  const lastRetryAt = await checkDuolingoRateLimit(signal);
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
      if (status === 'ready') await checkDuolingoRateLimit(signal);
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

  assertDuolingoRateLimit();
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
  const data = await readDuolingoJson(
    response,
    'Duolingo session check returned invalid JSON',
    requestSignal,
  );
  parseRelationshipPage(data, 'followers');
  return 'ready';
}
