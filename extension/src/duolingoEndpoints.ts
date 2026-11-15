const DUOLINGO_API_ORIGIN = 'https://www.duolingo.com';

function createApiUrl(path: `/${string}`): URL {
  const url = new URL(DUOLINGO_API_ORIGIN);
  url.pathname = path;
  return url;
}

export const duolingoEndpoints = {
  accountLookup: {
    method: 'GET',
    url: () => createApiUrl('/2023-05-23/users'),
  },
  following: {
    method: 'GET',
    url: (userId: string) =>
      createApiUrl(`/2017-06-30/friends/users/${encodeURIComponent(userId)}/following`),
  },
  followers: {
    method: 'GET',
    url: (userId: string) =>
      createApiUrl(`/2023-05-23/friends/users/${encodeURIComponent(userId)}/followers`),
  },
  unfollow: {
    method: 'DELETE',
    url: (accountId: string, targetUserId: number) =>
      createApiUrl(
        `/2017-06-30/friends/users/${encodeURIComponent(accountId)}/follow/${encodeURIComponent(targetUserId)}`,
      ),
  },
  publicProfileLookup: {
    method: 'GET',
    url: () => createApiUrl('/2017-06-30/users'),
  },
} as const;
