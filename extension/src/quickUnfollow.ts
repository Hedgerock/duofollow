export const QUICK_UNFOLLOW_CONSENT_KEY = 'quickUnfollowConsent';
export const QUICK_UNFOLLOW_CONSENT_VERSION = 2;

/** Reads whether the browser profile has accepted the current quick-unfollow behavior. */
export async function isQuickUnfollowEnabled(): Promise<boolean> {
  const settings = await chrome.storage.local.get(QUICK_UNFOLLOW_CONSENT_KEY);
  return settings[QUICK_UNFOLLOW_CONSENT_KEY] === QUICK_UNFOLLOW_CONSENT_VERSION;
}
