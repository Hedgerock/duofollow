const errorCodes = [
  'ACCESS_REQUIRED',
  'SIGNED_OUT',
  'ACCESS_DENIED',
  'RATE_LIMITED',
  'TIMEOUT',
  'INVALID_RESPONSE',
  'CONNECTOR_UNAVAILABLE',
  'ACCOUNT_MISMATCH',
  'UNFOLLOW_UNCONFIRMED',
] as const;

export type ConnectorErrorCode = (typeof errorCodes)[number];

export class ConnectorError extends Error {
  constructor(
    public readonly errorCode: ConnectorErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type ConnectorFailure = {
  success: false;
  error: string;
  errorCode?: ConnectorErrorCode;
};

export function isConnectorErrorCode(value: unknown): value is ConnectorErrorCode {
  return errorCodes.some((code) => code === value);
}

type ConnectorErrorDetails = Pick<ConnectorFailure, 'error' | 'errorCode'>;

export function getConnectorErrorDetails(error: unknown, fallback = ''): ConnectorErrorDetails {
  if (error instanceof ConnectorError) return { error: error.message, errorCode: error.errorCode };
  return { error: error instanceof Error ? error.message : fallback };
}

export function describeConnectorError(error: unknown): ConnectorErrorDetails {
  const details = getConnectorErrorDetails(error, 'Unknown error');
  if (details.errorCode === undefined && error instanceof Error && error.name === 'TimeoutError') {
    return { error: details.error, errorCode: 'TIMEOUT' };
  }
  return details;
}
