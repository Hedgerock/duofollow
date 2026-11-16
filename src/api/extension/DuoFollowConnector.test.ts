import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuoFollowConnector } from './DuoFollowConnector';

const client = new DuoFollowConnector('test-extension');

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

describe('DuoFollowConnector', () => {
  it('sends the username and accepts a partial comparison', async () => {
    const result = {
      success: true,
      comparison: { accountUsername: 'Learner', nonMutualFollowing: null },
    };
    const sendMessage = stubRuntime(result);
    await expect(client.getFollowingSummary('Learner')).resolves.toEqual(result);
    expect(sendMessage).toHaveBeenCalledWith(
      'test-extension',
      { type: 'GET_FOLLOWING_SUMMARY', username: 'Learner' },
      expect.any(Function),
    );
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
    const sendMessage = stubRuntime(result);
    await expect(client.unfollow('Learner', 202)).resolves.toEqual(result);
    expect(sendMessage).toHaveBeenCalledWith(
      'test-extension',
      { type: 'UNFOLLOW', username: 'Learner', targetUserId: 202 },
      expect.any(Function),
    );
    for (const unexpected of [{ success: true }, { success: true, targetUserId: 303 }]) {
      stubRuntime(unexpected);
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

  it('treats a lost unfollow reply as an unknown outcome without resending', async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const assertion = expect(client.unfollow('Learner', 202)).rejects.toMatchObject({
      errorCode: 'UNFOLLOW_UNCONFIRMED',
    });
    await vi.advanceTimersByTimeAsync(45_000);
    await assertion;
    expect(sendMessage).toHaveBeenCalledOnce();
  });
});
