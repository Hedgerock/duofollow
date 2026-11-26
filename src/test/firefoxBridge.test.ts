import { afterEach, describe, expect, it, vi } from 'vitest';

import { acceptFirefoxBridge } from '@duofollow/extension/src/bridge/backgroundBridge';
import { startContentBridge } from '@duofollow/extension/src/bridge/contentBridge';
import { FIREFOX_CHANNEL, FIREFOX_PORT } from '@duofollow/extension/src/bridge/protocol';
import { createFirefoxPlatform } from '@duofollow/extension/src/platform/firefox';
import { createFirefoxTransport } from '@duofollow/src/api/extension/firefoxTransport';

import type {
  ExtensionPort,
  ExtensionSender,
} from '@duofollow/extension/src/platform/ExtensionPlatform';

const site = 'http://localhost:5173/duofollow/';
const patterns = ['http://localhost/*'];
function nativePort(
  sender: ExtensionSender = {
    id: 'fixture',
    url: site,
    frameId: 0,
    tab: { id: 9, index: 0, windowId: 1 },
  },
) {
  const messages: ((value: unknown) => void)[] = [],
    disconnects: (() => void)[] = [];
  return {
    name: FIREFOX_PORT,
    sender,
    onMessage: { addListener: (f: (value: unknown) => void) => messages.push(f) },
    onDisconnect: { addListener: (f: () => void) => disconnects.push(f) },
    postMessage: vi.fn(),
    disconnect: vi.fn(() => disconnects.forEach((f) => f())),
    receive(value: unknown) {
      messages.forEach((f) => f(value));
    },
  };
}
function pageWindow() {
  const events = new EventTarget();
  const target = {
    location: new URL(site),
    postMessage: vi.fn(),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    top: undefined as unknown,
  };
  target.top = target;
  const send = (data: unknown, origin = target.location.origin, source: unknown = target) => {
    const event = new Event('message');
    Object.assign(event, { data, origin, source });
    events.dispatchEvent(event);
  };
  return { target: target as unknown as Window, send, posted: target.postMessage, events };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Firefox background bridge admission', () => {
  it('reads the current tab position before reusing adjacent settings after a window move', async () => {
    const get = vi.fn(async () => ({ id: 10, index: 4, windowId: 7 }));
    const query = vi.fn(async () => [{ id: 20, index: 1, windowId: 7 }]);
    const move = vi.fn(async () => {}),
      update = vi.fn(async () => {});
    const api = {
      runtime: { getURL: (file: string) => 'moz-extension://fixture/' + file },
      tabs: { get, query, move, update },
    };
    await createFirefoxPlatform(() => api as unknown as typeof browser).openSettings({
      id: 10,
      index: 1,
      windowId: 2,
    });
    expect(get).toHaveBeenCalledWith(10);
    expect(query).toHaveBeenCalledWith({ url: 'moz-extension://fixture/access.html', windowId: 7 });
    expect(move).toHaveBeenCalledWith(20, { index: 4 });
    expect(update).toHaveBeenCalledWith(20, { active: true });
  });
  it('closes a request sent before the private document handshake', () => {
    const port = nativePort();
    const listener = vi.fn();
    acceptFirefoxBridge(port, 'fixture', patterns, [listener], []);
    port.receive({
      kind: 'request',
      id: crypto.randomUUID(),
      url: site,
      message: { type: 'PING' },
    });
    expect(port.disconnect).toHaveBeenCalledOnce();
    expect(listener).not.toHaveBeenCalled();
  });
  it.each([
    { id: 'foreign', url: site, frameId: 0, tab: { id: 9, index: 0, windowId: 1 } },
    { id: 'fixture', url: site, frameId: 1, tab: { id: 9, index: 0, windowId: 1 } },
    {
      id: 'fixture',
      url: 'http://localhost:5174/duofollow/',
      frameId: 0,
      tab: { id: 9, index: 0, windowId: 1 },
    },
    { id: 'fixture', url: site, frameId: 0 },
    {
      id: 'fixture',
      url: 'https://foreign.test/duofollow/',
      frameId: 0,
      tab: { id: 9, index: 0, windowId: 1 },
    },
  ])('rejects untrusted native sender %j', (sender) => {
    const port = nativePort(sender);
    const listener = vi.fn();
    acceptFirefoxBridge(port, 'fixture', patterns, [listener], []);
    port.receive({
      kind: 'request',
      id: crypto.randomUUID(),
      url: site,
      message: { type: 'PING' },
    });
    expect(port.disconnect).toHaveBeenCalledOnce();
    expect(listener).not.toHaveBeenCalled();
  });
  it('requires a private hello, preserves document identity across reconnects, and ignores payload sender fields', () => {
    const listener = vi.fn(
      (_message: unknown, _sender: ExtensionSender, reply: (response: unknown) => void) =>
        reply({ success: true }),
    );
    const token = crypto.randomUUID();
    const documents: unknown[] = [];
    for (const privateToken of [token, token, crypto.randomUUID()]) {
      const port = nativePort();
      acceptFirefoxBridge(port, 'fixture', patterns, [listener], []);
      port.receive({ kind: 'hello', document: privateToken });
      port.receive({
        kind: 'request',
        id: crypto.randomUUID(),
        url: site,
        message: { type: 'PING', sender: { documentId: 'forged' }, documentId: 'forged' },
      });
      documents.push(listener.mock.calls.at(-1)![1].documentId);
      port.disconnect();
    }
    expect(documents[0]).toBe(documents[1]);
    expect(documents[0]).not.toBe(documents[2]);
    expect(documents[0]).not.toBe('forged');
  });
  it('blocks internal confirmation messages and an origin change, and removes access subscriptions', () => {
    const port = nativePort();
    const listener = vi.fn();
    let access: ExtensionPort | undefined;
    acceptFirefoxBridge(
      port,
      'fixture',
      patterns,
      [listener],
      [
        (value) => {
          access = value;
        },
      ],
    );
    port.receive({ kind: 'hello', document: crypto.randomUUID() });
    port.receive({
      kind: 'request',
      id: crypto.randomUUID(),
      url: site,
      message: { type: 'CONFIRM_UNFOLLOW', requestId: 'x' },
    });
    expect(listener).not.toHaveBeenCalled();
    port.receive({ kind: 'watch', enabled: true, url: site });
    const disconnected = vi.fn();
    access!.onDisconnect.addListener(disconnected);
    port.receive({ kind: 'watch', enabled: false, url: site });
    expect(disconnected).toHaveBeenCalledOnce();
    port.receive({
      kind: 'request',
      id: crypto.randomUUID(),
      url: 'https://wrong.test/duofollow/',
      message: { type: 'PING' },
    });
    expect(port.disconnect).toHaveBeenCalledOnce();
  });
  it('bounds concurrent replies and drops late answers after disconnect', () => {
    const port = nativePort();
    let reply: ((v: unknown) => void) | undefined;
    const listener = vi.fn((_m: unknown, _s: ExtensionSender, done: (v: unknown) => void) => {
      reply = done;
      return true as const;
    });
    acceptFirefoxBridge(port, 'fixture', patterns, [listener], []);
    port.receive({ kind: 'hello', document: crypto.randomUUID() });
    for (let i = 0; i < 65; i++)
      port.receive({
        kind: 'request',
        id: crypto.randomUUID(),
        url: site,
        message: { type: 'PING' },
      });
    expect(listener).toHaveBeenCalledTimes(64);
    port.disconnect();
    port.postMessage.mockClear();
    reply?.({ success: true });
    expect(port.postMessage).not.toHaveBeenCalled();
  });
});

