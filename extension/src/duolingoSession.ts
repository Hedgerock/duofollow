import type { DuolingoSessionStatus } from './dto/ConnectorSession';
import { duolingoEndpoints } from './duolingoEndpoints.js';

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

export async function checkDuolingoSession(signal: AbortSignal): Promise<DuolingoSessionStatus> {
  try {
    const userId = await getDuolingoSessionUserId(signal);
    if (!userId) return 'signed-out';

    const endpoint = duolingoEndpoints.followers;
    const url = endpoint.url(userId);
    url.searchParams.set('viewerId', userId);
    url.searchParams.set('pageSize', '1');

    const response = await fetch(url, {
      method: endpoint.method,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
    });

    if (response.status === 401) return 'signed-out';
    if (!response.ok) return 'duolingo-unavailable';

    const data: { followers?: { users?: unknown } } | null = await response.json();
    return Array.isArray(data?.followers?.users) ? 'ready' : 'duolingo-unavailable';
  } catch {
    return 'duolingo-unavailable';
  }
}
