import { isConnectorSuccess } from '@duofollow/extension/src/dto/ConnectorResult';
import { matchLocale } from '@duofollow/extension/src/locales';

import type { UnfollowPreview } from '@duofollow/extension/src/dto/UnfollowConfirmation';

const requestId = window.location.hash.slice(1);
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const preview = document.querySelector<HTMLDListElement>('#preview')!;
const account = document.querySelector<HTMLElement>('#account')!;
const target = document.querySelector<HTMLElement>('#target')!;
const cancel = document.querySelector<HTMLButtonElement>('#cancel')!;
const confirm = document.querySelector<HTMLButtonElement>('#confirm')!;
const close = document.querySelector<HTMLButtonElement>('#close')!;

document.documentElement.lang = matchLocale(chrome.i18n.getUILanguage()) ?? 'en';
document.title = `${chrome.i18n.getMessage('unfollowTitle')} — DuoFollow Connector`;
document.querySelectorAll<HTMLElement>('[data-message]').forEach((element) => {
  element.textContent = chrome.i18n.getMessage(element.dataset.message!);
});

function showStatus(message: string) {
  status.textContent = chrome.i18n.getMessage(message);
}

async function send<T>(type: 'READ_UNFOLLOW_PREVIEW' | 'CANCEL_UNFOLLOW' | 'CONFIRM_UNFOLLOW') {
  return (await chrome.runtime.sendMessage({ type, requestId })) as T | undefined;
}

function finish(message: string) {
  showStatus(message);
  close.hidden = false;
  cancel.hidden = true;
  confirm.hidden = true;
  close.focus();
}

async function loadPreview() {
  showStatus('unfollowChecking');
  if (!requestId) return finish('unfollowUnavailable');
  const result = await send<{ success: true; preview: UnfollowPreview }>('READ_UNFOLLOW_PREVIEW');
  if (!isConnectorSuccess(result)) return finish('unfollowUnavailable');
  account.textContent = '@' + result.preview.username;
  target.textContent = `${result.preview.targetLabel} · ID ${result.preview.targetUserId}`;
  preview.hidden = false;
  showStatus('');
  cancel.hidden = false;
  confirm.hidden = false;
  cancel.focus();
}

function disableActions() {
  cancel.disabled = true;
  confirm.disabled = true;
}

cancel.addEventListener('click', async () => {
  disableActions();
  await send('CANCEL_UNFOLLOW').catch(() => undefined);
  window.close();
});

confirm.addEventListener('click', async () => {
  disableActions();
  showStatus('unfollowChecking');
  try {
    const result = await send<unknown>('CONFIRM_UNFOLLOW');
    finish(result ? 'unfollowFinished' : 'unfollowUnavailable');
  } catch {
    finish('unfollowUnavailable');
  }
});

close.addEventListener('click', () => window.close());
void loadPreview().catch(() => finish('unfollowUnavailable'));
