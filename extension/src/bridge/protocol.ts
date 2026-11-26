import { isRecord } from '@duofollow/extension/src/dto/validation';

export const FIREFOX_CHANNEL = 'duofollow.firefox.v1';
export const FIREFOX_PORT = 'duofollow-site-v1';
export const isBridgeId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
export const isBridgeRecord = isRecord;

/** Only website commands cross the isolated-world bridge. Internal confirmation commands stay private. */
export function isSiteCommand(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    [
      'PING',
      'GET_DUOLINGO_ACCESS',
      'OPEN_DUOLINGO_SETTINGS',
      'GET_QUICK_UNFOLLOW',
      'GET_FOLLOWING_SUMMARY',
      'REQUEST_UNFOLLOW',
      'REQUEST_QUICK_UNFOLLOW',
      'CONFIRM_QUICK_UNFOLLOW',
      'GET_UNFOLLOW_STATUS',
    ].includes(value.type)
  );
}

export interface BridgePort {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

/** Content scripts may load on public routes so SPA navigation can return to comparison. */
export function isBridgeUrl(value: string, patterns: readonly string[]): boolean {
  try {
    const url = new URL(value);
    return (
      patterns.some((pattern) => {
        const base = new URL(pattern);
        const origin = base.protocol === 'http:' ? base.origin + ':5173' : base.origin;
        return url.origin === origin;
      }) &&
      (url.pathname === '/duofollow' || url.pathname.startsWith('/duofollow/'))
    );
  } catch {
    return false;
  }
}
