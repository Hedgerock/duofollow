import { getFollowingSummary, probeDuolingo, probeFollowing, unfollow } from './duolingo.js';

const ALLOWED_ORIGINS = new Set([
  'https://hedgerock.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const UNFOLLOW_PATHS = new Set(['/duofollow', '/duofollow/', '/duofollow/index.html']);

function replyWith(
  request: Promise<unknown>,
  sendResponse: (response: unknown) => void,
  failure: { success: false } | { accessible: false },
  fallback = 'Unknown error',
): true {
  void request.then(sendResponse, (error: unknown) => {
    sendResponse({ ...failure, error: error instanceof Error ? error.message : fallback });
  });
  return true;
}

chrome.runtime.onMessageExternal.addListener((message: unknown, sender, sendResponse) => {
  if (!sender.url) return;

  let senderUrl: URL;
  try {
    senderUrl = new URL(sender.url);
  } catch {
    return;
  }

  if (!ALLOWED_ORIGINS.has(senderUrl.origin)) return;

  if (typeof message !== 'object' || message === null || !('type' in message)) {
    sendResponse({ success: false, error: 'Unsupported message' });
    return;
  }

  switch (message.type) {
    case 'UNFOLLOW': {
      if (!UNFOLLOW_PATHS.has(senderUrl.pathname) || (sender.frameId ?? 0) !== 0) {
        sendResponse({ success: false, error: 'Открой DuoFollow в отдельной вкладке.' });
        return;
      }

      return replyWith(
        unfollow(
          'username' in message ? message.username : undefined,
          'targetUserId' in message ? message.targetUserId : undefined,
        ),
        sendResponse,
        { success: false },
        'Не удалось проверить отписку.',
      );
    }
    case 'GET_FOLLOWING_SUMMARY':
      return replyWith(
        getFollowingSummary('username' in message ? message.username : undefined),
        sendResponse,
        { success: false },
      );
    case 'PROBE_FOLLOWING':
      return replyWith(probeFollowing(), sendResponse, { accessible: false });
    case 'PROBE_DUOLINGO':
      return replyWith(probeDuolingo(), sendResponse, { accessible: false });
    case 'PING':
      sendResponse({ success: true, message: 'DuoFollow Connector is running' });
      return;
    default:
      sendResponse({ success: false, error: 'Unsupported message' });
  }
});
