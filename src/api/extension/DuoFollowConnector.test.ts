import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ConnectorError,
  getConnectorErrorDetails,
} from '@duofollow/extension/src/dto/ConnectorError';
import {
  isConnectorFailure,
  isConnectorSuccess,
} from '@duofollow/extension/src/dto/ConnectorResult';
import { DuoFollowConnector } from '@duofollow/src/api/extension/DuoFollowConnector';

import type { FollowingComparison } from '@duofollow/extension/src/dto/DuolingoFollowingDto';

const client = new DuoFollowConnector('test-extension');
const comparison: FollowingComparison = {
  accountUsername: 'Learner',
  checkedFollowing: 1,
  totalFollowing: 8,
  checkedFollowers: 0,
  totalFollowers: 2,
  mutualUsers: 0,
  nonMutualUsers: null,
  nonMutualFollowing: null,
};
const profile = { userId: 2, displayName: '', username: '', picture: null };

function stubRuntime(response?: unknown, lastError?: { message: string }) {
  const sendMessage = vi.fn(
    (_id: string, _message: unknown, callback: (value?: unknown) => void) => {
      callback(response);
    },
  );
  vi.stubGlobal('chrome', { runtime: { sendMessage, lastError } });
  return sendMessage;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Connector result checks', () => {
  it('requires a strict boolean success flag', () => {
    expect(isConnectorSuccess({ success: true })).toBe(true);
    for (const result of [
      null,
      undefined,
      true,
      [],
      {},
      { success: false },
      { success: 1 },
      { success: 'true' },
    ]) {
      expect(isConnectorSuccess(result)).toBe(false);
    }
  });

  it('recognizes a failure with an error message and an optional error code', () => {
    expect(isConnectorFailure({ success: false, error: 'Legacy error' })).toBe(true);
    expect(
      isConnectorFailure({ success: false, error: 'New error', errorCode: 'FUTURE_CODE' }),
    ).toBe(true);
    for (const result of [
      null,
      false,
      { success: 'false', error: 'Error' },
      { success: false },
      { success: false, error: 403 },
    ]) {
      expect(isConnectorFailure(result)).toBe(false);
    }
  });

  it('reads error details for notifications', () => {
    expect(getConnectorErrorDetails(new ConnectorError('ACCESS_REQUIRED', 'Grant access'))).toEqual(
      {
        error: 'Grant access',
        errorCode: 'ACCESS_REQUIRED',
      },
    );
    expect(getConnectorErrorDetails(new Error('Offline'))).toEqual({ error: 'Offline' });
    expect(getConnectorErrorDetails(null)).toEqual({ error: '' });
  });
});

