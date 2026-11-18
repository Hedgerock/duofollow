import type { ConnectorErrorCode } from '@duofollow/extension/src/dto/ConnectorError';

export type DuolingoSessionStatus =
  'ready' | 'signed-out' | 'session-changed' | 'duolingo-unavailable';

export type ConnectorAccessStatus = DuolingoSessionStatus | 'consent-required';

export interface ConnectedDuolingoAccount {
  userId: number;
  username: string;
  picture: string | null;
}

export interface ConnectorAccessResult {
  session: ConnectorAccessStatus;
  errorCode?: ConnectorErrorCode;
  sessionUserId?: number;
  account?: ConnectedDuolingoAccount | null;
}

export type ConnectorStatus =
  | Exclude<ConnectorAccessStatus, 'session-changed'>
  | 'connector-unavailable'
  | 'connector-outdated'
  | 'rate-limited'
  | 'duolingo-timeout'
  | 'duolingo-response-invalid';
