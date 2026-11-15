import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FollowingComparisonResult } from '../../extension/src/dto/DuolingoFollowingDto';

type Listener = (
  message: unknown,
  sender: { url?: string },
  reply: (result: unknown) => void,
) => boolean | void;

const approvedOrigin = 'http://localhost:5173/duofollow/';
const account = { id: 101, username: 'Learner' };
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
        checkedFollowing: 2,
        totalFollowing: 700,
        checkedFollowers: 1,
        mutualUsers: 1,
        nonMutualUsers: 1,
        nonMutualFollowing: [{ userId: 2, username: 'target', displayName: 'Target' }],
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const requests = fetchMock.mock.calls.map(([url, options]) => {
      expect(options).toMatchObject({ credentials: 'include', signal: expect.any(AbortSignal) });
      return new URL(String(url));
    });
    expect(requests.map((url) => url.pathname)).toEqual([
      '/2023-05-23/users',
      '/2017-06-30/friends/users/101/following',
      '/2023-05-23/friends/users/101/followers',
    ]);
    expect(requests[0].searchParams.get('username')).toBe('LEARNER');
    for (const url of requests.slice(1)) {
      expect(url.searchParams.get('viewerId')).toBe('101');
      expect(url.searchParams.get('pageSize')).toBe('500');
      expect(url.searchParams.has('cursor')).toBe(false);
    }
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
});
