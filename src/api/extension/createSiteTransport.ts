import { createChromiumTransport } from '@duofollow/src/api/extension/chromiumTransport';
import { getConnectorExtensionId } from '@duofollow/src/api/extension/connectorConfig';
import { createFirefoxTransport } from '@duofollow/src/api/extension/firefoxTransport';
import { getBrowserInfo } from '@duofollow/src/browser';

/** Firefox's content script supplies the connection; store IDs are used only by Chrome and Edge. */
export function createSiteTransport() {
  return getBrowserInfo().id === 'firefox'
    ? createFirefoxTransport()
    : createChromiumTransport(getConnectorExtensionId());
}
