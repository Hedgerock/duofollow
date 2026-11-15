import type {
  DuolingoFollowingPageDto,
  FollowingComparisonResult,
  FollowingPageSummary,
  FollowingPaginationDiagnostics,
} from './dto/DuolingoFollowingDto';

const ALLOWED_ORIGINS = new Set([
  'https://hedgerock.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

type RelationshipList = 'following' | 'followers';
type RelationshipPage = DuolingoFollowingPageDto['following'];
type DuolingoAccount = { userId: string; username: string };

async function getRelationshipPage(
  list: RelationshipList,
  userId: string,
  pageSize = 500,
  cursor?: string,
): Promise<RelationshipPage> {
  const version = list === 'following' ? '2017-06-30' : '2023-05-23';
  const url = new URL(
    `https://www.duolingo.com/${version}/friends/users/${encodeURIComponent(userId)}/${list}`,
  );

  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('viewerId', userId);
  url.searchParams.set('_', String(Date.now()));

  if (cursor) {
    url.searchParams.set('cursor', cursor);
  }

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`Duolingo ${list} returned HTTP ${response.status}`);
  }

  const data: Partial<Record<RelationshipList, RelationshipPage>> | null = await response
    .json()
    .catch((error: unknown) => {
      if (error instanceof SyntaxError) {
        throw new Error(`Duolingo ${list} returned invalid JSON`);
      }

      throw error;
    });
  const page = data?.[list];

  if (
    !page ||
    !Array.isArray(page.users) ||
    page.users.some((user) => !Number.isSafeInteger(user?.userId)) ||
    !Number.isSafeInteger(page.totalUsers) ||
    page.totalUsers < 0 ||
    (page.cursor != null && typeof page.cursor !== 'string')
  ) {
    throw new Error(`Duolingo returned an invalid ${list} page`);
  }

  return page;
}

async function getFollowingPage(
  userId: string,
  pageSize = 500,
  cursor?: string,
): Promise<DuolingoFollowingPageDto> {
  return { following: await getRelationshipPage('following', userId, pageSize, cursor) };
}

