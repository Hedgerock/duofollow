import {
  ACCESS_CONSENT_KEY,
  ACCESS_CONSENT_VERSION,
  DUOLINGO_PERMISSIONS,
  hasDuolingoAccess,
} from './duolingoAccess.js';
import { matchLocale, privacyPath } from './locales.js';

const grant = document.querySelector<HTMLButtonElement>('#grant-access')!;
const revoke = document.querySelector<HTMLButtonElement>('#revoke-access')!;
const status = document.querySelector<HTMLElement>('#access-status')!;
const privacyLink = document.querySelector<HTMLAnchorElement>('#privacy-link')!;
const locale = matchLocale(chrome.i18n.getUILanguage()) ?? 'en';
const message = (key: string) => chrome.i18n.getMessage(key);

document.documentElement.lang = locale;
document.title = `${message('accessTitle')} — DuoFollow`;
privacyLink.href = `https://hedgerock.github.io/duofollow/${privacyPath(locale)}`;
document.querySelectorAll<HTMLElement>('[data-message]').forEach((element) => {
  element.textContent = message(element.dataset.message!);
});

let busy = false;
let revision = 0;

async function renderAccess(feedback?: string) {
  const current = ++revision;
  const connected = await hasDuolingoAccess();
  if (revision !== current) return;
  status.textContent = message(feedback ?? (connected ? 'accessGranted' : 'accessDisconnected'));
  grant.hidden = connected;
  revoke.hidden = !connected;
}

async function changeAccess(update: () => Promise<string>) {
  busy = true;
  grant.disabled = revoke.disabled = true;
  try {
    await renderAccess(await update());
  } catch {
    status.textContent = message('accessChangeError');
  } finally {
    busy = false;
    grant.disabled = revoke.disabled = false;
  }
}

grant.addEventListener('click', () => {
  void changeAccess(async () => {
    // Chrome must receive the permission request during the click.
    const granted = await chrome.permissions.request(DUOLINGO_PERMISSIONS);
    if (!granted) return 'accessDenied';
    await chrome.storage.local.set({ [ACCESS_CONSENT_KEY]: ACCESS_CONSENT_VERSION });
    return 'accessGrantedBack';
  });
});

revoke.addEventListener('click', () => {
  void changeAccess(async () => {
    await chrome.storage.local.remove(ACCESS_CONSENT_KEY);
    await chrome.permissions.remove(DUOLINGO_PERMISSIONS);
    return 'accessDisconnected';
  });
});

function refreshAccess() {
  if (busy) return;
  void renderAccess().catch(() => {
    status.textContent = message('accessCheckError');
  });
}

chrome.permissions.onRemoved.addListener(refreshAccess);
chrome.storage.onChanged.addListener(refreshAccess);
refreshAccess();
