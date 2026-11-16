import { ConnectorError, describeConnectorError } from './dto/ConnectorError.js';
import type { ConnectorAccessResult } from './dto/ConnectorSession';
import { getFollowingSummary, unfollow } from './duolingo.js';
import {
  ACCESS_CONSENT_KEY,
  ACCESS_CONSENT_VERSION,
  ACCESS_REQUIRED,
  DUOLINGO_PERMISSIONS,
  hasDuolingoAccess,
} from './duolingoAccess.js';
import { checkDuolingoSession } from './duolingoSession.js';

const allowedOrigins = new Set(
  chrome.runtime.getManifest().externally_connectable?.matches?.map((pattern) => {
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
const accessListeners = new Set<chrome.runtime.Port>();
let accessController = new AbortController();

function getSenderPath(sender?: chrome.runtime.MessageSender): string | undefined {
  if (!sender?.url || (sender.frameId ?? 0) !== 0) return;
  try {
    const url = new URL(sender.url);
    if (allowedOrigins.has(url.origin)) return url.pathname;
  } catch {
    return;
  }
}

function notifyAccessChange(access: 'granted' | 'revoked') {
  for (const port of accessListeners) {
    try {
      port.postMessage({ access });
    } catch {
      accessListeners.delete(port);
    }
  }
}

function cancelAccess() {
  accessController.abort(new ConnectorError('ACCESS_REQUIRED', ACCESS_REQUIRED));
  accessController = new AbortController();
  notifyAccessChange('revoked');
}

chrome.permissions.onRemoved.addListener(({ origins, permissions }) => {
  if (
    !origins?.some((origin) => DUOLINGO_PERMISSIONS.origins?.includes(origin)) &&
    !permissions?.includes('cookies')
  ) {
    return;
  }
  cancelAccess();
  void chrome.storage.local.remove(ACCESS_CONSENT_KEY).catch(() => {
    // Access is also checked against Chrome permissions before each command.
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  const consent = changes[ACCESS_CONSENT_KEY];
  if (area !== 'local' || !consent || consent.oldValue === consent.newValue) return;
  if (consent.newValue === ACCESS_CONSENT_VERSION) {
    notifyAccessChange('granted');
  } else {
    cancelAccess();
  }
});

chrome.runtime.onConnectExternal.addListener((port) => {
  if (port.name !== 'duofollow-access' || !pagePaths.has(getSenderPath(port.sender) ?? '')) {
    port.disconnect();
    return;
  }
  accessListeners.add(port);
  port.onDisconnect.addListener(() => accessListeners.delete(port));
});

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage().catch(() => {
    // Settings can also be opened from the extension menu.
  });
});

async function readAccessStatus(): Promise<ConnectorAccessResult> {
  const { signal } = accessController;
  if (!(await hasDuolingoAccess()) || signal.aborted) return { session: 'consent-required' };

  try {
    const session = await checkDuolingoSession(signal);
    return { session: signal.aborted ? 'consent-required' : session };
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
  if (!(await hasDuolingoAccess())) throw new ConnectorError('ACCESS_REQUIRED', ACCESS_REQUIRED);
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

chrome.runtime.onMessageExternal.addListener((message: unknown, sender, sendResponse) => {
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
      return replyWith(readAccessStatus(), sendResponse, { session: 'duolingo-unavailable' });
    case 'OPEN_DUOLINGO_SETTINGS':
      return replyWith(
        chrome.runtime.openOptionsPage().then(() => ({ success: true })),
        sendResponse,
      );
    case 'UNFOLLOW':
      return replyWith(
        withAccess((signal) =>
          unfollow(
            'username' in message ? message.username : undefined,
            'targetUserId' in message ? message.targetUserId : undefined,
            signal,
          ),
        ),
        sendResponse,
      );
    case 'GET_FOLLOWING_SUMMARY':
      return replyWith(
        withAccess((signal) =>
          getFollowingSummary('username' in message ? message.username : undefined, signal),
        ),
        sendResponse,
      );
    case 'PING':
      sendResponse({ success: true, message: 'DuoFollow Connector is running' });
      return;
    default:
      sendResponse({ success: false, error: 'Unsupported message' });
  }
});
