export type DuolingoSessionStatus = 'ready' | 'signed-out' | 'duolingo-unavailable';

export type ConnectorAccessStatus = DuolingoSessionStatus | 'consent-required';

export type ConnectorStatus =
  ConnectorAccessStatus | 'connector-unavailable' | 'connector-outdated';
