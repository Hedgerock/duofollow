import { createDuolingo } from '@duofollow/extension/src/core/duolingo';
import { createDuolingoRateLimit } from '@duofollow/extension/src/core/duolingoRateLimit';
import { createDuolingoResponse } from '@duofollow/extension/src/core/duolingoResponse';
import { createDuolingoSession } from '@duofollow/extension/src/core/duolingoSession';
import { createUnfollowRequests } from '@duofollow/extension/src/core/unfollowRequests';
import {
  ConnectorError,
  describeConnectorError,
} from '@duofollow/extension/src/dto/ConnectorError';
import { unfollowConfirmationPage } from '@duofollow/extension/src/dto/UnfollowConfirmation';
import {
  ACCESS_CONSENT_KEY,
  ACCESS_CONSENT_VERSION,
  ACCESS_REQUIRED,
  DUOLINGO_PERMISSIONS,
  hasDuolingoAccess,
} from '@duofollow/extension/src/duolingoAccess';
import {
  isQuickUnfollowEnabled,
  QUICK_UNFOLLOW_CONSENT_KEY,
  QUICK_UNFOLLOW_CONSENT_VERSION,
} from '@duofollow/extension/src/quickUnfollow';

import type { ConnectorAccessResult } from '@duofollow/extension/src/dto/ConnectorSession';
import type {
  ExtensionPlatform,
  ExtensionPort,
  ExtensionSender,
} from '@duofollow/extension/src/platform/ExtensionPlatform';

