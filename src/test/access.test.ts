import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import russian from '@duofollow/extension/_locales/ru/messages.json';
import ukrainian from '@duofollow/extension/_locales/uk/messages.json';
import {
  ACCESS_CONSENT_KEY,
  ACCESS_CONSENT_VERSION,
  DUOLINGO_PERMISSIONS,
} from '@duofollow/extension/src/duolingoAccess';

function control() {
  return Object.assign(new EventTarget(), { hidden: true, disabled: false, textContent: '' });
}

let grant: ReturnType<typeof control>;
let revoke: ReturnType<typeof control>;
let status: ReturnType<typeof control>;
let privacy: { href: string };
let uiLanguage: string;
let storedConsent: number | undefined;
let permitted: boolean;
const requestPermissions = vi.fn<() => Promise<boolean>>();
const storeConsent = vi.fn(async (data: Record<string, number>) => {
  storedConsent = data[ACCESS_CONSENT_KEY];
});
const clearConsent = vi.fn(async () => {
  storedConsent = undefined;
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
  permitted = false;
  grant = control();
  revoke = control();
  status = control();
  privacy = { href: '' };
  uiLanguage = 'ru';
  vi.stubGlobal('document', {
    querySelector: (id: string) =>
      ({
        '#grant-access': grant,
        '#revoke-access': revoke,
        '#access-status': status,
        '#privacy-link': privacy,
      })[id],
    querySelectorAll: () => [],
    documentElement: { lang: '' },
  });
  vi.stubGlobal('chrome', {
    i18n: {
      getUILanguage: () => uiLanguage,
      getMessage: (key: keyof typeof russian) =>
        (uiLanguage === 'uk' ? ukrainian : russian)[key].message,
    },
    permissions: {
      contains: async () => permitted,
      request: requestPermissions,
      remove: removePermissions,
      onRemoved: { addListener: vi.fn() },
    },
    storage: {
      local: {
        get: async () => ({ [ACCESS_CONSENT_KEY]: storedConsent }),
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
