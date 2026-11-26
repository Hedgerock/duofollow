import {
  ACCESS_CONSENT_KEY,
  ACCESS_CONSENT_VERSION,
  DUOLINGO_PERMISSIONS,
  hasDuolingoAccess,
} from '@duofollow/extension/src/duolingoAccess';
import {
  EXTENSION_LANGUAGE_KEY,
  extensionLocale,
  extensionMessage,
  localizeExtensionPage,
  readExtensionLocale,
} from '@duofollow/extension/src/extensionLocalization';
import { privacyPath } from '@duofollow/extension/src/locales';
import { createPlatform } from '@duofollow/extension/src/platform/current';
import {
  isQuickUnfollowEnabled,
  QUICK_UNFOLLOW_CONSENT_KEY,
  QUICK_UNFOLLOW_CONSENT_VERSION,
} from '@duofollow/extension/src/quickUnfollow';

const platform = createPlatform();

const grant = document.querySelector<HTMLButtonElement>('#grant-access')!;
const revoke = document.querySelector<HTMLButtonElement>('#revoke-access')!;
const status = document.querySelector<HTMLElement>('#access-status')!;
const privacyLink = document.querySelector<HTMLAnchorElement>('#privacy-link')!;
const quickUnfollow = document.querySelector<HTMLInputElement>('#quick-unfollow-consent')!;
const quickUnfollowStatus = document.querySelector<HTMLParagraphElement>('#quick-unfollow-status')!;
const language = document.querySelector<HTMLSelectElement>('#extension-language')!;
const languageError = document.querySelector<HTMLElement>('#extension-language-error')!;
let locale = extensionLocale();
let accessStatusKey = 'accessChecking';
let quickUnfollowStatusKey: string | undefined;
const message = (key: string) => extensionMessage(locale, key);

function setLocale(next: ReturnType<typeof extensionLocale>) {
  locale = next;
  localizeExtensionPage(locale, 'accessTitle');
  privacyLink.href = `https://hedgerock.github.io/duofollow/${privacyPath(locale)}`;
  language.value = locale;
  showAccessStatus(accessStatusKey);
  showQuickUnfollowStatus(quickUnfollowStatusKey);
}

function showAccessStatus(key: string) {
  accessStatusKey = key;
  status.textContent = message(key);
}

language.addEventListener('change', async () => {
  language.disabled = true;
  languageError.hidden = true;
  const next = extensionLocale(language.value);
  try {
    await platform.storage.local.set({ [EXTENSION_LANGUAGE_KEY]: next });
    setLocale(next);
  } catch {
    language.value = locale;
    languageError.hidden = false;
  } finally {
    language.disabled = false;
  }
});

setLocale(locale);
void readExtensionLocale().then((saved) => {
  setLocale(saved);
  language.disabled = false;
});

let busy = false;
let revision = 0;

async function renderAccess(feedback?: string) {
  const current = ++revision;
  const connected = await hasDuolingoAccess(platform);
  if (revision !== current) return;
  showAccessStatus(feedback ?? (connected ? 'accessGranted' : 'accessDisconnected'));
  grant.hidden = connected;
  revoke.hidden = !connected;
}

async function changeAccess(update: () => Promise<string>) {
  busy = true;
  grant.disabled = revoke.disabled = true;
  try {
    await renderAccess(await update());
  } catch {
    showAccessStatus('accessChangeError');
  } finally {
    busy = false;
    grant.disabled = revoke.disabled = false;
  }
}

grant.addEventListener('click', () => {
  void changeAccess(async () => {
    // The browser must receive the permission request during the click.
    const granted = await platform.permissions.request(DUOLINGO_PERMISSIONS);
    if (!granted) return 'accessDenied';
    await platform.storage.local.set({ [ACCESS_CONSENT_KEY]: ACCESS_CONSENT_VERSION });
    return 'accessGrantedBack';
  });
});

revoke.addEventListener('click', () => {
  void changeAccess(async () => {
    await platform.storage.local.remove(ACCESS_CONSENT_KEY);
    await platform.permissions.remove(DUOLINGO_PERMISSIONS);
    return 'accessDisconnected';
  });
});

function refreshAccess() {
  if (busy) return;
  void renderAccess().catch(() => {
    showAccessStatus('accessCheckError');
  });
}

let quickUnfollowRevision = 0;

function showQuickUnfollowStatus(key?: string) {
  quickUnfollowStatusKey = key;
  quickUnfollowStatus.hidden = key === undefined;
  quickUnfollowStatus.textContent = key ? message(key) : '';
}

async function refreshQuickUnfollow(feedback?: string) {
  const current = ++quickUnfollowRevision;
  try {
    const enabled = await isQuickUnfollowEnabled(platform);
    if (current !== quickUnfollowRevision) return;
    quickUnfollow.checked = enabled;
    quickUnfollow.disabled = false;
    showQuickUnfollowStatus(feedback);
  } catch {
    if (current !== quickUnfollowRevision) return;
    quickUnfollow.disabled = true;
    showQuickUnfollowStatus('quickUnfollowReadError');
  }
}

quickUnfollow.addEventListener('change', async () => {
  quickUnfollowRevision++;
  quickUnfollow.disabled = true;
  showQuickUnfollowStatus();
  let feedback: string | undefined;
  try {
    if (quickUnfollow.checked) {
      await platform.storage.local.set({
        [QUICK_UNFOLLOW_CONSENT_KEY]: QUICK_UNFOLLOW_CONSENT_VERSION,
      });
    } else {
      await platform.storage.local.remove(QUICK_UNFOLLOW_CONSENT_KEY);
    }
  } catch {
    feedback = 'quickUnfollowWriteError';
  }
  await refreshQuickUnfollow(feedback);
});

platform.events.permissionsRemoved.addListener(refreshAccess);
platform.events.storageChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (EXTENSION_LANGUAGE_KEY in changes)
    setLocale(extensionLocale(changes[EXTENSION_LANGUAGE_KEY].newValue));
  if (ACCESS_CONSENT_KEY in changes) refreshAccess();
  if (QUICK_UNFOLLOW_CONSENT_KEY in changes) void refreshQuickUnfollow();
});
refreshAccess();
void refreshQuickUnfollow();