function summarizeFollowingPage(page: DuolingoFollowingPageDto): FollowingPageSummary {
  const { users, cursor, totalUsers } = page.following;
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

async function getFollowingDiagnostics(
  userId: string,
  pageSize = 500,
): Promise<FollowingPaginationDiagnostics> {
  const first = await getFollowingPage(userId, pageSize);
  const cursor = first.following.cursor;
  const second = cursor ? await getFollowingPage(userId, pageSize, cursor) : null;

  const firstIds = new Set(first.following.users.map((user) => user.userId));
  const secondIds = new Set(second?.following.users.map((user) => user.userId));

  return {
    success: true,
    firstPage: summarizeFollowingPage(first),
    secondPage: second ? summarizeFollowingPage(second) : null,
    duplicatedUsers: [...secondIds].filter((id) => firstIds.has(id)).length,
    uniqueUsers: new Set([...firstIds, ...secondIds]).size,
  };
}

async function resolveDuolingoAccount(input: unknown): Promise<DuolingoAccount> {
  const username = typeof input === 'string' ? input.trim().replace(/^@/, '').trim() : '';

  if (!username || /[\s/@?#]/u.test(username)) {
    throw new Error('Укажи имя аккаунта Duolingo, например username.');
  }

  const url = new URL('https://www.duolingo.com/2023-05-23/users');
  url.searchParams.set('username', username);
  url.searchParams.set('fields', 'users{id,username}');
  url.searchParams.set('_', String(Date.now()));

  const response = await fetch(url, {
    credentials: 'include',
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`Поиск профиля Duolingo вернул HTTP ${response.status}.`);
  }

  const data: { users?: Array<{ id?: unknown; username?: unknown }> } | null = await response
    .json()
    .catch((error: unknown) => {
      if (error instanceof SyntaxError) {
        throw new Error('Duolingo вернул некорректный JSON при поиске профиля.');
      }
      throw error;
    });

  if (!Array.isArray(data?.users)) {
    throw new Error('Duolingo вернул неожиданный ответ при поиске профиля.');
  }

  const account = data.users.find(
    (user) =>
      typeof user?.username === 'string' && user.username.toLowerCase() === username.toLowerCase(),
  );

  if (!account || typeof account.username !== 'string') {
    throw new Error(`Профиль @${username} не найден.`);
  }

  if (typeof account.id !== 'number' || !Number.isSafeInteger(account.id) || account.id <= 0) {
    throw new Error('Duolingo вернул некорректный ID профиля.');
  }

  return { userId: String(account.id), username: account.username };
}

async function getFollowingComparison({
  userId,
  username,
}: DuolingoAccount): Promise<FollowingComparisonResult> {
  const [first, followers] = await Promise.all([
    getFollowingPage(userId),
    getRelationshipPage('followers', userId),
  ]);

  const followingById = new Map(first.following.users.map((user) => [user.userId, user]));
  const followerIds = new Set(followers.users.map((user) => user.userId));
  const missingFromFollowers = [...followingById.values()].filter(
    (user) => !followerIds.has(user.userId),
  );

  const followersComplete = followers.cursor === null && followerIds.size === followers.totalUsers;
  const nonMutualFollowing = followersComplete
    ? missingFromFollowers.map(({ userId, username, displayName }) => ({
        userId,
        username: typeof username === 'string' ? username.trim() : '',
        displayName: typeof displayName === 'string' ? displayName.trim() : '',
      }))
    : null;

  return {
    success: true,
    firstPage: summarizeFollowingPage(first),
    secondPage: null,
    duplicatedUsers: 0,
    uniqueUsers: followingById.size,
    comparison: {
      checkedFollowing: followingById.size,
      totalFollowing: first.following.totalUsers,
      checkedFollowers: followerIds.size,
      totalFollowers: followers.totalUsers,
      mutualUsers: followingById.size - missingFromFollowers.length,
      nonMutualUsers: nonMutualFollowing?.length ?? null,
      accountUsername: username,
      nonMutualFollowing,
    },
  };
}

async function probeDuolingo(): Promise<{
  status: number;
  accessible: boolean;
}> {
  const url = new URL('https://www.duolingo.com/2017-06-30/users');

  url.searchParams.set('username', 'duo');

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'omit',
  });

  return {
    status: response.status,
    accessible: response.ok,
  };
}

async function probeFollowing(): Promise<{
  status: number;
  accessible: boolean;
}> {
  const userId = '942136874597453';

  const url = new URL(`https://www.duolingo.com/2017-06-30/friends/users/${userId}/following`);

  url.searchParams.set('pageSize', '500');
  url.searchParams.set('viewedId', userId);

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
  });

  return {
    status: response.status,
    accessible: response.ok,
  };
}

chrome.runtime.onMessageExternal.addListener((message: unknown, sender, sendResponse) => {
  if (!sender.url) {
    return;
  }

  let origin: string;

  try {
    origin = new URL(sender.url).origin;
  } catch {
    return;
  }

  if (!ALLOWED_ORIGINS.has(origin)) {
    return;
  }

  if (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'GET_FOLLOWING_SUMMARY'
  ) {
    resolveDuolingoAccount('username' in message ? message.username : undefined)
      .then(getFollowingComparison)
      .then(sendResponse, (error: unknown) => {
        const result: FollowingComparisonResult = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        sendResponse(result);
      });

    return true;
  }

  if (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'PROBE_FOLLOWING'
  ) {
    probeFollowing()
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({
          accessible: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });

    return true;
  }

  if (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'PROBE_DUOLINGO'
  ) {
    probeDuolingo()
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({
          accessible: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });

    return true;
  }

  if (
    typeof message !== 'object' ||
    message === null ||
    !('type' in message) ||
    message.type !== 'PING'
  ) {
    sendResponse({
      success: false,
      error: 'Unsupported message',
    });

    return;
  }

  sendResponse({
    success: true,
    message: 'DuoFollow Connector is running',
  });
});
