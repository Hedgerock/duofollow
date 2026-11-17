import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import english from '@duofollow/extension/_locales/en/messages.json';
import russian from '@duofollow/extension/_locales/ru/messages.json';
import {
  ACCESS_CONSENT_KEY,
  ACCESS_CONSENT_VERSION,
  DUOLINGO_PERMISSIONS,
} from '@duofollow/extension/src/duolingoAccess';
import { EXTENSION_LANGUAGE_KEY } from '@duofollow/extension/src/extensionLocalization';
import {
  QUICK_UNFOLLOW_CONSENT_KEY,
  QUICK_UNFOLLOW_CONSENT_VERSION,
} from '@duofollow/extension/src/quickUnfollow';

function control() {
  return Object.assign(new EventTarget(), { hidden: true, disabled: false, textContent: '' });
}

let grant: ReturnType<typeof control>;
let revoke: ReturnType<typeof control>;
let status: ReturnType<typeof control>;
let quickUnfollow: ReturnType<typeof control> & { checked: boolean };
let quickUnfollowStatus: ReturnType<typeof control>;
let privacy: { href: string };
let uiLanguage: string;
let language: ReturnType<typeof control> & { value: string };
let languageError: ReturnType<typeof control>;
let storedLanguage: unknown;
let storedConsent: number | undefined;
let storedQuickUnfollow: number | undefined;
let permitted: boolean;
const requestPermissions = vi.fn<() => Promise<boolean>>();
const storeConsent = vi.fn(async (data: Record<string, number | string>) => {
  if (EXTENSION_LANGUAGE_KEY in data) storedLanguage = data[EXTENSION_LANGUAGE_KEY];
  if (typeof data[ACCESS_CONSENT_KEY] === 'number') storedConsent = data[ACCESS_CONSENT_KEY];
  if (typeof data[QUICK_UNFOLLOW_CONSENT_KEY] === 'number')
    storedQuickUnfollow = data[QUICK_UNFOLLOW_CONSENT_KEY];
});
const clearConsent = vi.fn(async (key: string) => {
  if (key === ACCESS_CONSENT_KEY) storedConsent = undefined;
  if (key === QUICK_UNFOLLOW_CONSENT_KEY) storedQuickUnfollow = undefined;
});
const removePermissions = vi.fn(async () => {
  expect(storedConsent).toBeUndefined();
  permitted = false;
  return true;
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  storedConsent = undefined;
  storedQuickUnfollow = undefined;
  permitted = false;
  grant = control();
  revoke = control();
  status = control();
  quickUnfollow = Object.assign(control(), { checked: false, disabled: true });
  quickUnfollowStatus = control();
  privacy = { href: '' };
  uiLanguage = 'ru';
  storedLanguage = undefined;
  language = Object.assign(control(), { value: '', disabled: true });
  languageError = control();
  vi.stubGlobal('document', {
    querySelector: (id: string) =>
      ({
        '#grant-access': grant,
        '#revoke-access': revoke,
        '#access-status': status,
        '#quick-unfollow-consent': quickUnfollow,
        '#quick-unfollow-status': quickUnfollowStatus,
        '#privacy-link': privacy,
        '#extension-language': language,
        '#extension-language-error': languageError,
      })[id],
    querySelectorAll: () => [],
    documentElement: { lang: '' },
  });
  vi.stubGlobal('chrome', {
    i18n: {
      getUILanguage: () => uiLanguage,
    },
    permissions: {
      contains: async () => permitted,
      request: requestPermissions,
      remove: removePermissions,
      onRemoved: { addListener: vi.fn() },
    },
    storage: {
      local: {
        get: async () => ({
          [ACCESS_CONSENT_KEY]: storedConsent,
          [QUICK_UNFOLLOW_CONSENT_KEY]: storedQuickUnfollow,
          [EXTENSION_LANGUAGE_KEY]: storedLanguage,
        }),
        set: storeConsent,
        remove: clearConsent,
      },
      onChanged: { addListener: vi.fn() },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('extension access settings', () => {
  it('localizes the privacy link without requesting access', async () => {
    uiLanguage = 'uk';
    await import('@duofollow/extension/src/access');
    await vi.waitFor(() => expect(grant.hidden).toBe(false));
    expect(document.documentElement.lang).toBe('uk');
    expect(status.textContent).toBe('Доступ відключено.');
    expect(privacy.href).toBe('https://hedgerock.github.io/duofollow/privacy/uk/');
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it('uses a saved locale and updates the page and its policy link after selection', async () => {
    storedLanguage = 'en';
    await import('@duofollow/extension/src/access');
    await vi.waitFor(() => expect(language.disabled).toBe(false));
    expect(status.textContent).toBe(english.accessDisconnected.message);
    expect(document.documentElement.lang).toBe('en');
    expect(privacy.href).toBe('https://hedgerock.github.io/duofollow/privacy/');

    language.value = 'uk';
    language.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(language.disabled).toBe(false));
    expect(document.documentElement.lang).toBe('uk');
    expect(storedLanguage).toBe('uk');
    expect(status.textContent).toBe('Доступ відключено.');
    expect(privacy.href).toBe('https://hedgerock.github.io/duofollow/privacy/uk/');
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it('asks for the two scoped permissions only after a click and stores consent only when granted', async () => {
    requestPermissions.mockResolvedValueOnce(false).mockImplementationOnce(async () => {
      permitted = true;
      return true;
    });
    await import('@duofollow/extension/src/access');
    await vi.waitFor(() => expect(grant.hidden).toBe(false));
    expect(requestPermissions).not.toHaveBeenCalled();

    grant.dispatchEvent(new Event('click'));
    expect(requestPermissions).toHaveBeenCalledExactlyOnceWith(DUOLINGO_PERMISSIONS);
    await vi.waitFor(() => expect(grant.disabled).toBe(false));
    expect(storeConsent).not.toHaveBeenCalled();
    expect(revoke.hidden).toBe(true);

    grant.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(revoke.hidden).toBe(false));
    expect(storeConsent).toHaveBeenCalledExactlyOnceWith({
      [ACCESS_CONSENT_KEY]: ACCESS_CONSENT_VERSION,
    });
  });

  it('stores or removes quick unfollow consent independently of Duolingo access', async () => {
    storedConsent = ACCESS_CONSENT_VERSION;
    permitted = true;
    await import('@duofollow/extension/src/access');
    await vi.waitFor(() => expect(quickUnfollow.disabled).toBe(false));
    expect(quickUnfollow.checked).toBe(false);
    expect(storeConsent).not.toHaveBeenCalled();

    quickUnfollow.checked = true;
    quickUnfollow.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(quickUnfollow.disabled).toBe(false));
    expect(storeConsent).toHaveBeenCalledExactlyOnceWith({
      [QUICK_UNFOLLOW_CONSENT_KEY]: QUICK_UNFOLLOW_CONSENT_VERSION,
    });
    expect(quickUnfollow.checked).toBe(true);

    quickUnfollow.checked = false;
    quickUnfollow.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(quickUnfollow.disabled).toBe(false));
    expect(clearConsent).toHaveBeenCalledExactlyOnceWith(QUICK_UNFOLLOW_CONSENT_KEY);
    expect(quickUnfollow.checked).toBe(false);
    expect(storedConsent).toBe(ACCESS_CONSENT_VERSION);
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(removePermissions).not.toHaveBeenCalled();
  });

  it('restores the saved checkbox state when consent cannot be written', async () => {
    storeConsent.mockRejectedValueOnce(new Error('Storage unavailable'));
    await import('@duofollow/extension/src/access');
    await vi.waitFor(() => expect(quickUnfollow.disabled).toBe(false));

    quickUnfollow.checked = true;
    quickUnfollow.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(quickUnfollow.disabled).toBe(false));
    expect(quickUnfollow.checked).toBe(false);
    expect(quickUnfollowStatus.textContent).toBe(russian.quickUnfollowWriteError.message);

    quickUnfollow.checked = true;
    quickUnfollow.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(quickUnfollow.disabled).toBe(false));
    expect(quickUnfollow.checked).toBe(true);
    expect(quickUnfollowStatus.hidden).toBe(true);
  });

  it('clears the consent before revoking permissions', async () => {
    storedConsent = ACCESS_CONSENT_VERSION;
    permitted = true;
    await import('@duofollow/extension/src/access');
    await vi.waitFor(() => expect(revoke.hidden).toBe(false));

    revoke.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(grant.hidden).toBe(false));
    expect(clearConsent).toHaveBeenCalledExactlyOnceWith(ACCESS_CONSENT_KEY);
    expect(removePermissions).toHaveBeenCalledExactlyOnceWith(DUOLINGO_PERMISSIONS);
    expect(status.textContent).toBe('Доступ отключён.');
  });
});
