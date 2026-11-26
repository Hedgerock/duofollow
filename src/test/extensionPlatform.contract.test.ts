import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startConnector } from '@duofollow/extension/src/core/createConnector';
import { extensionPlatformHarness } from '@duofollow/src/test/fixtures/extensionPlatform';

const site = { url: 'http://localhost:5173/duofollow/', frameId: 0, documentId: 'document-one' };
const confirmation = {
  id: 'fixture',
  url: 'chrome-extension://fixture/unfollow-confirmation.html',
  frameId: 0,
};
type Success = { success: true; requestId: string };

describe.each(['memory', 'chromium', 'firefox'] as const)(
  'extension platform contract: %s',
  (adapter) => {
    let fixture: ReturnType<typeof extensionPlatformHarness>;
    let deleted: boolean;
    const fetchMock = vi.fn<typeof fetch>();
    beforeEach(() => {
      fixture = extensionPlatformHarness(adapter);
      deleted = false;
      vi.stubGlobal('chrome', undefined);
      vi.stubGlobal('browser', undefined);
      fetchMock.mockReset().mockImplementation(async (input, options) => {
        const url = new URL(String(input));
        if (url.origin !== 'https://www.duolingo.com') throw new Error('Unexpected origin');
        if (options?.method === 'DELETE') {
          deleted = true;
          return Response.json({ successful: true });
        }
        if (url.pathname.endsWith('/users'))
          return Response.json({ users: [{ id: 101, username: 'Learner' }] });
        if (url.pathname.endsWith('/following'))
          return Response.json({
            following: {
              cursor: null,
              totalUsers: deleted ? 0 : 1,
              users: deleted ? [] : [{ userId: 202, username: 'Target' }],
            },
          });
        if (url.pathname.endsWith('/followers'))
          return Response.json({ followers: { cursor: null, totalUsers: 0, users: [] } });
        throw new Error('Unexpected request');
      });
      vi.stubGlobal('fetch', fetchMock);
      startConnector(fixture.platform);
    });
    afterEach(() => vi.unstubAllGlobals());
    const request = () =>
      fixture.external(
        { type: 'REQUEST_QUICK_UNFOLLOW', username: 'Learner', targetUserId: 202 },
        site,
      ) as Promise<Success>;
    const writes = () => fetchMock.mock.calls.filter(([, options]) => options?.method === 'DELETE');

    it('admits only the allowed origin, route and top frame, ignoring sender fields inside the payload', async () => {
      for (const sender of [
        { ...site, url: 'https://wrong.example/duofollow/' },
        { ...site, frameId: 2 },
        { ...site, url: 'http://localhost:5173/duofollow/privacy/' },
      ]) {
        expect(
          await fixture.external(
            {
              type: 'GET_FOLLOWING_SUMMARY',
              username: 'Learner',
              sender: site,
              documentId: site.documentId,
            },
            sender,
          ),
        ).toBeUndefined();
      }
      expect(fetchMock).not.toHaveBeenCalled();
      expect(await fixture.external({ type: 'PING' }, site)).toMatchObject({ success: true });
      expect(
        await fixture.external(
          { type: 'GET_FOLLOWING_SUMMARY', username: 'Learner' },
          { ...site, url: 'http://localhost:5173/duofollow/access/' },
        ),
      ).toBeUndefined();
      expect(
        await fixture.external(
          { type: 'OPEN_DUOLINGO_SETTINGS' },
          { ...site, url: 'http://localhost:5173/duofollow/access/' },
        ),
      ).toEqual({ success: true });
    });
    it('checks consent and permissions before any API call', async () => {
      fixture.revoke();
      expect(await fixture.external({ type: 'GET_DUOLINGO_ACCESS' }, site)).toEqual({
        session: 'consent-required',
      });
      expect(
        await fixture.external({ type: 'GET_FOLLOWING_SUMMARY', username: 'Learner' }, site),
      ).toMatchObject({ success: false, errorCode: 'ACCESS_REQUIRED' });
      expect(fetchMock).not.toHaveBeenCalled();
    });
    it('compares through supplied capabilities without a browser global', async () => {
      expect(
        await fixture.external({ type: 'GET_FOLLOWING_SUMMARY', username: 'Learner' }, site),
      ).toMatchObject({
        success: true,
        comparison: { checkedFollowing: 1, checkedFollowers: 0, nonMutualUsers: 1 },
      });
      expect(globalThis.chrome).toBeUndefined();
      expect(writes()).toHaveLength(0);
    });
    it('binds quick confirmation to a document and claims the write only once', async () => {
      const result = await request();
      expect(result.success).toBe(true);
      expect(
        await fixture.external(
          { type: 'CONFIRM_QUICK_UNFOLLOW', requestId: result.requestId },
          { ...site, documentId: 'other-document' },
        ),
      ).toMatchObject({ success: false });
      const command = { type: 'CONFIRM_QUICK_UNFOLLOW', requestId: result.requestId };
      const [one, duplicate] = await Promise.all([
        fixture.external(command, site),
        fixture.external(command, site),
      ]);
      expect(one).toEqual({ success: true, targetUserId: 202 });
      expect(duplicate).toMatchObject({ success: false });
      expect(writes()).toHaveLength(1);
      expect(fixture.createWindow).not.toHaveBeenCalled();
      expect(
        await fixture.external(
          { type: 'GET_UNFOLLOW_STATUS', requestId: result.requestId },
          { ...site, documentId: 'other-document' },
        ),
      ).toMatchObject({ success: false, errorCode: 'UNFOLLOW_UNCONFIRMED' });
    });
    it('requires the trusted extension page for standard confirmation', async () => {
      const result = (await fixture.external(
        { type: 'REQUEST_UNFOLLOW', username: 'Learner', targetUserId: 202 },
        site,
      )) as Success;
      expect(fixture.createWindow).toHaveBeenCalledOnce();
      const command = { type: 'CONFIRM_UNFOLLOW', requestId: result.requestId };
      expect(
        await fixture.internal(command, {
          ...confirmation,
          url: fixture.platform.extensionUrl('unfollow-confirmation.html'),
          id: 'other-extension',
        }),
      ).toBeUndefined();
      expect(
        await fixture.internal(command, {
          ...confirmation,
          url: fixture.platform.extensionUrl('unfollow-confirmation.html'),
          frameId: 1,
        }),
      ).toBeUndefined();
      expect(writes()).toHaveLength(0);
      expect(
        await fixture.internal(command, {
          ...confirmation,
          url: fixture.platform.extensionUrl('unfollow-confirmation.html'),
        }),
      ).toEqual({
        success: true,
        targetUserId: 202,
      });
      expect(writes()).toHaveLength(1);
    });
    it('revokes a prepared write when consent disappears', async () => {
      const result = await request();
      fixture.revoke();
      expect(
        await fixture.external(
          { type: 'CONFIRM_QUICK_UNFOLLOW', requestId: result.requestId },
          site,
        ),
      ).toMatchObject({ success: false, errorCode: 'UNFOLLOW_CANCELLED' });
      expect(
        await fixture.external({ type: 'GET_UNFOLLOW_STATUS', requestId: result.requestId }, site),
      ).toMatchObject({ success: false, errorCode: 'ACCESS_REQUIRED' });
      expect(writes()).toHaveLength(0);
    });
    it('recovers the stored outcome after worker restart without repeating DELETE', async () => {
      const result = await request();
      await fixture.external({ type: 'CONFIRM_QUICK_UNFOLLOW', requestId: result.requestId }, site);
      fixture.restartEvents();
      startConnector(fixture.platform);
      expect(
        await fixture.external({ type: 'GET_UNFOLLOW_STATUS', requestId: result.requestId }, site),
      ).toEqual({ success: true, targetUserId: 202 });
      expect(writes()).toHaveLength(1);
    });
    it('restores HTTP 429 pause after worker restart before another network call', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('', { status: 429, headers: { 'Retry-After': '60' } }),
      );
      expect(
        await fixture.external({ type: 'GET_FOLLOWING_SUMMARY', username: 'Learner' }, site),
      ).toMatchObject({ errorCode: 'RATE_LIMITED' });
      expect(fetchMock).toHaveBeenCalledOnce();
      fixture.restartEvents();
      startConnector(fixture.platform);
      expect(
        await fixture.external({ type: 'GET_FOLLOWING_SUMMARY', username: 'Learner' }, site),
      ).toMatchObject({ errorCode: 'RATE_LIMITED' });
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    it('isolates the pause and session state of different core instances', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('', { status: 429, headers: { 'Retry-After': '60' } }),
      );
      await fixture.external({ type: 'GET_FOLLOWING_SUMMARY', username: 'Learner' }, site);
      const independent = extensionPlatformHarness(adapter);
      startConnector(independent.platform);
      expect(
        await independent.external({ type: 'GET_FOLLOWING_SUMMARY', username: 'Learner' }, site),
      ).toMatchObject({ success: true });
      const calls = fetchMock.mock.calls.length;
      expect(
        await fixture.external({ type: 'GET_FOLLOWING_SUMMARY', username: 'Learner' }, site),
      ).toMatchObject({ errorCode: 'RATE_LIMITED' });
      expect(fetchMock).toHaveBeenCalledTimes(calls);
    });
  },
);