describe('Firefox page transport and isolated content script', () => {
  it('waits for a background reply once the content script has acknowledged the request', async () => {
    vi.useFakeTimers();
    const fixture = pageWindow(),
      transport = createFirefoxTransport(fixture.target);
    const response = transport.request({ type: 'PING' });
    const envelope = fixture.posted.mock.calls[0][0];
    fixture.send({ ...envelope, direction: 'to-page', kind: 'accepted' });
    await vi.advanceTimersByTimeAsync(3_000);
    fixture.send({ ...envelope, direction: 'to-page', kind: 'reply', response: { success: true } });
    await expect(response).resolves.toEqual({ success: true });
  });
  it('keeps another watcher active when one subscription is stopped', () => {
    const fixture = pageWindow(),
      transport = createFirefoxTransport(fixture.target);
    const first = vi.fn(),
      second = vi.fn(),
      disconnected = vi.fn();
    const stopFirst = transport.watch!(first, disconnected)!;
    const stopSecond = transport.watch!(second, disconnected)!;
    const envelope = fixture.posted.mock.calls[0][0];
    expect(fixture.posted).toHaveBeenCalledOnce();
    stopFirst();
    fixture.send({
      ...envelope,
      direction: 'to-page',
      kind: 'event',
      message: { quickUnfollow: false },
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    stopSecond();
    expect(fixture.posted.mock.calls.at(-1)![0].kind).toBe('unwatch');
    expect(disconnected).not.toHaveBeenCalled();
  });
  it('filters source, origin and correlation; abort removes listeners and cancels waiting', async () => {
    const fixture = pageWindow(),
      transport = createFirefoxTransport(fixture.target),
      controller = new AbortController();
    const result = transport.request({ type: 'PING' }, controller.signal);
    const envelope = fixture.posted.mock.calls[0][0];
    const reply = { ...envelope, direction: 'to-page', kind: 'reply', response: { success: true } };
    fixture.send(reply, 'https://evil.test');
    fixture.send(reply, undefined, {});
    controller.abort(new Error('cancelled'));
    await expect(result).rejects.toThrow('cancelled');
    expect(fixture.posted.mock.calls.at(-1)![0].kind).toBe('cancel');
    const next = transport.request({ type: 'PING' });
    const outgoing = fixture.posted.mock.calls.at(-1)![0];
    fixture.send({ ...outgoing, direction: 'to-page', kind: 'reply', response: { success: true } });
    await expect(next).resolves.toEqual({ success: true });
  });
  it('times out without a content script and delivers a disconnection only once', async () => {
    vi.useFakeTimers();
    const fixture = pageWindow(),
      transport = createFirefoxTransport(fixture.target);
    const promise = transport.request({ type: 'PING' });
    const rejected = expect(promise).rejects.toThrow('unavailable');
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    const disconnected = vi.fn(),
      event = vi.fn();
    const stop = transport.watch!(event, disconnected)!;
    const envelope = fixture.posted.mock.calls.at(-1)![0];
    fixture.send({
      ...envelope,
      direction: 'to-page',
      kind: 'event',
      message: { quickUnfollow: false },
    });
    expect(event).toHaveBeenCalledOnce();
    fixture.send({ ...envelope, direction: 'to-page', kind: 'disconnected' });
    fixture.send({ ...envelope, direction: 'to-page', kind: 'disconnected' });
    stop();
    expect(disconnected).toHaveBeenCalledOnce();
  });
  it('does not expose the document token, reconnects without replaying writes, and follows SPA locations', () => {
    const fixture = pageWindow(),
      ports = [nativePort(), nativePort()];
    let connections = 0;
    const stop = startContentBridge(() => ports[connections++], fixture.target);
    const client = crypto.randomUUID(),
      pageId = crypto.randomUUID();
    const command = {
      channel: FIREFOX_CHANNEL,
      direction: 'to-extension',
      client,
      kind: 'request',
      id: pageId,
      message: { type: 'REQUEST_QUICK_UNFOLLOW' },
    };
    fixture.send(command, 'https://evil.test');
    expect(connections).toBe(0);
    fixture.send(command);
    const hello = ports[0].postMessage.mock.calls[0][0];
    expect(hello.kind).toBe('hello');
    expect(fixture.posted.mock.calls[0][0]).toMatchObject({ kind: 'accepted', id: pageId });
    ports[0].disconnect();
    expect(fixture.posted.mock.calls.at(-1)![0]).toMatchObject({ failed: true, id: pageId });
    fixture.target.location.pathname = '/duofollow/access/';
    fixture.send({
      ...command,
      message: { type: 'OPEN_DUOLINGO_SETTINGS' },
      id: crypto.randomUUID(),
    });
    expect(ports[1].postMessage.mock.calls[0][0]).toEqual(hello);
    expect(ports[1].postMessage.mock.calls[1][0]).toMatchObject({
      url: 'http://localhost:5173/duofollow/access/',
      message: { type: 'OPEN_DUOLINGO_SETTINGS' },
    });
    expect(JSON.stringify(fixture.posted.mock.calls)).not.toContain(hello.document);
    stop();
    fixture.send(command);
    expect(connections).toBe(2);
  });
});
