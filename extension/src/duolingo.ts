import { ConnectorError } from '@duofollow/extension/src/dto/ConnectorError';
import { parseDuolingoAvatarUrl } from '@duofollow/extension/src/duolingoAvatarUrl';
import { duolingoEndpoints } from '@duofollow/extension/src/duolingoEndpoints';
import {
  assertDuolingoResponse,
  readDuolingoJson,
} from '@duofollow/extension/src/duolingoResponse';
import { getDuolingoSessionUserId } from '@duofollow/extension/src/duolingoSession';

import type {
  ComparedFollowingUser,
  DuolingoFollowingPageDto,
  FollowingComparisonResult,
  FollowingPageSummary,
  RelationshipCoverageStatus,
  UnfollowResult,
} from '@duofollow/extension/src/dto/DuolingoFollowingDto';

const pendingUnfollows = new Set<string>();
const UNCONFIRMED_UNFOLLOW = 'Ответ Duolingo не удалось проверить.';
const ACCOUNT_MISMATCH = 'Укажи имя аккаунта, в который ты вошёл в Duolingo.';

type RelationshipList = 'following' | 'followers';
type RelationshipPage = DuolingoFollowingPageDto['following'];
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
  signal.throwIfAborted();
  const endpoint = duolingoEndpoints[list];
  const url = endpoint.url(userId);

  url.searchParams.set('pageSize', '500');
  url.searchParams.set('viewerId', userId);
  url.searchParams.set('_', String(Date.now()));

  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(12_000)]);
  const response = await fetch(url, {
    method: endpoint.method,
    credentials: 'include',
    redirect: 'error',
    signal: requestSignal,
  });

  await assertDuolingoResponse(response, `Duolingo ${list} returned HTTP ${response.status}`);
  const data = await readDuolingoJson<Partial<Record<RelationshipList, RelationshipPage>> | null>(
    response,
    `Duolingo ${list} returned invalid JSON`,
    requestSignal,
  );
  const page = data?.[list];

  if (
    !page ||
    !Array.isArray(page.users) ||
    page.users.some((user) => !Number.isSafeInteger(user?.userId)) ||
    !Number.isSafeInteger(page.totalUsers) ||
    page.totalUsers < 0 ||
    (page.cursor != null && typeof page.cursor !== 'string')
  ) {
    throw new ConnectorError('INVALID_RESPONSE', `Duolingo returned an invalid ${list} page`);
  }

  return page;
}

function getRelationshipCoverage(
  { cursor, totalUsers }: RelationshipPage,
  uniqueUsers: number,
): RelationshipCoverageStatus {
  if (cursor === null) return uniqueUsers === totalUsers ? 'complete' : 'total-mismatch';
  return cursor ? 'cursor-present' : 'cursor-missing';
}

function summarizeFollowingPage(page: RelationshipPage): FollowingPageSummary {
  const { users, cursor, totalUsers } = page;
  const isFollowedByTrue = users.filter((user) => user.isFollowedBy === true).length;
  const isFollowedByFalse = users.filter((user) => user.isFollowedBy === false).length;

  return {
    received: users.length,
    cursor: cursor || null,
    totalUsers,
    isFollowingTrue: users.filter((user) => user.isFollowing === true).length,
    isFollowingFalse: users.filter((user) => user.isFollowing === false).length,
    isFollowedByTrue,
    isFollowedByFalse,
    isFollowedByMissingOrInvalid: users.length - isFollowedByTrue - isFollowedByFalse,
  };
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
  let response = await fetch(url, options);
  if (includePicture && response.status === 400) {
    signal.throwIfAborted();
    const fallbackUrl = new URL(url);
    fallbackUrl.searchParams.set('fields', 'users{id,username}');
    response = await fetch(fallbackUrl, options);
  }

  await assertDuolingoResponse(response, `Поиск профиля Duolingo вернул HTTP ${response.status}.`);
  const data = await readDuolingoJson<{
    users?: Array<{ id?: unknown; username?: unknown; picture?: unknown }>;
  } | null>(response, 'Duolingo вернул некорректный JSON при поиске профиля.', options.signal);

  if (!Array.isArray(data?.users)) {
    throw new ConnectorError(
      'INVALID_RESPONSE',
      'Duolingo вернул неожиданный ответ при поиске профиля.',
    );
  }

  const account = data.users.find(
    (user) =>
      typeof user?.username === 'string' && user.username.toLowerCase() === username.toLowerCase(),
  );

  if (!account || typeof account.username !== 'string') {
    throw new Error(`Профиль @${username} не найден.`);
  }

  if (typeof account.id !== 'number' || !Number.isSafeInteger(account.id) || account.id <= 0) {
    throw new ConnectorError('INVALID_RESPONSE', 'Duolingo вернул некорректный ID профиля.');
  }
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
    firstPage: summarizeFollowingPage(following),
    secondPage: null,
    duplicatedUsers: 0,
    uniqueUsers: followingById.size,
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

export async function unfollow(
  username: unknown,
  targetUserId: unknown,
  signal: AbortSignal,
): Promise<Extract<UnfollowResult, { success: true }>> {
  if (
    typeof targetUserId !== 'number' ||
    !Number.isSafeInteger(targetUserId) ||
    targetUserId <= 0
  ) {
    throw new Error('У подписки некорректный ID.');
  }

  const { userId } = await resolveDuolingoAccount(username, signal);
  if (String(targetUserId) === userId) {
    throw new Error('Нельзя отписаться от своего профиля.');
  }

  const key = `${userId}/${targetUserId}`;
  if (pendingUnfollows.has(key)) {
    throw new Error('Этот запрос на отписку уже выполняется.');
  }

  pendingUnfollows.add(key);
  try {
    const following = await getRelationshipPage('following', userId, signal);
    if (!following.users.some((user) => user.userId === targetUserId)) {
      throw new Error('Подписки нет среди полученных записей Duolingo.');
    }

    if ((await requireSessionUserId(signal)) !== userId)
      throw new ConnectorError('ACCOUNT_MISMATCH', ACCOUNT_MISMATCH);
    signal.throwIfAborted();

    const endpoint = duolingoEndpoints.unfollow;
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

    const data: { successful?: unknown } | null = await response.json().catch(() => {
      throw new ConnectorError('UNFOLLOW_UNCONFIRMED', UNCONFIRMED_UNFOLLOW);
    });
    if (data?.successful !== true) {
      throw new ConnectorError('UNFOLLOW_UNCONFIRMED', 'Duolingo не подтвердил отписку.');
    }

    return { success: true, targetUserId };
  } finally {
    pendingUnfollows.delete(key);
  }
}
