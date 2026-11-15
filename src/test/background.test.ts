import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FollowingComparisonResult,
  UnfollowResult,
} from '../../extension/src/dto/DuolingoFollowingDto';
import { duolingoEndpoints } from '../../extension/src/duolingoEndpoints';

type Listener = (
  message: unknown,
  sender: { url?: string; frameId?: number },
  reply: (result: unknown) => void,
) => boolean | void;

const approvedOrigin = 'http://localhost:5173/duofollow/';
const account = {
  id: 101,
  username: 'Learner',
  picture: 'https://simg-ssl.duolingo.com/account.png',
};
const targetUnfollowUrl = duolingoEndpoints.unfollow.url(String(account.id), 202).href;
const resolveAccount = () => Response.json({ users: [account] });
const following = (users: unknown[], totalUsers = users.length) =>
  Response.json({ following: { cursor: 'v1:500', totalUsers, users } });
const followers = (users: unknown[], totalUsers = users.length, cursor: string | null = null) =>
  Response.json({ followers: { cursor, totalUsers, users } });
const compare = (username: unknown): Promise<FollowingComparisonResult> =>
  new Promise((resolve) => {
    const keepOpen = listener(
      { type: 'GET_FOLLOWING_SUMMARY', username },
      { url: approvedOrigin },
      (reply) => resolve(reply as FollowingComparisonResult),
    );
    expect(keepOpen).toBe(true);
  });

const unfollow = (targetUserId: unknown = 202): Promise<UnfollowResult> =>
  new Promise((resolve) => {
    const keepOpen = listener(
      { type: 'UNFOLLOW', username: account.username, targetUserId },
      { url: approvedOrigin, frameId: 0 },
      (reply) => resolve(reply as UnfollowResult),
    );
    expect(keepOpen).toBe(true);
  });

let listener: Listener;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('chrome', {
    runtime: {
      onMessageExternal: {
        addListener(callback: Listener) {
          listener = callback;
        },
      },
    },
  });
  await import('../../extension/src/background');
});

afterEach(() => vi.unstubAllGlobals());

