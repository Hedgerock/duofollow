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

export function describeConnectorError(
  error: unknown,
): Pick<ConnectorFailure, 'error' | 'errorCode'> {
  const message = error instanceof Error ? error.message : 'Unknown error';
  if (error instanceof ConnectorError) return { error: message, errorCode: error.errorCode };
  if (error instanceof Error && error.name === 'TimeoutError') {
    return { error: message, errorCode: 'TIMEOUT' };
  }
  return { error: message };
}
