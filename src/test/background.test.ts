import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCESS_CONSENT_KEY } from '@duofollow/extension/src/duolingoAccess';
import { duolingoEndpoints } from '@duofollow/extension/src/duolingoEndpoints';

import type {
  FollowingComparisonResult,
  UnfollowResult,
} from '@duofollow/extension/src/dto/DuolingoFollowingDto';
import type {
  UnfollowRequestResult,
  UnfollowStatusResult,
} from '@duofollow/extension/src/dto/UnfollowConfirmation';

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
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
const following = (users: unknown[], totalUsers = users.length, cursor: string | null = 'v1:500') =>
  Response.json({ following: { cursor, totalUsers, users } });
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

const extensionId = 'test-extension';
const confirmationUrl = `chrome-extension://${extensionId}/unfollow-confirmation.html`;
const documentSender = { url: approvedOrigin, frameId: 0, documentId: 'site-document' };
const extensionSender = { id: extensionId, url: confirmationUrl, frameId: 0 };

function requestUnfollow(
  targetUserId: unknown = 202,
  quick = false,
): Promise<UnfollowRequestResult> {
  return new Promise((resolve) => {
    expect(
      listener(
        {
          type: quick ? 'REQUEST_QUICK_UNFOLLOW' : 'REQUEST_UNFOLLOW',
          username: account.username,
          targetUserId,
        },
        documentSender,
        (result) => resolve(result as UnfollowRequestResult),
      ),
    ).toBe(true);
  });
}

async function openConfirmation(quick = false) {
  const result = await requestUnfollow(202, quick);
  if (!result.success) throw new Error(result.error);
  return result.requestId;
}

const confirm = (requestId: string): Promise<UnfollowResult> =>
  new Promise((resolve) => {
    expect(
      internalListener({ type: 'CONFIRM_UNFOLLOW', requestId }, extensionSender, (result) =>
        resolve(result as UnfollowResult),
      ),
    ).toBe(true);
  });

const confirmQuick = (requestId: string, sender = documentSender): Promise<UnfollowResult> =>
  new Promise((resolve) => {
    expect(
      listener({ type: 'CONFIRM_QUICK_UNFOLLOW', requestId }, sender, (result) =>
        resolve(result as UnfollowResult),
      ),
    ).toBe(true);
  });

const unfollow = async () => {
  const request = await requestUnfollow();
  return request.success ? confirm(request.requestId) : request;
};

const status = (requestId: string, sender = documentSender): Promise<UnfollowStatusResult> =>
  new Promise((resolve) =>
    listener({ type: 'GET_UNFOLLOW_STATUS', requestId }, sender, (result) =>
      resolve(result as UnfollowStatusResult),
    ),
  );

const writeCalls = () => fetchMock.mock.calls.filter(([, options]) => options?.method === 'DELETE');

let listener: Listener;
let internalListener: Listener;
let windowClosed: (id: number) => void;
const createWindow = vi.fn(async (_options: chrome.windows.CreateData) => ({ id: 42 }));
const fetchMock = vi.fn<typeof fetch>();
const getCookie =
  vi.fn<(details: { url: string; name: string }) => Promise<{ value: string } | null>>();
const sessionCookie = (id: number) => ({
  value: `fixture.${btoa(JSON.stringify({ sub: id, exp: 4_000_000_000 }))}.signature`,
});
let sessionStorage: Record<string, unknown>;
const getSettings = vi.fn<() => Promise<Record<string, unknown>>>();
const containsPermissions = vi.fn<() => Promise<boolean>>();
const openOptionsPage = vi.fn<() => Promise<void>>();
const getManifest = vi.fn();
let permissionsRemoved: (permissions: chrome.permissions.Permissions) => void;
let storageChanged: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
let connectListener: (port: chrome.runtime.Port) => void;