describe('extension worker', () => {
  it('checks the sender and replies to PING or an unsupported message', () => {
    const reply = vi.fn();
    for (const url of [undefined, 'invalid', 'https://unrelated.example/']) {
      expect(listener({ type: 'PING' }, { url }, reply)).toBeUndefined();
    }
    expect(reply).not.toHaveBeenCalled();
    listener({ type: 'PING' }, { url: approvedOrigin }, reply);
    expect(reply).toHaveBeenLastCalledWith({
      success: true,
      message: 'DuoFollow Connector is running',
    });
    listener(null, { url: approvedOrigin }, reply);
    expect(reply).toHaveBeenLastCalledWith({ success: false, error: 'Unsupported message' });
  });

  it('uses the configured URLs for the diagnostic requests', async () => {
    const probe = (type: 'PROBE_DUOLINGO' | 'PROBE_FOLLOWING') =>
      new Promise((resolve) => {
        expect(listener({ type }, { url: approvedOrigin }, resolve)).toBe(true);
      });
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));

    await expect(probe('PROBE_DUOLINGO')).resolves.toEqual({ status: 200, accessible: true });
    await expect(probe('PROBE_FOLLOWING')).resolves.toEqual({ status: 403, accessible: false });

    const [[publicUrl, publicOptions], [followingUrl, followingOptions]] = fetchMock.mock.calls;
    const publicProfile = new URL(String(publicUrl));
    expect(publicProfile.origin + publicProfile.pathname).toBe(
      duolingoEndpoints.publicProfileLookup.url().href,
    );
    expect(publicProfile.searchParams.get('username')).toBe('duo');
    expect(publicOptions).toMatchObject({
      method: duolingoEndpoints.publicProfileLookup.method,
      credentials: 'omit',
    });

    const following = new URL(String(followingUrl));
    const viewedId = following.searchParams.get('viewedId');
    expect(viewedId).toMatch(/^\d+$/);
    expect(following.origin + following.pathname).toBe(
      duolingoEndpoints.following.url(viewedId ?? '').href,
    );
    expect(following.searchParams.get('pageSize')).toBe('500');
    expect(followingOptions).toMatchObject({
      method: duolingoEndpoints.following.method,
      credentials: 'include',
    });
  });

  it('uses the correct endpoints, deduplicates IDs and compares by ID regardless of follow flags', async () => {
    fetchMock
      .mockResolvedValueOnce(resolveAccount())
      .mockResolvedValueOnce(
        following(
          [
            { userId: 1, isFollowedBy: false },
            { userId: 2, username: ' target ', displayName: ' Target ', isFollowedBy: 'invalid' },
            { userId: 2, username: ' target ', displayName: ' Target ' },
          ],
          700,
        ),
      )
      .mockResolvedValueOnce(followers([{ userId: 1 }]));

    const result = await compare('  @LEARNER  ');
    expect(result).toMatchObject({
      success: true,
      firstPage: { received: 3, isFollowedByFalse: 1, isFollowedByMissingOrInvalid: 2 },
      secondPage: null,
      comparison: {
        accountUsername: 'Learner',
        accountPicture: account.picture,
        checkedFollowing: 2,
        totalFollowing: 700,
        checkedFollowers: 1,
        mutualUsers: 1,
        nonMutualUsers: 1,
        nonMutualFollowing: [
          { userId: 2, username: 'target', displayName: 'Target', picture: null },
        ],
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const requests = fetchMock.mock.calls.map(([url, options]) => {
      expect(options).toMatchObject({ credentials: 'include', signal: expect.any(AbortSignal) });
      return new URL(String(url));
    });
    expect(requests.map((url) => url.origin + url.pathname)).toEqual([
      duolingoEndpoints.accountLookup.url().href,
      duolingoEndpoints.following.url(String(account.id)).href,
      duolingoEndpoints.followers.url(String(account.id)).href,
    ]);
    expect(fetchMock.mock.calls.map(([, options]) => options?.method)).toEqual([
      duolingoEndpoints.accountLookup.method,
      duolingoEndpoints.following.method,
      duolingoEndpoints.followers.method,
    ]);
    expect(requests[0].searchParams.get('username')).toBe('LEARNER');
    for (const url of requests.slice(1)) {
      expect(url.searchParams.get('viewerId')).toBe('101');
      expect(url.searchParams.get('pageSize')).toBe('500');
      expect(url.searchParams.has('cursor')).toBe(false);
    }
  });

  it('passes HTTPS avatar URLs through and discards invalid or insecure ones', async () => {
    const picture = 'https://simg-ssl.duolingo.com/following.png';
    fetchMock
      .mockResolvedValueOnce(resolveAccount())
      .mockResolvedValueOnce(
        following([
          { userId: 1, picture },
          { userId: 2, picture: 'http://example.com/avatar.png' },
          { userId: 3, picture: 'https://user:password@example.com/avatar.png' },
          { userId: 4, picture: 'not a URL' },
        ]),
      )
      .mockResolvedValueOnce(followers([]));

    await expect(compare('Learner')).resolves.toMatchObject({
      success: true,
      comparison: {
        accountPicture: account.picture,
        nonMutualFollowing: [
          { userId: 1, picture },
          { userId: 2, picture: null },
          { userId: 3, picture: null },
          { userId: 4, picture: null },
        ],
      },
    });
    const lookup = fetchMock.mock.calls[0][0];
    expect(new URL(String(lookup)).searchParams.get('fields')).toBe('users{id,username,picture}');
  });

  it('keeps comparison available if the profile endpoint rejects the picture field', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(
        Response.json({ users: [{ id: account.id, username: account.username }] }),
      )
      .mockResolvedValueOnce(following([]))
      .mockResolvedValueOnce(followers([]));

    await expect(compare('Learner')).resolves.toMatchObject({
      success: true,
      comparison: { accountUsername: 'Learner', accountPicture: null },
    });
    const fallback = fetchMock.mock.calls[1][0];
    expect(new URL(String(fallback)).searchParams.get('fields')).toBe('users{id,username}');
  });

  it('normalizes scheme-relative avatar URLs and adds the size suffix in the header and cards', async () => {
    const accountPicture = 'https://simg-ssl.duolingo.com/avatar/default_2';
    const avatar =
      'https://d3gq3s1iyyx31w.cloudfront.net/static/render/bg/Nose%20Piercing-0/Wrinkles-0';
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ users: [{ ...account, picture: avatar.slice('https:'.length) }] }),
      )
      .mockResolvedValueOnce(
        following([
          { userId: 1, picture: accountPicture.slice('https:'.length) },
          { userId: 2, picture: `${avatar}/small` },
          { userId: 3, picture: `${accountPicture}/xlarge` },
          { userId: 4, picture: `${avatar}/?v=1` },
        ]),
      )
      .mockResolvedValueOnce(followers([]));

    await expect(compare('Learner')).resolves.toMatchObject({
      success: true,
      comparison: {
        accountPicture: `${avatar}/medium`,
        nonMutualFollowing: [
          { userId: 1, picture: `${accountPicture}/medium` },
          { userId: 2, picture: `${avatar}/small` },
          { userId: 3, picture: `${accountPicture}/xlarge` },
          { userId: 4, picture: `${avatar}/medium?v=1` },
        ],
      },
    });
  });

  it.each([
    { total: 1, cursor: 'v1:500' },
    { total: 2, cursor: null },
  ])(
    'reports unknown nonmutual accounts for incomplete followers (%j)',
    async ({ total, cursor }) => {
      fetchMock
        .mockResolvedValueOnce(resolveAccount())
        .mockResolvedValueOnce(following([{ userId: 1 }, { userId: 2 }]))
        .mockResolvedValueOnce(followers([{ userId: 1 }], total, cursor));
      await expect(compare('Learner')).resolves.toMatchObject({
        success: true,
        comparison: { mutualUsers: 1, nonMutualUsers: null, nonMutualFollowing: null },
      });
    },
  );

  it('handles empty lists as a confirmed zero', async () => {
    fetchMock
      .mockResolvedValueOnce(resolveAccount())
      .mockResolvedValueOnce(following([]))
      .mockResolvedValueOnce(followers([]));
    await expect(compare('Learner')).resolves.toMatchObject({
      success: true,
      comparison: {
        checkedFollowing: 0,
        mutualUsers: 0,
        nonMutualUsers: 0,
        nonMutualFollowing: [],
      },
    });
  });

  it('rejects invalid input and missing or malformed profiles', async () => {
    await expect(compare('https://example.com/profile')).resolves.toMatchObject({ success: false });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(Response.json({ users: [] }));
    await expect(compare('Learner')).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('не найден'),
    });
    fetchMock.mockResolvedValueOnce(Response.json({ users: [{ ...account, id: 0 }] }));
    await expect(compare('Learner')).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('некорректный ID'),
    });
  });

  it.each([401, 403, 429])('preserves HTTP %i from Duolingo', async (status) => {
    fetchMock
      .mockResolvedValueOnce(resolveAccount())
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(followers([]));
    await expect(compare('Learner')).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining(`HTTP ${status}`),
    });
  });

  it('distinguishes malformed JSON, an invalid page and a failed fetch', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{'));
    await expect(compare('Learner')).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('JSON'),
    });
    fetchMock
      .mockResolvedValueOnce(resolveAccount())
      .mockResolvedValueOnce(following([{ userId: 'bad-id' }]))
      .mockResolvedValueOnce(followers([]));
    await expect(compare('Learner')).resolves.toEqual({
      success: false,
      error: 'Duolingo returned an invalid following page',
    });
    fetchMock.mockRejectedValueOnce(new Error('Network unavailable'));
    await expect(compare('Learner')).resolves.toEqual({
      success: false,
      error: 'Network unavailable',
    });
  });

  it('deletes one existing subscription with the active session and checks the response', async () => {
    fetchMock
      .mockResolvedValueOnce(resolveAccount())
      .mockResolvedValueOnce(following([{ userId: 202 }, { userId: 303 }]))
      .mockResolvedValueOnce(Response.json({ successful: true }));

    await expect(unfollow()).resolves.toEqual({ success: true, targetUserId: 202 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      targetUnfollowUrl,
      expect.objectContaining({
        method: duolingoEndpoints.unfollow.method,
        credentials: 'include',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('requires the DuoFollow page, a valid target and an existing subscription', async () => {
    const message = { type: 'UNFOLLOW', username: account.username, targetUserId: 202 };
    const reply = vi.fn();
    listener(message, { url: 'https://example.com/duofollow/' }, reply);
    expect(reply).not.toHaveBeenCalled();
    for (const sender of [
      { url: 'https://hedgerock.github.io/another-project/' },
      { url: approvedOrigin, frameId: 1 },
    ]) {
      listener(message, sender, reply);
      expect(reply).toHaveBeenLastCalledWith({ success: false, error: expect.any(String) });
    }
    for (const id of [null, '202', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(unfollow(id)).resolves.toMatchObject({ success: false });
    }
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(resolveAccount());
    await expect(unfollow(account.id)).resolves.toMatchObject({ success: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(resolveAccount()).mockResolvedValueOnce(following([]));
    await expect(unfollow()).resolves.toMatchObject({ success: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.some(([url]) => String(url) === targetUnfollowUrl)).toBe(false);
  });

  it.each([401, 403, 429])('reports HTTP %i during deletion without retrying', async (status) => {
    fetchMock
      .mockResolvedValueOnce(resolveAccount())
      .mockResolvedValueOnce(following([{ userId: 202 }]))
      .mockResolvedValueOnce(new Response(null, { status }));
    await expect(unfollow()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining(`HTTP ${status}`),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['explicit refusal', () => Promise.resolve(Response.json({ successful: false }))],
    ['non-boolean success', () => Promise.resolve(Response.json({ successful: 'true' }))],
    ['invalid JSON', () => Promise.resolve(new Response('{'))],
    ['a network failure', () => Promise.reject(new Error('Connection closed'))],
  ])('keeps deletion unconfirmed after %s', async (_name, outcome) => {
    fetchMock
      .mockResolvedValueOnce(resolveAccount())
      .mockResolvedValueOnce(following([{ userId: 202 }]))
      .mockImplementationOnce(outcome);
    await expect(unfollow()).resolves.toMatchObject({ success: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('deduplicates a pending deletion across tabs', async () => {
    let complete!: (response: Response) => void;
    let started!: () => void;
    const deleting = new Promise<void>((resolve) => {
      started = resolve;
    });
    fetchMock
      .mockResolvedValueOnce(resolveAccount())
      .mockResolvedValueOnce(following([{ userId: 202 }]))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve;
            started();
          }),
      )
      .mockResolvedValueOnce(resolveAccount());
    const pending = unfollow();
    await deleting;
    await expect(unfollow()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('уже выполняется'),
    });
    complete(Response.json({ successful: true }));
    await expect(pending).resolves.toMatchObject({ success: true });
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === targetUnfollowUrl)).toHaveLength(
      1,
    );
  });
});