/** Starts one isolated extension core against browser-owned capabilities. */
export function startConnector(platform: ExtensionPlatform) {
  const rateLimit = createDuolingoRateLimit(platform.storage.session);
  const response = createDuolingoResponse(rateLimit);
  const session = createDuolingoSession(platform, rateLimit, response);
  const duolingo = createDuolingo(session, rateLimit, response);
  const { getFollowingSummary } = duolingo;
  const { checkDuolingoSession } = session;
  const allowedOrigins = new Set(
    platform.sitePatterns.map((pattern) => {
      const origin = new URL(pattern).origin;
      return origin.startsWith('http://') ? `${origin}:5173` : origin;
    }),
  );
  const pagePaths = new Set(['/duofollow', '/duofollow/', '/duofollow/index.html']);
  const settingsPaths = new Set([
    '/duofollow/access',
    '/duofollow/access/',
    '/duofollow/access/index.html',
  ]);
  const accessListeners = new Set<ExtensionPort>();
  let accessController = new AbortController();
  const unfollowRequests = createUnfollowRequests(withAccess, platform, duolingo);
  platform.events.windowRemoved.addListener(unfollowRequests.windowClosed);

  function getSenderPath(sender?: ExtensionSender): string | undefined {
    if (!sender?.url || (sender.frameId ?? 0) !== 0) return;
    try {
      const url = new URL(sender.url);
      if (allowedOrigins.has(url.origin)) return url.pathname;
    } catch {
      return;
    }
  }

  type AccessEvent = { access: 'granted' | 'revoked' } | { quickUnfollow: boolean };

  function sendAccessEvent(port: ExtensionPort, event: AccessEvent) {
    try {
      port.postMessage(event);
    } catch {
      accessListeners.delete(port);
    }
  }

  function broadcastAccessEvent(event: AccessEvent) {
    for (const port of accessListeners) sendAccessEvent(port, event);
  }

  let quickUnfollowRevision = 0;

  function cancelAccess() {
    accessController.abort(new ConnectorError('ACCESS_REQUIRED', ACCESS_REQUIRED));
    accessController = new AbortController();
    unfollowRequests.revoke();
    broadcastAccessEvent({ access: 'revoked' });
  }

  platform.events.permissionsRemoved.addListener(({ origins, permissions }) => {
    if (
      !origins?.some((origin) => DUOLINGO_PERMISSIONS.origins?.includes(origin)) &&
      !permissions?.includes('cookies')
    ) {
      return;
    }
    cancelAccess();
    void platform.storage.local.remove(ACCESS_CONSENT_KEY).catch(() => {
      // Access is also checked against browser permissions before each command.
    });
  });

  platform.events.storageChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const quick = changes[QUICK_UNFOLLOW_CONSENT_KEY];
    const quickWasEnabled = quick?.oldValue === QUICK_UNFOLLOW_CONSENT_VERSION;
    const quickEnabled = quick?.newValue === QUICK_UNFOLLOW_CONSENT_VERSION;
    if (quickWasEnabled !== quickEnabled) {
      quickUnfollowRevision++;
      if (!quickEnabled) unfollowRequests.revokeQuickUnfollow();
      broadcastAccessEvent({ quickUnfollow: quickEnabled });
    }

    const consent = changes[ACCESS_CONSENT_KEY];
    if (!consent || consent.oldValue === consent.newValue) return;
    if (consent.newValue === ACCESS_CONSENT_VERSION) {
      broadcastAccessEvent({ access: 'granted' });
    } else {
      cancelAccess();
    }
  });

  platform.events.externalConnect.addListener((port) => {
    if (port.name !== 'duofollow-access' || !pagePaths.has(getSenderPath(port.sender) ?? '')) {
      port.disconnect();
      return;
    }
    accessListeners.add(port);
    port.onDisconnect.addListener(() => accessListeners.delete(port));
    const revision = quickUnfollowRevision;
    void isQuickUnfollowEnabled(platform)
      .catch(() => false)
      .then((quickUnfollow) => {
        if (accessListeners.has(port) && revision === quickUnfollowRevision) {
          sendAccessEvent(port, { quickUnfollow });
        }
      });
  });

  platform.events.action.addListener(() => {
    void platform.openSettings().catch(() => {
      // Settings can also be opened from the extension menu.
    });
  });

  async function readAccessStatus(includeAccount: boolean): Promise<ConnectorAccessResult> {
    const { signal } = accessController;
    if (!(await hasDuolingoAccess(platform)) || signal.aborted)
      return { session: 'consent-required' };

    try {
      const result = await checkDuolingoSession(signal, includeAccount);
      return signal.aborted ? { session: 'consent-required' } : result;
    } catch (error) {
      if (signal.aborted) return { session: 'consent-required' };
      const { errorCode } = describeConnectorError(error);
      return errorCode
        ? { session: 'duolingo-unavailable', errorCode }
        : { session: 'duolingo-unavailable' };
    }
  }

  async function withAccess<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const { signal } = accessController;
    if (!(await hasDuolingoAccess(platform)))
      throw new ConnectorError('ACCESS_REQUIRED', ACCESS_REQUIRED);
    signal.throwIfAborted();
    try {
      const result = await run(signal);
      signal.throwIfAborted();
      return result;
    } catch (error) {
      signal.throwIfAborted();
      throw error;
    }
  }

  function replyWith(
    request: Promise<unknown>,
    sendResponse: (response: unknown) => void,
    failure: { success: false } | { session: 'duolingo-unavailable' } = { success: false },
  ): true {
    void request.then(sendResponse, (error: unknown) => {
      sendResponse({ ...failure, ...describeConnectorError(error) });
    });
    return true;
  }

  platform.events.message.addListener((message: unknown, sender, sendResponse) => {
    if (
      sender.id !== platform.id ||
      (sender.frameId ?? 0) !== 0 ||
      sender.url?.split('#')[0] !== platform.extensionUrl(unfollowConfirmationPage) ||
      typeof message !== 'object' ||
      message === null ||
      !('type' in message) ||
      !('requestId' in message) ||
      typeof message.requestId !== 'string'
    )
      return;

    switch (message.type) {
      case 'READ_UNFOLLOW_PREVIEW':
        sendResponse(unfollowRequests.preview(message.requestId));
        return;
      case 'CANCEL_UNFOLLOW':
        sendResponse(unfollowRequests.cancel(message.requestId));
        return;
      case 'CONFIRM_UNFOLLOW':
        return replyWith(unfollowRequests.confirm(message.requestId), sendResponse);
    }
  });

  platform.events.externalMessage.addListener((message: unknown, sender, sendResponse) => {
    const path = getSenderPath(sender);
    if (!path) return;
    if (typeof message !== 'object' || message === null || !('type' in message)) {
      if (pagePaths.has(path)) sendResponse({ success: false, error: 'Unsupported message' });
      return;
    }
    if (
      !pagePaths.has(path) &&
      !(settingsPaths.has(path) && message.type === 'OPEN_DUOLINGO_SETTINGS')
    )
      return;

    switch (message.type) {
      case 'GET_DUOLINGO_ACCESS':
        return replyWith(
          readAccessStatus('includeAccount' in message && message.includeAccount === true),
          sendResponse,
          { session: 'duolingo-unavailable' },
        );
      case 'OPEN_DUOLINGO_SETTINGS':
        return replyWith(
          platform.openSettings(sender.tab).then(() => ({ success: true })),
          sendResponse,
        );
      case 'GET_QUICK_UNFOLLOW':
        return replyWith(
          isQuickUnfollowEnabled(platform).then((enabled) => ({
            success: true,
            enabled,
            confirmation: 'website',
          })),
          sendResponse,
        );
      case 'REQUEST_UNFOLLOW':
      case 'REQUEST_QUICK_UNFOLLOW':
        if (!sender.documentId) break;
        return replyWith(
          unfollowRequests.request(
            sender.documentId,
            'username' in message ? message.username : undefined,
            'targetUserId' in message ? message.targetUserId : undefined,
            message.type === 'REQUEST_QUICK_UNFOLLOW',
          ),
          sendResponse,
        );
      case 'CONFIRM_QUICK_UNFOLLOW':
        if (
          !sender.documentId ||
          !('requestId' in message) ||
          typeof message.requestId !== 'string'
        )
          break;
        return replyWith(
          unfollowRequests.confirmQuick(message.requestId, sender.documentId),
          sendResponse,
        );
      case 'GET_UNFOLLOW_STATUS':
        if (
          !sender.documentId ||
          !('requestId' in message) ||
          typeof message.requestId !== 'string'
        )
          break;
        return replyWith(
          unfollowRequests.status(message.requestId, sender.documentId),
          sendResponse,
        );
      case 'GET_FOLLOWING_SUMMARY':
        return replyWith(
          withAccess((signal) =>
            getFollowingSummary(
              'username' in message ? message.username : undefined,
              signal,
              'sessionUserId' in message ? message.sessionUserId : undefined,
            ),
          ),
          sendResponse,
        );
      case 'PING':
        sendResponse({ success: true, message: 'DuoFollow Connector is running' });
        return;
    }
    sendResponse({ success: false, error: 'Unsupported message' });
  });
}
