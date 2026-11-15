export const DUOLINGO_PERMISSIONS: chrome.permissions.Permissions = {
  permissions: ['cookies'],
  origins: ['https://www.duolingo.com/*'],
};

export const ACCESS_CONSENT_KEY = 'duolingoAccessConsent';
export const ACCESS_CONSENT_VERSION = 1;
export const ACCESS_REQUIRED = 'Разреши доступ к Duolingo в настройках DuoFollow Connector.';

export async function hasDuolingoAccess(): Promise<boolean> {
  const [settings, granted] = await Promise.all([
    chrome.storage.local.get(ACCESS_CONSENT_KEY),
    chrome.permissions.contains(DUOLINGO_PERMISSIONS),
  ]);
  return granted && settings[ACCESS_CONSENT_KEY] === ACCESS_CONSENT_VERSION;
}
