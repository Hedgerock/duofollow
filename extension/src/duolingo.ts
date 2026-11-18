import { ConnectorError } from '@duofollow/extension/src/dto/ConnectorError';
import { isRecord, isUserId } from '@duofollow/extension/src/dto/validation';
import { parseDuolingoAvatarUrl } from '@duofollow/extension/src/duolingoAvatarUrl';
import { duolingoEndpoints } from '@duofollow/extension/src/duolingoEndpoints';
import {
  findAccountProfile,
  parseRelationshipPage,
} from '@duofollow/extension/src/duolingoPayload';
import {
  assertDuolingoRateLimit,
  checkDuolingoRateLimit,
} from '@duofollow/extension/src/duolingoRateLimit';
import {
  assertDuolingoResponse,
  readDuolingoJson,
} from '@duofollow/extension/src/duolingoResponse';
import {
  getDuolingoSessionUserId,
  identifyUnfollowSession,
} from '@duofollow/extension/src/duolingoSession';

import type {
  ComparedFollowingUser,
  FollowingComparisonResult,
  RelationshipCoverageStatus,
  UnfollowResult,
} from '@duofollow/extension/src/dto/DuolingoFollowingDto';
import type { RelationshipList, RelationshipPage } from '@duofollow/extension/src/duolingoPayload';

export const UNCONFIRMED_UNFOLLOW = 'Ответ Duolingo не удалось проверить.';
const ACCOUNT_MISMATCH = 'Укажи имя аккаунта, в который ты вошёл в Duolingo.';

type DuolingoAccount = { userId: string; username: string; picture: string | null };

function readPicture(value: unknown): string | null {
  const url = parseDuolingoAvatarUrl(value);
  if (!url) return null;

  const path = url.pathname.replace(/\/$/, '');
  const isAvatarRenderBase =
    url.hostname === 'd3gq3s1iyyx31w.cloudfront.net' &&
    path.startsWith('/static/render/bg/') &&
    /-\d+$/.test(path);
  const isProfilePhotoBase =
    url.hostname === 'simg-ssl.duolingo.com' && /^\/avatar\/[^/]+$/.test(path);

  if (isAvatarRenderBase || isProfilePhotoBase) {
    url.pathname = `${path}/medium`;
  }

  return url.href;
}

async function getRelationshipPage(
  list: RelationshipList,
  userId: string,
  signal: AbortSignal,
): Promise<RelationshipPage> {
  await checkDuolingoRateLimit(signal);
  const endpoint = duolingoEndpoints[list];
  const url = endpoint.url(userId);

  url.searchParams.set('pageSize', '500');
  url.searchParams.set('viewerId', userId);
  url.searchParams.set('_', String(Date.now()));

  assertDuolingoRateLimit();
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(12_000)]);
  const response = await fetch(url, {
    method: endpoint.method,
    credentials: 'include',
    redirect: 'error',
    signal: requestSignal,
  });

  await assertDuolingoResponse(response, `Duolingo ${list} returned HTTP ${response.status}`);
  const data = await readDuolingoJson(
    response,
    `Duolingo ${list} returned invalid JSON`,
    requestSignal,
  );
  return parseRelationshipPage(data, list);
}

function getRelationshipCoverage(
  { cursor, totalUsers }: RelationshipPage,
  uniqueUsers: number,
): RelationshipCoverageStatus {
  if (cursor === null) return uniqueUsers === totalUsers ? 'complete' : 'total-mismatch';
  return cursor ? 'cursor-present' : 'cursor-missing';
}

async function requireSessionUserId(signal: AbortSignal): Promise<string> {
  const userId = await getDuolingoSessionUserId(signal);
  signal.throwIfAborted();
  if (!userId) throw new ConnectorError('SIGNED_OUT', 'Войди в Duolingo в этом профиле Chrome.');
  return userId;
}

