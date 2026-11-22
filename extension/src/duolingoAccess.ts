import type {
  ExtensionPermissionRequest,
  ExtensionPlatform,
} from '@duofollow/extension/src/platform/ExtensionPlatform';

export const DUOLINGO_PERMISSIONS: ExtensionPermissionRequest = {
  permissions: ['cookies'],
  origins: ['https://www.duolingo.com/*'],
};

export const ACCESS_CONSENT_KEY = 'duolingoAccessConsent';
export const ACCESS_CONSENT_VERSION = 1;
export const ACCESS_REQUIRED = 'Разреши доступ к Duolingo в настройках DuoFollow Connector.';

export async function hasDuolingoAccess(
  platform: Pick<ExtensionPlatform, 'storage' | 'permissions'>,
): Promise<boolean> {
  const [settings, granted] = await Promise.all([
    platform.storage.local.get(ACCESS_CONSENT_KEY),
    platform.permissions.contains(DUOLINGO_PERMISSIONS),
  ]);
  return granted && settings[ACCESS_CONSENT_KEY] === ACCESS_CONSENT_VERSION;
}
