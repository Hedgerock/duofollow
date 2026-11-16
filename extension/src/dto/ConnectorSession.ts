import type { ConnectorErrorCode } from './ConnectorError';

export type DuolingoSessionStatus = 'ready' | 'signed-out' | 'duolingo-unavailable';

export type ConnectorAccessStatus = DuolingoSessionStatus | 'consent-required';

export interface ConnectorAccessResult {
  session: ConnectorAccessStatus;
  errorCode?: ConnectorErrorCode;
}

export type ConnectorStatus =
  | ConnectorAccessStatus
  | 'connector-unavailable'
  | 'connector-outdated'
  | 'rate-limited'
  | 'duolingo-timeout'
  | 'duolingo-response-invalid';