describe('DuoFollowConnector', () => {
  it('rejects a truthy non-boolean reply in settings, comparison and unfollow', async () => {
    stubRuntime({
      success: 'true',
      comparison,
      targetUserId: 202,
    });

    await expect(client.openDuolingoSettings()).rejects.toThrow();
    await expect(client.getFollowingSummary('Learner')).rejects.toMatchObject({
      errorCode: 'INVALID_RESPONSE',
    });
    await expect(client.unfollow('Learner', 202)).rejects.toMatchObject({
      errorCode: 'INVALID_RESPONSE',
    });
  });

  it('sends the username and accepts a legacy partial comparison without the full list', async () => {
    const result = { success: true, comparison };
    const sendMessage = stubRuntime(result);
    await expect(client.getFollowingSummary('Learner')).resolves.toEqual(result);
    expect(sendMessage).toHaveBeenCalledWith(
      'test-extension',
      { type: 'GET_FOLLOWING_SUMMARY', username: 'Learner' },
      expect.any(Function),
    );
  });

  it('accepts a legacy reply containing a non-mutual profile with only an ID', async () => {
    const result = {
      success: true,
      comparison: {
        ...comparison,
        totalFollowers: 0,
        nonMutualUsers: 1,
        nonMutualFollowing: [profile],
      },
    };
    stubRuntime(result);
    await expect(client.getFollowingSummary('Learner')).resolves.toEqual(result);
  });

  it('accepts a current partial comparison with unconfirmed profiles', async () => {
    const result = {
      success: true,
      comparison: { ...comparison, following: [{ ...profile, relationship: 'unknown' }] },
    };
    stubRuntime(result);
    await expect(client.getFollowingSummary('Learner')).resolves.toEqual(result);
  });

  it.each([
    ['an object in following', { following: {} }],
    ['null in following', { following: null }],
    ['a missing array entry', { following: Array<unknown>(1) }],
    ['an unknown relationship', { following: [{ ...profile, relationship: 'invalid' }] }],
    ['a non-string username', { following: [{ ...profile, username: 2, relationship: 'mutual' }] }],
    ['a non-string display name', { nonMutualFollowing: [{ ...profile, displayName: null }] }],
    ['a missing non-mutual list', { nonMutualFollowing: undefined }],
    ['an object in the non-mutual list', { nonMutualFollowing: {} }],
    ['a null profile', { nonMutualFollowing: [null] }],
    ['an invalid profile ID', { nonMutualFollowing: [{ ...profile, userId: '2' }] }],
    ['an invalid avatar field', { nonMutualFollowing: [{ ...profile, picture: {} }] }],
    ['an invalid account avatar', { accountPicture: 2 }],
    ['an invalid counter', { checkedFollowing: '1' }],
    ['a missing counter', { checkedFollowers: undefined }],
    ['an invalid non-mutual counter', { nonMutualUsers: -1 }],
    ['a blank account name', { accountUsername: ' ' }],
    ['an invalid coverage value', { coverage: null }],
    ['a missing coverage status', { coverage: { following: 'complete' } }],
    ['an unknown coverage status', { coverage: { following: 'complete', followers: 'unknown' } }],
  ])('rejects %s in a successful reply', async (_description, fields) => {
    stubRuntime({ success: true, comparison: { ...comparison, ...fields } });
    await expect(client.getFollowingSummary('Learner')).rejects.toMatchObject({
      errorCode: 'INVALID_RESPONSE',
    });
  });

  it('passes a worker error through to the app', async () => {
    const result = { success: false, error: 'HTTP 403' };
    stubRuntime(result);
    await expect(client.getFollowingSummary('Learner')).resolves.toEqual(result);
  });

  it('checks connectivity with PING', async () => {
    const sendMessage = stubRuntime({ success: true });
    await expect(client.ping()).resolves.toEqual({ success: true });
    expect(sendMessage).toHaveBeenCalledWith(
      'test-extension',
      { type: 'PING' },
      expect.any(Function),
    );
  });

  it('distinguishes a signed-out session, an older connector and a closed channel', async () => {
    const sendMessage = stubRuntime({ session: 'signed-out' });
    await expect(client.getConnectionStatus()).resolves.toBe('signed-out');
    expect(sendMessage).toHaveBeenCalledWith(
      'test-extension',
      { type: 'GET_DUOLINGO_ACCESS' },
      expect.any(Function),
    );
    stubRuntime({ success: false, error: 'Unsupported message' });
    await expect(client.getConnectionStatus()).resolves.toBe('connector-outdated');
    stubRuntime(undefined, { message: 'Receiving end does not exist' });
    await expect(client.getConnectionStatus()).resolves.toBe('connector-unavailable');
  });

  it.each([
    ['RATE_LIMITED', 'rate-limited'],
    ['TIMEOUT', 'duolingo-timeout'],
    ['INVALID_RESPONSE', 'duolingo-response-invalid'],
    ['UNRECOGNIZED', 'duolingo-unavailable'],
  ])('maps a session code %s to the UI status %s', async (errorCode, status) => {
    stubRuntime({ session: 'duolingo-unavailable', errorCode });
    await expect(client.getConnectionStatus()).resolves.toBe(status);
  });

  it('reports missing consent and only opens access settings on request', async () => {
    stubRuntime({ session: 'consent-required' });
    await expect(client.getConnectionStatus()).resolves.toBe('consent-required');
    const sendMessage = stubRuntime({ success: true });
    await expect(client.openDuolingoSettings()).resolves.toBeUndefined();
    expect(sendMessage).toHaveBeenCalledWith(
      'test-extension',
      { type: 'OPEN_DUOLINGO_SETTINGS' },
      expect.any(Function),
    );
  });

  it('sends one target ID and requires the reply to confirm that same target', async () => {
    const result = { success: true, targetUserId: 202 };
    const install = (status: unknown) => {
      const sendMessage = vi.fn(
        (_id: string, message: { type: string }, reply: (response: unknown) => void) => {
          reply(
            message.type === 'REQUEST_UNFOLLOW' ? { success: true, requestId: 'receipt' } : status,
          );
        },
      );
      vi.stubGlobal('chrome', { runtime: { sendMessage } });
      return sendMessage;
    };
    const sendMessage = install(result);
    await expect(client.unfollow('Learner', 202)).resolves.toEqual(result);
    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      'test-extension',
      { type: 'REQUEST_UNFOLLOW', username: 'Learner', targetUserId: 202 },
      expect.any(Function),
    );
    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      'test-extension',
      { type: 'GET_UNFOLLOW_STATUS', requestId: 'receipt' },
      expect.any(Function),
    );
    for (const unexpected of [{ success: true }, { success: true, targetUserId: 303 }]) {
      install(unexpected);
      await expect(client.unfollow('Learner', 202)).rejects.toMatchObject({
        errorCode: 'UNFOLLOW_UNCONFIRMED',
      });
    }
  });

  it('reports missing extension messaging or ID', async () => {
    vi.stubGlobal('chrome', undefined);
    await expect(client.getFollowingSummary('Learner')).rejects.toThrow('messaging is unavailable');
    stubRuntime();
    await expect(new DuoFollowConnector('').getFollowingSummary('Learner')).rejects.toThrow(
      'VITE_DUOFOLLOW_EXTENSION_ID is missing',
    );
  });

  it('reports runtime errors, empty responses and stale extension versions', async () => {
    const compare = () => client.getFollowingSummary('Learner');
    stubRuntime(undefined, { message: 'Channel closed' });
    await expect(compare()).rejects.toThrow('Channel closed');
    stubRuntime();
    await expect(compare()).rejects.toThrow('Empty connector response');
    stubRuntime({ success: true, comparison: { accountUsername: 'Learner' } });
    await expect(compare()).rejects.toThrow('Outdated connector response');
  });

  it('times out after 30 seconds when Chrome never replies', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn() } });
    const assertion = expect(client.getFollowingSummary('Learner')).rejects.toMatchObject({
      errorCode: 'TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refuses the legacy destructive protocol', async () => {
    const sendMessage = stubRuntime({ success: false, error: 'Unsupported message' });
    await expect(client.unfollow('Learner', 202)).rejects.toMatchObject({
      errorCode: 'CONNECTOR_OUTDATED',
    });
    expect(sendMessage).toHaveBeenCalledOnce();
  });

  it('retries the status after a lost reply without submitting the action again', async () => {
    vi.useFakeTimers();
    let checks = 0;
    const sendMessage = vi.fn(
      (_id: string, { type }: { type: string }, reply: (value: unknown) => void) => {
        if (type === 'REQUEST_UNFOLLOW') reply({ success: true, requestId: 'receipt' });
        else if (++checks === 2) reply({ success: true, targetUserId: 202 });
      },
    );
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const assertion = expect(client.unfollow('Learner', 202)).resolves.toEqual({
      success: true,
      targetUserId: 202,
    });
    await vi.advanceTimersByTimeAsync(16_000);
    await assertion;
    expect(sendMessage.mock.calls.map(([, message]) => message.type)).toEqual([
      'REQUEST_UNFOLLOW',
      'GET_UNFOLLOW_STATUS',
      'GET_UNFOLLOW_STATUS',
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
