import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectorError } from '@duofollow/extension/src/dto/ConnectorError';
import { createChromiumTransport } from '@duofollow/src/api/extension/chromiumTransport';
import { DuoFollowConnector } from '@duofollow/src/api/extension/DuoFollowConnector';

import type { ConnectorTransport } from '@duofollow/src/api/extension/ConnectorTransport';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('replaceable site transport', () => {
  const comparison = {
    accountUsername: 'Learner',
    checkedFollowing: 0,
    totalFollowing: 0,
    checkedFollowers: 0,
    totalFollowers: 0,
    mutualUsers: 0,
    nonMutualUsers: 0,
    nonMutualFollowing: [],
  };
  function transport(reply: unknown): ConnectorTransport {
    return { request: vi.fn(async () => reply), watch: () => undefined };
  }
  it('compares with an injected transport and no browser SDK', async () => {
    vi.stubGlobal('chrome', undefined);
    const channel = transport({ success: true, comparison });
    const client = new DuoFollowConnector(channel);
    await expect(client.getFollowingSummary('Learner')).resolves.toEqual({
      success: true,
      comparison,
    });
    expect(channel.request).toHaveBeenCalledWith(
      { type: 'GET_FOLLOWING_SUMMARY', username: 'Learner' },
      expect.any(AbortSignal),
    );
  });
  it.each([undefined, { success: 'true', comparison }, { success: true, comparison: {} }])(
    'validates an untrusted reply %j after transport replacement',
    async (reply) => {
      await expect(
        new DuoFollowConnector(transport(reply)).getFollowingSummary('Learner'),
      ).rejects.toMatchObject({ errorCode: 'INVALID_RESPONSE' });
    },
  );
  it('owns the timeout and cancels a nonresponsive injected request', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const channel: ConnectorTransport = {
      request: (_message, current) => {
        signal = current;
        return new Promise(() => {});
      },
      watch: () => undefined,
    };
    const result = expect(
      new DuoFollowConnector(channel).getFollowingSummary('Learner'),
    ).rejects.toMatchObject({ errorCode: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(30_000);
    await result;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('validates events and ignores delivery after unsubscription', () => {
    let deliver!: (message: unknown) => void;
    let disconnect!: () => void;
    const stop = vi.fn();
    const channel: ConnectorTransport = {
      request: async () => undefined,
      watch: (message, closed) => {
        deliver = message;
        disconnect = closed;
        return stop;
      },
    };
    const access = vi.fn(),
      quick = vi.fn();
    const unsubscribe = new DuoFollowConnector(channel).watchAccessChanges(access, quick)!;
    deliver({ access: 'revoked', quickUnfollow: false });
    deliver({ access: 'unexpected', quickUnfollow: 'true' });
    expect(access).toHaveBeenCalledExactlyOnceWith('revoked');
    expect(quick).toHaveBeenCalledExactlyOnceWith(false);
    unsubscribe();
    unsubscribe();
    deliver({ access: 'granted' });
    disconnect();
    expect(access).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });
});

describe('Chromium transport cancellation', () => {
  it('stops SDK port delivery idempotently without reporting explicit cleanup as a disconnect', () => {
    let message!: (value: unknown) => void;
    let closed!: () => void;
    const disconnect = vi.fn(() => closed());
    const connect = vi.fn(() => ({
      onMessage: {
        addListener: (callback: typeof message) => {
          message = callback;
        },
      },
      onDisconnect: {
        addListener: (callback: typeof closed) => {
          closed = callback;
        },
      },
      disconnect,
    }));
    vi.stubGlobal('chrome', { runtime: { connect } });
    const delivered = vi.fn(),
      disconnected = vi.fn();
    const stop = createChromiumTransport('fixture').watch(delivered, disconnected)!;
    expect(connect).toHaveBeenCalledWith('fixture', { name: 'duofollow-access' });
    message({ access: 'granted' });
    stop();
    stop();
    message({ access: 'revoked' });
    expect(delivered).toHaveBeenCalledExactlyOnceWith({ access: 'granted' });
    expect(disconnect).toHaveBeenCalledOnce();
    expect(disconnected).not.toHaveBeenCalled();
  });
  it('reports remote port closure once and ignores subsequent messages', () => {
    let message!: (value: unknown) => void;
    let closed!: () => void;
    const lastError = vi.fn(() => ({ message: 'Worker closed' }));
    vi.stubGlobal('chrome', {
      runtime: {
        connect: () => ({
          onMessage: {
            addListener: (callback: typeof message) => {
              message = callback;
            },
          },
          onDisconnect: {
            addListener: (callback: typeof closed) => {
              closed = callback;
            },
          },
          disconnect: vi.fn(),
        }),
        get lastError() {
          return lastError();
        },
      },
    });
    const delivered = vi.fn(),
      disconnected = vi.fn();
    createChromiumTransport('fixture').watch(delivered, disconnected);
    closed();
    closed();
    message({ access: 'granted' });
    expect(disconnected).toHaveBeenCalledOnce();
    expect(delivered).not.toHaveBeenCalled();
    expect(lastError).toHaveBeenCalledTimes(2);
  });
  it('rejects on abort, detaches its handler and consumes lastError from a late reply', async () => {
    let reply!: (result: unknown) => void;
    const lastError = vi.fn(() => ({ message: 'Channel closed after timeout' }));
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: (_id: string, _message: unknown, callback: typeof reply) => {
          reply = callback;
        },
        get lastError() {
          return lastError();
        },
      },
    });
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const error = new ConnectorError('TIMEOUT', 'timeout');
    const result = expect(
      createChromiumTransport('fixture').request({}, controller.signal),
    ).rejects.toBe(error);
    controller.abort(error);
    await result;
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    reply({ success: true });
    expect(lastError).toHaveBeenCalledOnce();
  });
  it('does not send a command whose signal is already aborted', async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(createChromiumTransport('fixture').request({}, controller.signal)).rejects.toThrow(
      'cancelled',
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
