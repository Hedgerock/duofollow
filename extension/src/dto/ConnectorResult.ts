import type { ConnectorFailure } from '@duofollow/extension/src/dto/ConnectorError';

function hasSuccessFlag(value: unknown): value is { success: unknown } {
  return typeof value === 'object' && value !== null && 'success' in value;
}

/** Checks the Connector success flag. Each operation validates its own response fields. */
export function isConnectorSuccess(value: unknown): value is { success: true } {
  return hasSuccessFlag(value) && value.success === true;
}

/** Accepts a failure with a message, including replies from older versions without an error code. */
export function isConnectorFailure(
  value: unknown,
): value is Pick<ConnectorFailure, 'success' | 'error'> {
  return (
    hasSuccessFlag(value) &&
    value.success === false &&
    'error' in value &&
    typeof value.error === 'string'
  );
}