async function resolveDuolingoAccount(
  input: unknown,
  signal: AbortSignal,
  includePicture = false,
): Promise<DuolingoAccount> {
  const username = typeof input === 'string' ? input.trim().replace(/^@/, '').trim() : '';

  if (!username || /[\s/@?#]/u.test(username)) {
    throw new Error('Укажи имя аккаунта Duolingo, например username.');
  }

  const sessionUserId = await requireSessionUserId(signal);
  await checkDuolingoRateLimit(signal);

  const endpoint = duolingoEndpoints.accountLookup;
  const url = endpoint.url();
  url.searchParams.set('username', username);
  url.searchParams.set(
    'fields',
    includePicture ? 'users{id,username,picture}' : 'users{id,username}',
  );
  url.searchParams.set('_', String(Date.now()));

  const options = {
    method: endpoint.method,
    credentials: 'include' as const,
    redirect: 'error' as const,
    signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
  };
  assertDuolingoRateLimit();
  let response = await fetch(url, options);
  if (includePicture && response.status === 400) {
    signal.throwIfAborted();
    assertDuolingoRateLimit();
    const fallbackUrl = new URL(url);
    fallbackUrl.searchParams.set('fields', 'users{id,username}');
    response = await fetch(fallbackUrl, options);
  }

  await assertDuolingoResponse(response, `Поиск профиля Duolingo вернул HTTP ${response.status}.`);
  const data = await readDuolingoJson(
    response,
    'Duolingo вернул некорректный JSON при поиске профиля.',
    options.signal,
  );
  const account = findAccountProfile(data, username);
  if (!account) throw new Error(`Профиль @${username} не найден.`);
  if (String(account.id) !== sessionUserId)
    throw new ConnectorError('ACCOUNT_MISMATCH', ACCOUNT_MISMATCH);

  return {
    userId: String(account.id),
    username: account.username,
    picture: readPicture(account.picture),
  };
}

export async function getFollowingSummary(
  input: unknown,
  signal: AbortSignal,
): Promise<FollowingComparisonResult> {
  const {
    userId,
    username,
    picture: accountPicture,
  } = await resolveDuolingoAccount(input, signal, true);
  const [following, followers] = await Promise.all([
    getRelationshipPage('following', userId, signal),
    getRelationshipPage('followers', userId, signal),
  ]);

  const followingById = new Map(following.users.map((user) => [user.userId, user]));
  const followerIds = new Set(followers.users.map((user) => user.userId));
  const coverage = {
    following: getRelationshipCoverage(following, followingById.size),
    followers: getRelationshipCoverage(followers, followerIds.size),
  };
  const followersComplete = coverage.followers === 'complete';
  const comparedFollowing = Array.from(
    followingById.values(),
    ({ userId, username, displayName, picture }): ComparedFollowingUser => ({
      userId,
      username: typeof username === 'string' ? username.trim() : '',
      displayName: typeof displayName === 'string' ? displayName.trim() : '',
      picture: readPicture(picture),
      relationship: followerIds.has(userId)
        ? 'mutual'
        : followersComplete
          ? 'non-mutual'
          : 'unknown',
    }),
  );
  const nonMutualFollowing = followersComplete
    ? comparedFollowing
        .filter(({ relationship }) => relationship === 'non-mutual')
        .map(({ userId, username, displayName, picture }) => ({
          userId,
          username,
          displayName,
          picture,
        }))
    : null;

  return {
    success: true,
    comparison: {
      coverage,
      checkedFollowing: followingById.size,
      totalFollowing: following.totalUsers,
      checkedFollowers: followerIds.size,
      totalFollowers: followers.totalUsers,
      mutualUsers: comparedFollowing.filter(({ relationship }) => relationship === 'mutual').length,
      nonMutualUsers: nonMutualFollowing?.length ?? null,
      accountUsername: username,
      accountPicture,
      nonMutualFollowing,
      following: comparedFollowing,
    },
  };
}

export interface UnfollowTarget {
  requestId: string;
  userId: string;
  targetUserId: number;
  fingerprint: string;
}

async function readUnfollowRelationship(
  { userId, targetUserId }: UnfollowTarget,
  signal: AbortSignal,
) {
  const following = await getRelationshipPage('following', userId, signal);
  const target = following.users.find((user) => user.userId === targetUserId);
  if (target) return { state: 'following' as const, target };
  const uniqueUsers = new Set(following.users.map((user) => user.userId)).size;
  return {
    state:
      getRelationshipCoverage(following, uniqueUsers) === 'complete'
        ? ('absent' as const)
        : ('unknown' as const),
  };
}

export async function prepareUnfollow(
  requestId: string,
  username: unknown,
  targetUserId: unknown,
  signal: AbortSignal,
) {
  if (!isUserId(targetUserId)) {
    throw new Error('У подписки некорректный ID.');
  }

  const account = await resolveDuolingoAccount(username, signal);
  if (String(targetUserId) === account.userId) {
    throw new Error('Нельзя отписаться от своего профиля.');
  }

  const session = await identifyUnfollowSession(requestId, signal);
  if (session?.userId !== account.userId)
    throw new ConnectorError('ACCOUNT_MISMATCH', ACCOUNT_MISMATCH);
  const target = { requestId, ...session, targetUserId };
  const profile = await requireFollowedProfile(target, signal);
  const label =
    typeof profile.username === 'string' && profile.username.trim()
      ? `@${profile.username}`
      : typeof profile.displayName === 'string' && profile.displayName.trim()
        ? profile.displayName
        : String(targetUserId);
  return {
    target,
    preview: { username: account.username, targetUserId, targetLabel: label },
  };
}

async function assertUnfollowSession(target: UnfollowTarget, signal: AbortSignal) {
  const session = await identifyUnfollowSession(target.requestId, signal);
  if (session?.userId !== target.userId || session.fingerprint !== target.fingerprint)
    throw new ConnectorError('ACCOUNT_MISMATCH', ACCOUNT_MISMATCH);
}

async function requireFollowedProfile(target: UnfollowTarget, signal: AbortSignal) {
  const relationship = await readUnfollowRelationship(target, signal);
  await assertUnfollowSession(target, signal);
  if (relationship.state === 'following') return relationship.target;
  if (relationship.state === 'absent')
    throw new ConnectorError('NOT_FOLLOWING', 'Подписка на этот профиль отсутствует.');
  throw new ConnectorError(
    'NOT_FOUND_IN_PARTIAL_RESULT',
    'Duolingo вернул часть подписок. Статус этого профиля неизвестен.',
  );
}

export async function verifyUnfollowOutcome(
  target: UnfollowTarget,
  signal: AbortSignal,
): Promise<UnfollowResult> {
  try {
    await assertUnfollowSession(target, signal);
    const relationship = await readUnfollowRelationship(target, signal);
    await assertUnfollowSession(target, signal);
    if (relationship.state === 'absent')
      return { success: true, targetUserId: target.targetUserId };
    if (relationship.state === 'following') {
      return {
        success: false,
        errorCode: 'STILL_FOLLOWING',
        error: 'При проверке подписка по-прежнему была видна в списке.',
      };
    }
  } catch {
    // An unavailable or changed session leaves the outcome unknown.
  }
  return { success: false, errorCode: 'UNFOLLOW_UNCONFIRMED', error: UNCONFIRMED_UNFOLLOW };
}

export async function performUnfollow(
  target: UnfollowTarget,
  signal: AbortSignal,
  authorizeWrite: () => Promise<void>,
  onWriteStarted: () => void,
): Promise<Extract<UnfollowResult, { success: true }>> {
  const { userId, targetUserId } = target;
  await assertUnfollowSession(target, signal);
  await requireFollowedProfile(target, signal);
  await authorizeWrite();
  await assertUnfollowSession(target, signal);
  signal.throwIfAborted();

  const endpoint = duolingoEndpoints.unfollow;
  // The relationship check loaded the deadline. Keep the final session check and DELETE adjacent.
  assertDuolingoRateLimit();
  onWriteStarted();
  const response = await fetch(endpoint.url(userId, targetUserId).href, {
    method: endpoint.method,
    credentials: 'include',
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
  }).catch(() => {
    throw new ConnectorError('UNFOLLOW_UNCONFIRMED', UNCONFIRMED_UNFOLLOW);
  });

  if (!response.ok) {
    const hint =
      response.status === 401 || response.status === 403
        ? ' Войди в указанный аккаунт Duolingo в этом профиле браузера.'
        : '';
    const message = `Duolingo вернул HTTP ${response.status}.${hint}`;
    if (response.status >= 500) throw new ConnectorError('UNFOLLOW_UNCONFIRMED', message);
    await assertDuolingoResponse(response, message);
  }

  const data: unknown = await response.json().catch(() => {
    throw new ConnectorError('UNFOLLOW_UNCONFIRMED', UNCONFIRMED_UNFOLLOW);
  });
  if (!isRecord(data) || data.successful !== true) {
    throw new ConnectorError('UNFOLLOW_UNCONFIRMED', 'Duolingo не подтвердил отписку.');
  }

  return { success: true, targetUserId };
}
