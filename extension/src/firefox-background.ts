import { startConnector } from '@duofollow/extension/src/core/createConnector';
import { createFirefoxPlatform } from '@duofollow/extension/src/platform/firefox';
startConnector(createFirefoxPlatform());