beforeEach(async () => {
  vi.resetModules();
  sessionStorage = {};
  fetchMock.mockReset();
  getCookie.mockReset().mockResolvedValue(sessionCookie(account.id));
  getSettings.mockReset().mockResolvedValue({ [ACCESS_CONSENT_KEY]: 1 });
  containsPermissions.mockReset().mockResolvedValue(true);
  openOptionsPage.mockReset().mockResolvedValue(undefined);
  createWindow.mockClear();
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
      session: {
        get: async (key: string) => ({ [key]: sessionStorage[key] }),
        set: async (values: Record<string, unknown>) => Object.assign(sessionStorage, values),
        remove: async (key: string) => {
          delete sessionStorage[key];
        },
      },
      local: { get: getSettings, remove: vi.fn(async () => {}) },
      onChanged: {
        addListener(callback: typeof storageChanged) {
          storageChanged = callback;
        },
      },
    },
    windows: {
      create: createWindow,
      onRemoved: {
        addListener(callback: typeof windowClosed) {
          windowClosed = callback;
        },
      },
    },
    runtime: {
      id: extensionId,
      getURL: (path: string) => `chrome-extension://${extensionId}/${path}`,
      onMessage: {
        addListener(callback: Listener) {
          internalListener = callback;
        },
      },
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
  await import('@duofollow/extension/src/background');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('extension worker', () => {
  const checkConnection = (url = approvedOrigin) =>
    new Promise((resolve) => {
      expect(listener({ type: 'GET_DUOLINGO_ACCESS' }, { url }, resolve)).toBe(true);
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
    await import('@duofollow/extension/src/background');
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

  it('pushes quick unfollow changes and discards an outdated initial snapshot', async () => {
    const port = {
      name: 'duofollow-access',
      sender: { url: approvedOrigin },
      onDisconnect: { addListener: vi.fn() },
      disconnect: vi.fn(),
      postMessage: vi.fn(),
    };
    let finishRead!: (settings: Record<string, unknown>) => void;
    getSettings.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    );
    connectListener(port as unknown as chrome.runtime.Port);

    storageChanged({ quickUnfollowConsent: { oldValue: 2 } }, 'local');
    finishRead({ quickUnfollowConsent: 2 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(port.postMessage.mock.calls).toEqual([[{ quickUnfollow: false }]]);
    storageChanged({ quickUnfollowConsent: { newValue: 2 } }, 'local');
    expect(port.postMessage).toHaveBeenLastCalledWith({ quickUnfollow: true });
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

  it('shares one verification between pages and caches readiness for 60 seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    let complete!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const first = checkConnection();
    const second = checkConnection('https://hedgerock.github.io/duofollow/');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    complete(followers([]));
    await expect(Promise.all([first, second])).resolves.toEqual([
      { session: 'ready' },
      { session: 'ready' },
    ]);
    vi.setSystemTime(Date.now() + 59_999);
    await expect(checkConnection()).resolves.toEqual({ session: 'ready' });
    expect(fetchMock).toHaveBeenCalledOnce();

    fetchMock.mockResolvedValueOnce(followers([]));
    vi.setSystemTime(Date.now() + 1);
    await expect(checkConnection()).resolves.toEqual({ session: 'ready' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not reuse a verified result after sign-out, account switch or regrant', async () => {
    fetchMock.mockImplementation(async () => followers([]));
    await expect(checkConnection()).resolves.toEqual({ session: 'ready' });
    getCookie.mockResolvedValue(null);
    await expect(checkConnection()).resolves.toEqual({ session: 'signed-out' });
    getCookie.mockResolvedValue(sessionCookie(999));
    await expect(checkConnection()).resolves.toEqual({ session: 'ready' });
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('viewerId')).toBe('999');

    getSettings.mockResolvedValue({});
    storageChanged({ [ACCESS_CONSENT_KEY]: { oldValue: 1 } }, 'local');
    await expect(checkConnection()).resolves.toEqual({ session: 'consent-required' });
    getSettings.mockResolvedValue({ [ACCESS_CONSENT_KEY]: 1 });
    storageChanged({ [ACCESS_CONSENT_KEY]: { newValue: 1 } }, 'local');
    await expect(checkConnection()).resolves.toEqual({ session: 'ready' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('discards a late successful response from a previous account', async () => {
    let complete!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const first = checkConnection();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    getCookie.mockResolvedValue(sessionCookie(999));
    fetchMock.mockResolvedValueOnce(followers([]));
    await expect(checkConnection()).resolves.toEqual({ session: 'ready' });
    complete(followers([]));
    await expect(first).resolves.toEqual({ session: 'signed-out' });
    await expect(checkConnection()).resolves.toEqual({ session: 'ready' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['120', 120_000],
    ['Mon, 16 Nov 2026 12:03:00 GMT', 180_000],
    ['invalid', 60_000],
    [null, 60_000],
  ])('shares the HTTP 429 cooldown from a Retry-After value of %s', async (header, delay) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    const limited = { session: 'duolingo-unavailable', errorCode: 'RATE_LIMITED' };
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 429,
        headers: header === null ? undefined : { 'Retry-After': header },
      }),
    );
    await expect(checkConnection()).resolves.toEqual(limited);
    vi.setSystemTime(Date.now() + delay - 1);
    await expect(checkConnection('https://hedgerock.github.io/duofollow/')).resolves.toEqual(
      limited,
    );

    vi.resetModules();
    await import('@duofollow/extension/src/background');
    await expect(checkConnection()).resolves.toEqual(limited);
    expect(fetchMock).toHaveBeenCalledOnce();

    vi.setSystemTime(Date.now() + 1);
    fetchMock.mockResolvedValueOnce(followers([]));
    await expect(checkConnection()).resolves.toEqual({ session: 'ready' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses a rate limit from comparison to postpone the next session check', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429 }));
    await expect(compare(account.username)).resolves.toMatchObject({ errorCode: 'RATE_LIMITED' });
    await expect(checkConnection()).resolves.toEqual({
      session: 'duolingo-unavailable',
      errorCode: 'RATE_LIMITED',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('keeps the longer pause from parallel Duolingo responses', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    fetchMock
      .mockResolvedValueOnce(resolveAccount())
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '120' } }))
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '5' } }));
    await expect(compare(account.username)).resolves.toMatchObject({ errorCode: 'RATE_LIMITED' });
    vi.setSystemTime(Date.now() + 6_000);
    await expect(checkConnection()).resolves.toMatchObject({ errorCode: 'RATE_LIMITED' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rechecks the session after a cooldown even if readiness was cached before it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    fetchMock
      .mockResolvedValueOnce(followers([]))
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '5' } }))
      .mockResolvedValueOnce(followers([]));

    await expect(checkConnection()).resolves.toEqual({ session: 'ready' });
    await expect(compare(account.username)).resolves.toMatchObject({ errorCode: 'RATE_LIMITED' });
    vi.setSystemTime(Date.now() + 5_000);
    await expect(checkConnection()).resolves.toEqual({ session: 'ready' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('checks authenticated access using one follower and reports status without session data', async () => {
    getCookie.mockResolvedValue({
      value: `fixture.${btoa(JSON.stringify({ sub: '101', exp: 4_000_000_000 }))}.signature`,
    });
    fetchMock
      .mockResolvedValueOnce(followers([]))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new TypeError('Network error'));

    vi.useFakeTimers({ toFake: ['Date'] });
    await expect(checkConnection()).resolves.toEqual({ session: 'ready' });
    vi.setSystemTime(Date.now() + 60_000);
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

  it('reports first-page coverage for the observed Following and Followers sizes', async () => {
    const profiles = (start: number, size: number) =>
      Array.from({ length: size }, (_, index) => ({ userId: start + index }));
    fetchMock
      .mockResolvedValueOnce(resolveAccount())
      .mockResolvedValueOnce(following(profiles(1, 376), 695))
      .mockResolvedValueOnce(followers(profiles(1, 130)));

    await expect(compare('Learner')).resolves.toMatchObject({
      success: true,
      firstPage: { cursor: 'v1:500' },
      secondPage: null,
      comparison: {
        checkedFollowing: 376,
        totalFollowing: 695,
        checkedFollowers: 130,
        totalFollowers: 130,
        coverage: { following: 'cursor-present', followers: 'complete' },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      fetchMock.mock.calls
        .slice(1)
        .every(([url]) => !new URL(String(url)).searchParams.has('cursor')),
    ).toBe(true);
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
          { userId: 5, picture: 'https://example.com/avatar.png' },
          { userId: 6, picture: 'https://simg-ssl.duolingo.com:444/avatar.png' },
          { userId: 7, picture: 'https://simg-ssl.duolingo.com.example.com/avatar.png' },
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
          { userId: 5, picture: null },
          { userId: 6, picture: null },
          { userId: 7, picture: null },
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
    { total: 1, cursor: 'v1:500', status: 'cursor-present' },
    { total: 2, cursor: null, status: 'total-mismatch' },
    { total: 1, cursor: undefined, status: 'cursor-missing' },
    { total: 1, cursor: '', status: 'cursor-missing' },
  ])(
    'reports unknown nonmutual accounts for incomplete followers (%j)',
    async ({ total, cursor, status }) => {
      fetchMock
        .mockResolvedValueOnce(resolveAccount())
        .mockResolvedValueOnce(following([{ userId: 1 }, { userId: 2 }]))
        .mockResolvedValueOnce(
          Response.json({ followers: { users: [{ userId: 1 }], totalUsers: total, cursor } }),
        );
      await expect(compare('Learner')).resolves.toMatchObject({
        success: true,
        comparison: {
          coverage: { following: 'cursor-present', followers: status },
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

  it.each([
    { scenario: 'no followers', profiles: [] },
    { scenario: 'one follower', profiles: [{ userId: 2 }] },
  ])('reports zero follows with $scenario', async ({ profiles }) => {
    fetchMock
      .mockResolvedValueOnce(resolveAccount())
      .mockResolvedValueOnce(following([]))
      .mockResolvedValueOnce(followers(profiles));

    await expect(compare('Learner')).resolves.toMatchObject({
      success: true,
      comparison: {
        checkedFollowing: 0,
        checkedFollowers: profiles.length,
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

  const target = { userId: 202, username: 'Target' };
  const prepare = () =>
    fetchMock.mockResolvedValueOnce(resolveAccount()).mockResolvedValueOnce(following([target]));

  it('only deletes after the extension window confirms the bound account and target', async () => {
    prepare()
      .mockResolvedValueOnce(following([target]))
      .mockResolvedValueOnce(Response.json({ successful: true }));
    const requestId = await openConfirmation();
    expect(createWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `${confirmationUrl}#${requestId}`,
      }),
    );
    const preview = vi.fn();
    internalListener({ type: 'READ_UNFOLLOW_PREVIEW', requestId }, extensionSender, preview);
    expect(preview).toHaveBeenCalledWith({
      success: true,
      preview: { username: 'Learner', targetUserId: 202, targetLabel: '@Target' },
    });
    await expect(status(requestId)).resolves.toEqual({ success: true, pending: true });
    expect(writeCalls()).toHaveLength(0);

    await expect(confirm(requestId)).resolves.toEqual({ success: true, targetUserId: 202 });
    expect(writeCalls()).toHaveLength(1);
    expect(fetchMock).toHaveBeenLastCalledWith(
      targetUnfollowUrl,
      expect.objectContaining({
        method: 'DELETE',
        credentials: 'include',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
    await expect(status(requestId)).resolves.toEqual({ success: true, targetUserId: 202 });
    await expect(confirm(requestId)).resolves.toMatchObject({ errorCode: 'UNFOLLOW_CANCELLED' });
    expect(writeCalls()).toHaveLength(1);
  });

  it('keeps quick unfollow opt-in and limits the preference to the main document', async () => {
    const message = { type: 'GET_QUICK_UNFOLLOW' };
    const request = () => new Promise((resolve) => listener(message, documentSender, resolve));
    await expect(request()).resolves.toEqual({
      success: true,
      enabled: false,
      confirmation: 'website',
    });
    getSettings.mockResolvedValueOnce({ quickUnfollowConsent: true });
    await expect(request()).resolves.toEqual({
      success: true,
      enabled: false,
      confirmation: 'website',
    });
    getSettings.mockResolvedValueOnce({ quickUnfollowConsent: 1 });
    await expect(request()).resolves.toEqual({
      success: true,
      enabled: false,
      confirmation: 'website',
    });
    getSettings.mockResolvedValueOnce({ quickUnfollowConsent: 2 });
    await expect(request()).resolves.toEqual({
      success: true,
      enabled: true,
      confirmation: 'website',
    });
    const reply = vi.fn();
    listener(message, { ...documentSender, frameId: 1 }, reply);
    listener(
      message,
      { ...documentSender, url: 'https://hedgerock.github.io/another-project/' },
      reply,
    );
    expect(reply).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getCookie).not.toHaveBeenCalled();
  });

  it('blocks old quick consent before reading a profile or creating a window', async () => {
    getSettings.mockResolvedValue({ [ACCESS_CONSENT_KEY]: 1, quickUnfollowConsent: 1 });
    await expect(requestUnfollow(202, true)).resolves.toMatchObject({
      errorCode: 'QUICK_UNFOLLOW_DISABLED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createWindow).not.toHaveBeenCalled();
  });

  it('accepts one opt-in approval from the original document without a popup', async () => {
    getSettings.mockResolvedValue({ [ACCESS_CONSENT_KEY]: 1, quickUnfollowConsent: 2 });
    prepare()
      .mockResolvedValueOnce(following([target]))
      .mockResolvedValueOnce(Response.json({ successful: true }));
    const requestId = await openConfirmation(true);
    expect(createWindow).not.toHaveBeenCalled();
    expect(writeCalls()).toHaveLength(0);
    await expect(
      confirmQuick(requestId, { ...documentSender, documentId: 'another' }),
    ).resolves.toMatchObject({ errorCode: 'UNFOLLOW_CANCELLED' });
    await expect(confirm(requestId)).resolves.toMatchObject({ errorCode: 'UNFOLLOW_CANCELLED' });
    expect(writeCalls()).toHaveLength(0);
    await expect(confirmQuick(requestId)).resolves.toEqual({ success: true, targetUserId: 202 });
    await expect(confirmQuick(requestId)).resolves.toMatchObject({
      errorCode: 'UNFOLLOW_CANCELLED',
    });
    expect(writeCalls()).toHaveLength(1);
    expect(createWindow).not.toHaveBeenCalled();
  });

  it('invalidates a pending opt-in receipt after the option is switched off', async () => {
    getSettings.mockResolvedValue({ [ACCESS_CONSENT_KEY]: 1, quickUnfollowConsent: 2 });
    prepare();
    const requestId = await openConfirmation(true);
    storageChanged({ quickUnfollowConsent: { oldValue: 2 } }, 'local');
    await expect(confirmQuick(requestId)).resolves.toMatchObject({
      errorCode: 'QUICK_UNFOLLOW_DISABLED',
    });
    expect(writeCalls()).toHaveLength(0);
  });

  it('rechecks quick consent immediately before the write', async () => {
    getSettings.mockResolvedValue({ [ACCESS_CONSENT_KEY]: 1, quickUnfollowConsent: 2 });
    prepare();
    const requestId = await openConfirmation(true);
    fetchMock.mockImplementationOnce(async () => {
      getSettings.mockResolvedValue({ [ACCESS_CONSENT_KEY]: 1 });
      return following([target]);
    });
    await expect(confirmQuick(requestId)).resolves.toMatchObject({
      errorCode: 'QUICK_UNFOLLOW_DISABLED',
    });
    expect(writeCalls()).toHaveLength(0);
  });

  it('accepts the receipt only from the initiating document and approval only in the popup', async () => {
    getSettings.mockResolvedValue({ [ACCESS_CONSENT_KEY]: 1, quickUnfollowConsent: 2 });
    prepare();
    const requestId = await openConfirmation();
    const reply = vi.fn();
    await expect(confirmQuick(requestId)).resolves.toMatchObject({
      errorCode: 'UNFOLLOW_CANCELLED',
    });
    const approval = { type: 'CONFIRM_UNFOLLOW', requestId };
    listener(approval, documentSender, reply);
    expect(reply).toHaveBeenLastCalledWith({ success: false, error: 'Unsupported message' });
    listener(
      { type: 'UNFOLLOW', username: account.username, targetUserId: 202 },
      documentSender,
      reply,
    );
    expect(reply).toHaveBeenLastCalledWith({ success: false, error: 'Unsupported message' });
    reply.mockClear();
    for (const sender of [
      { ...extensionSender, id: 'other-extension' },
      { ...extensionSender, url: 'chrome-extension://test-extension/access.html' },
      { ...extensionSender, frameId: 1 },
    ]) {
      internalListener(approval, sender, reply);
    }
    expect(reply).not.toHaveBeenCalled();
    await expect(
      status(requestId, { ...documentSender, documentId: 'other' }),
    ).resolves.toMatchObject({ errorCode: 'UNFOLLOW_UNCONFIRMED' });
    expect(writeCalls()).toHaveLength(0);
  });

  it.each(['cancel', 'window closes', 'expiry', 'worker restarts'])(
    'prevents a delete after %s while the confirmation is pending',
    async (event) => {
      prepare();
      const requestId = await openConfirmation();
      if (event === 'cancel')
        internalListener({ type: 'CANCEL_UNFOLLOW', requestId }, extensionSender, vi.fn());
      if (event === 'window closes') windowClosed(42);
      if (event === 'expiry') vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 91_000);
      if (event === 'worker restarts') {
        vi.resetModules();
        await import('@duofollow/extension/src/background');
      }
      await expect(confirm(requestId)).resolves.toMatchObject({ errorCode: 'UNFOLLOW_CANCELLED' });
      expect(writeCalls()).toHaveLength(0);
      vi.restoreAllMocks();
    },
  );

  it.each([
    'different account',
    'new session for the same account',
    'revoked consent',
    'revoked host permission',
  ])('blocks deletion after %s', async (event) => {
    prepare().mockResolvedValueOnce(following([target]));
    const requestId = await openConfirmation();
    if (event === 'different account') getCookie.mockResolvedValue(sessionCookie(999));
    if (event === 'new session for the same account')
      getCookie.mockResolvedValue({ value: sessionCookie(account.id).value + '-changed' });
    if (event === 'revoked consent')
      storageChanged({ [ACCESS_CONSENT_KEY]: { oldValue: 1 } }, 'local');
    if (event === 'revoked host permission') containsPermissions.mockResolvedValue(false);
    await expect(confirm(requestId)).resolves.toMatchObject({ success: false });
    expect(writeCalls()).toHaveLength(0);
  });

  it('revalidates access again after reading following and before dispatch', async () => {
    prepare();
    const requestId = await openConfirmation();
    fetchMock.mockImplementationOnce(async () => {
      containsPermissions.mockResolvedValue(false);
      return following([target]);
    });
    await expect(confirm(requestId)).resolves.toMatchObject({ errorCode: 'ACCESS_REQUIRED' });
    expect(writeCalls()).toHaveLength(0);
  });

  it('rejects invalid external contexts, invalid targets and other accounts', async () => {
    const message = { type: 'REQUEST_UNFOLLOW', username: account.username, targetUserId: 202 };
    const reply = vi.fn();
    for (const sender of [
      { ...documentSender, url: 'https://example.com/duofollow/' },
      { ...documentSender, url: 'https://hedgerock.github.io/another-project/' },
      { ...documentSender, frameId: 1 },
    ])
      listener(message, sender, reply);
    expect(reply).not.toHaveBeenCalled();
    for (const id of [null, '202', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
      await expect(requestUnfollow(id)).resolves.toMatchObject({ success: false });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(resolveAccount());
    await expect(requestUnfollow(account.id)).resolves.toMatchObject({ success: false });
    getCookie.mockResolvedValue(sessionCookie(999));
    fetchMock.mockResolvedValueOnce(resolveAccount());
    await expect(requestUnfollow()).resolves.toMatchObject({ errorCode: 'ACCOUNT_MISMATCH' });
    expect(createWindow).not.toHaveBeenCalled();
    expect(writeCalls()).toHaveLength(0);
  });

  it.each([
    { cursor: null, total: 0, code: 'NOT_FOLLOWING' },
    { cursor: null, total: 1, code: 'NOT_FOUND_IN_PARTIAL_RESULT' },
    { cursor: 'v1:500', total: 1, code: 'NOT_FOUND_IN_PARTIAL_RESULT' },
  ])(
    'reports $code before opening the popup and before writing',
    async ({ cursor, total, code }) => {
      fetchMock
        .mockResolvedValueOnce(resolveAccount())
        .mockResolvedValueOnce(following([], total, cursor));
      await expect(requestUnfollow()).resolves.toMatchObject({ errorCode: code });
      expect(createWindow).not.toHaveBeenCalled();

      prepare().mockResolvedValueOnce(following([], total, cursor));
      await expect(unfollow()).resolves.toMatchObject({ errorCode: code });
      expect(writeCalls()).toHaveLength(0);
    },
  );

  it.each([401, 403, 429])(
    'keeps definitive HTTP %i separate from an unknown outcome',
    async (code) => {
      prepare()
        .mockResolvedValueOnce(following([target]))
        .mockResolvedValueOnce(new Response(null, { status: code }));
      await expect(unfollow()).resolves.toMatchObject({
        success: false,
        error: expect.stringContaining(`HTTP ${code}`),
      });
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(writeCalls()).toHaveLength(1);
    },
  );

  it.each([
    ['explicit refusal', () => Promise.resolve(Response.json({ successful: false }))],
    ['non-boolean success', () => Promise.resolve(Response.json({ successful: 'true' }))],
    ['invalid JSON', () => Promise.resolve(new Response('{'))],
    ['network failure', () => Promise.reject(new Error('Connection closed'))],
    ['timeout', () => Promise.reject(new DOMException('Timed out', 'TimeoutError'))],
    ['HTTP 503', () => Promise.resolve(new Response(null, { status: 503 }))],
  ])(
    'only reads after %s and retains an unknown outcome on a partial list',
    async (_name, respond) => {
      prepare()
        .mockResolvedValueOnce(following([target]))
        .mockImplementationOnce(respond)
        .mockResolvedValueOnce(following([], 9));
      await expect(unfollow()).resolves.toMatchObject({ errorCode: 'UNFOLLOW_UNCONFIRMED' });
      expect(fetchMock).toHaveBeenCalledTimes(5);
      expect(writeCalls()).toHaveLength(1);
    },
  );

  it.each([
    { list: () => following([], 0, null), result: { success: true, targetUserId: 202 } },
    { list: () => following([target]), result: { success: false, errorCode: 'STILL_FOLLOWING' } },
  ])('returns the observed state after an uncertain write', async ({ list, result }) => {
    prepare()
      .mockResolvedValueOnce(following([target]))
      .mockRejectedValueOnce(new Error('Connection closed'))
      .mockResolvedValueOnce(list());
    await expect(unfollow()).resolves.toMatchObject(result);
    expect(writeCalls()).toHaveLength(1);
  });

  it('does not recheck an uncertain write in a different session', async () => {
    prepare()
      .mockResolvedValueOnce(following([target]))
      .mockImplementationOnce(async () => {
        getCookie.mockResolvedValue(sessionCookie(999));
        throw new Error('Connection closed');
      });
    await expect(unfollow()).resolves.toMatchObject({ errorCode: 'UNFOLLOW_UNCONFIRMED' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(writeCalls()).toHaveLength(1);
  });

  it('claims a confirmation once and recovers the same receipt after worker restart', async () => {
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    let finishDelete!: (response: Response) => void;
    prepare()
      .mockResolvedValueOnce(following([target]))
      .mockImplementationOnce(() => {
        requestStarted();
        return new Promise((resolve) => {
          finishDelete = resolve;
        });
      });

    const requestId = await openConfirmation();
    const pending = confirm(requestId);
    await started;
    await expect(confirm(requestId)).resolves.toMatchObject({ errorCode: 'UNFOLLOW_CANCELLED' });
    await expect(requestUnfollow()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('уже выполняется'),
    });

    vi.resetModules();
    await import('@duofollow/extension/src/background');
    fetchMock.mockResolvedValueOnce(following([], 0, null));
    await expect(status(requestId)).resolves.toEqual({ success: true, targetUserId: 202 });
    await expect(status(requestId)).resolves.toEqual({ success: true, targetUserId: 202 });
    expect(writeCalls()).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    finishDelete(Response.json({ successful: true }));
    await pending;
  });
});
