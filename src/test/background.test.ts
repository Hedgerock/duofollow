import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FollowingComparisonResult,
  UnfollowResult,
} from '../../extension/src/dto/DuolingoFollowingDto';
import { duolingoEndpoints } from '../../extension/src/duolingoEndpoints';
import { ACCESS_CONSENT_KEY } from '../../extension/src/duolingoAccess';

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
const getCookie =
  vi.fn<(details: { url: string; name: string }) => Promise<{ value: string } | null>>();
const sessionCookie = (id: number) => ({
  value: `fixture.${btoa(JSON.stringify({ sub: id, exp: 4_000_000_000 }))}.signature`,
});
const getSettings = vi.fn<() => Promise<Record<string, unknown>>>();
const containsPermissions = vi.fn<() => Promise<boolean>>();
const openOptionsPage = vi.fn<() => Promise<void>>();
const getManifest = vi.fn();
let permissionsRemoved: (permissions: chrome.permissions.Permissions) => void;
let storageChanged: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
let connectListener: (port: chrome.runtime.Port) => void;

beforeEach(async () => {
  vi.resetModules();
  fetchMock.mockReset();
  getCookie.mockReset().mockResolvedValue(sessionCookie(account.id));
  getSettings.mockReset().mockResolvedValue({ [ACCESS_CONSENT_KEY]: 1 });
  containsPermissions.mockReset().mockResolvedValue(true);
  openOptionsPage.mockReset().mockResolvedValue(undefined);
  getManifest.mockReset().mockReturnValue({
    externally_connectable: { matches: ['https://hedgerock.github.io/*', 'http://localhost/*'] },
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('chrome', {
    action: { onClicked: { addListener: vi.fn() } },
    cookies: { get: getCookie },
    permissions: {
      contains: containsPermissions,
      onRemoved: {
        addListener(callback: typeof permissionsRemoved) {
          permissionsRemoved = callback;
        },
      },
    },
    storage: {
      local: { get: getSettings, remove: vi.fn(async () => {}) },
      onChanged: {
        addListener(callback: typeof storageChanged) {
          storageChanged = callback;
        },
      },
    },
    runtime: {
      getManifest,
      openOptionsPage,
      onConnectExternal: {
        addListener(callback: typeof connectListener) {
          connectListener = callback;
        },
      },
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
  const checkConnection = () =>
    new Promise((resolve) => {
      expect(listener({ type: 'GET_DUOLINGO_ACCESS' }, { url: approvedOrigin }, resolve)).toBe(
        true,
      );
    });

  it('only reports the session on the DuoFollow page', () => {
    const reply = vi.fn();
    for (const sender of [
      { url: 'https://hedgerock.github.io/another-project/' },
      { url: approvedOrigin, frameId: 1 },
    ]) {
      for (const type of [
        'GET_DUOLINGO_ACCESS',
        'GET_FOLLOWING_SUMMARY',
        'OPEN_DUOLINGO_SETTINGS',
      ]) {
        expect(listener({ type }, sender, reply)).toBeUndefined();
      }
    }
    expect(reply).not.toHaveBeenCalled();
    expect(getCookie).not.toHaveBeenCalled();
  });

  it('does not touch Duolingo when consent is missing or browser access is denied', async () => {
    getSettings.mockResolvedValueOnce({});
    await expect(checkConnection()).resolves.toEqual({ session: 'consent-required' });
    containsPermissions.mockResolvedValue(false);
    await expect(checkConnection()).resolves.toEqual({ session: 'consent-required' });
    await expect(compare(account.username)).resolves.toMatchObject({
      success: false,
      errorCode: 'ACCESS_REQUIRED',
    });
    await expect(unfollow()).resolves.toMatchObject({
      success: false,
      errorCode: 'ACCESS_REQUIRED',
    });
    expect(getCookie).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens extension settings without accessing Duolingo', async () => {
    const opened = new Promise((resolve) => {
      expect(listener({ type: 'OPEN_DUOLINGO_SETTINGS' }, { url: approvedOrigin }, resolve)).toBe(
        true,
      );
    });
    await expect(opened).resolves.toEqual({ success: true });
    expect(openOptionsPage).toHaveBeenCalledOnce();
    expect(getCookie).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows the access route to open settings and keeps data commands on the workspace', async () => {
    const sender = { url: 'http://localhost:5173/duofollow/access/' };
    const reply = vi.fn();
    for (const type of ['GET_DUOLINGO_ACCESS', 'GET_FOLLOWING_SUMMARY', 'UNFOLLOW']) {
      expect(listener({ type }, sender, reply)).toBeUndefined();
    }
    expect(reply).not.toHaveBeenCalled();
    await expect(
      new Promise((resolve) => listener({ type: 'OPEN_DUOLINGO_SETTINGS' }, sender, resolve)),
    ).resolves.toEqual({ success: true });
    expect(
      listener({ type: 'OPEN_DUOLINGO_SETTINGS' }, { ...sender, frameId: 1 }, reply),
    ).toBeUndefined();
    expect(
      listener(
        { type: 'OPEN_DUOLINGO_SETTINGS' },
        { url: 'http://localhost:5173/duofollow/privacy/' },
        reply,
      ),
    ).toBeUndefined();
    expect(reply).not.toHaveBeenCalled();
    expect(openOptionsPage).toHaveBeenCalledOnce();
    expect(getCookie).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects localhost in a store build', async () => {
    vi.resetModules();
    getManifest.mockReturnValue({
      externally_connectable: { matches: ['https://hedgerock.github.io/*'] },
    });
    await import('../../extension/src/background');
    const reply = vi.fn();
    listener({ type: 'PING' }, { url: approvedOrigin }, reply);
    expect(reply).not.toHaveBeenCalled();
    listener({ type: 'PING' }, { url: 'https://hedgerock.github.io/duofollow/' }, reply);
    expect(reply).toHaveBeenCalledOnce();
  });

  it('notifies an open workspace when the extension settings save consent', () => {
    const port = {
      name: 'duofollow-access',
      sender: { url: approvedOrigin },
      onDisconnect: { addListener: vi.fn() },
      disconnect: vi.fn(),
      postMessage: vi.fn(),
    };
    connectListener(port as unknown as chrome.runtime.Port);
    storageChanged({ [ACCESS_CONSENT_KEY]: { newValue: 1 } }, 'local');
    storageChanged({ [ACCESS_CONSENT_KEY]: { oldValue: 1, newValue: 1 } }, 'local');
    expect(port.postMessage).toHaveBeenCalledExactlyOnceWith({ access: 'granted' });
    expect(getCookie).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts an in-flight comparison and notifies the website when Chrome revokes access', async () => {
    const port = {
      name: 'duofollow-access',
      sender: { url: approvedOrigin },
      onDisconnect: { addListener: vi.fn() },
      disconnect: vi.fn(),
      postMessage: vi.fn(),
    };
    connectListener(port as unknown as chrome.runtime.Port);
    let requestSignal: AbortSignal | null | undefined;
    let complete!: (response: Response) => void;
    fetchMock.mockImplementationOnce((_url, options) => {
      requestSignal = options?.signal;
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    const pending = compare(account.username);
    await vi.waitFor(() => expect(requestSignal).toBeDefined());
    containsPermissions.mockResolvedValue(false);
    permissionsRemoved({ origins: ['https://www.duolingo.com/*'] });
    expect(requestSignal?.aborted).toBe(true);
    expect(port.postMessage).toHaveBeenCalledWith({ access: 'revoked' });
    complete(resolveAccount());
    await expect(pending).resolves.toMatchObject({ success: false });
    await expect(checkConnection()).resolves.toEqual({ session: 'consent-required' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('aborts a connection check when consent is removed in extension settings', async () => {
    let complete!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = checkConnection();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    getSettings.mockResolvedValue({});
    storageChanged({ [ACCESS_CONSENT_KEY]: { oldValue: 1 } }, 'local');
    complete(followers([]));
    await expect(pending).resolves.toEqual({ session: 'consent-required' });
  });

  it('treats a missing or expired session cookie as signed out', async () => {
    getCookie.mockResolvedValueOnce(null).mockResolvedValueOnce({
      value: `fixture.${btoa(JSON.stringify({ sub: '101', exp: 0 }))}.signature`,
    });
    await expect(checkConnection()).resolves.toEqual({ session: 'signed-out' });
    await expect(checkConnection()).resolves.toEqual({ session: 'signed-out' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['RATE_LIMITED', () => Promise.resolve(new Response(null, { status: 429 }))],
    ['TIMEOUT', () => Promise.reject(new DOMException('Timed out', 'TimeoutError'))],
    ['INVALID_RESPONSE', () => Promise.resolve(Response.json({ followers: null }))],
  ])(
    'preserves %s on unavailable session checks for newer clients',
    async (errorCode, response) => {
      fetchMock.mockImplementationOnce(response);
      await expect(checkConnection()).resolves.toEqual({
        session: 'duolingo-unavailable',
        errorCode,
      });
    },
  );

  it('checks authenticated access using one follower and reports status without session data', async () => {
    getCookie.mockResolvedValue({
      value: `fixture.${btoa(JSON.stringify({ sub: '101', exp: 4_000_000_000 }))}.signature`,
    });
    fetchMock
      .mockResolvedValueOnce(followers([]))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new TypeError('Network error'));

    await expect(checkConnection()).resolves.toEqual({ session: 'ready' });
    await expect(checkConnection()).resolves.toEqual({ session: 'signed-out' });
    await expect(checkConnection()).resolves.toEqual({ session: 'duolingo-unavailable' });
    await expect(checkConnection()).resolves.toEqual({ session: 'duolingo-unavailable' });

    expect(getCookie).toHaveBeenCalledWith({ url: 'https://www.duolingo.com', name: 'jwt_token' });
    const [request, init] = fetchMock.mock.calls[0];
    const url = new URL(String(request));
    expect(url.pathname).toBe(duolingoEndpoints.followers.url('101').pathname);
    expect(url.searchParams.get('pageSize')).toBe('1');
    expect(url.searchParams.get('viewerId')).toBe('101');
    expect(init).toMatchObject({ credentials: 'include', cache: 'no-store', redirect: 'error' });
    expect(init?.headers).toBeUndefined();
  });

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

  it('rejects removed diagnostics and the legacy connection command without any data access', () => {
    const reply = vi.fn();
    for (const type of ['CHECK_CONNECTION', 'PROBE_DUOLINGO', 'PROBE_FOLLOWING']) {
      listener({ type }, { url: approvedOrigin }, reply);
      expect(reply).toHaveBeenLastCalledWith({ success: false, error: 'Unsupported message' });
    }
    expect(getCookie).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
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
        following: [
          { userId: 1, relationship: 'mutual' },
          { userId: 2, relationship: 'non-mutual' },
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
        comparison: {
          mutualUsers: 1,
          nonMutualUsers: null,
          nonMutualFollowing: null,
          following: [
            { userId: 1, relationship: 'mutual' },
            { userId: 2, relationship: 'unknown' },
          ],
        },
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

  it.each([
    [401, 'SIGNED_OUT'],
    [403, 'ACCESS_DENIED'],
    [429, 'RATE_LIMITED'],
  ])('maps HTTP %i from Duolingo to %s', async (status, errorCode) => {
    fetchMock
      .mockResolvedValueOnce(resolveAccount())
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(followers([]));
    await expect(compare('Learner')).resolves.toMatchObject({
      success: false,
      errorCode,
      error: expect.stringContaining(`HTTP ${status}`),
    });
  });

  it('returns TIMEOUT when the comparison request expires', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'));
    await expect(compare('Learner')).resolves.toMatchObject({
      success: false,
      errorCode: 'TIMEOUT',
    });
  });

  it('distinguishes malformed JSON, an invalid page and a failed fetch', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{'));
    await expect(compare('Learner')).resolves.toMatchObject({
      success: false,
      errorCode: 'INVALID_RESPONSE',
      error: expect.stringContaining('JSON'),
    });
    fetchMock
      .mockResolvedValueOnce(resolveAccount())
      .mockResolvedValueOnce(following([{ userId: 'bad-id' }]))
      .mockResolvedValueOnce(followers([]));
    await expect(compare('Learner')).resolves.toEqual({
      success: false,
      errorCode: 'INVALID_RESPONSE',
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

  it('rejects comparisons and deletions for a different account before reading its lists', async () => {
    getCookie.mockResolvedValue(sessionCookie(999));
    fetchMock.mockImplementation(async () => resolveAccount());
    await expect(compare(account.username)).resolves.toMatchObject({ success: false });
    await expect(unfollow()).resolves.toMatchObject({ success: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(
        ([url]) => new URL(String(url)).pathname === duolingoEndpoints.accountLookup.url().pathname,
      ),
    ).toBe(true);
  });

  it('does not delete a subscription if the session changes during the initial lookup', async () => {
    getCookie
      .mockResolvedValueOnce(sessionCookie(account.id))
      .mockResolvedValueOnce(sessionCookie(999));
    fetchMock
      .mockResolvedValueOnce(resolveAccount())
      .mockResolvedValueOnce(following([{ userId: 202 }]));
    await expect(unfollow()).resolves.toMatchObject({ success: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([url]) => String(url) === targetUnfollowUrl)).toBe(false);
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
      expect(reply).not.toHaveBeenCalled();
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
    ['a timeout', () => Promise.reject(new DOMException('Timed out', 'TimeoutError'))],
    ['HTTP 503', () => Promise.resolve(new Response(null, { status: 503 }))],
  ])('keeps deletion unconfirmed after %s', async (_name, outcome) => {
    fetchMock
      .mockResolvedValueOnce(resolveAccount())
      .mockResolvedValueOnce(following([{ userId: 202 }]))
      .mockImplementationOnce(outcome);
    await expect(unfollow()).resolves.toMatchObject({
      success: false,
      errorCode: 'UNFOLLOW_UNCONFIRMED',
    });
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
