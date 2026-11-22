import { startConnector } from '@duofollow/extension/src/core/createConnector';
import { createChromiumPlatform } from '@duofollow/extension/src/platform/chromium';

startConnector(createChromiumPlatform());
