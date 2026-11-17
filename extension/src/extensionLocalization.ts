import english from '@duofollow/extension/_locales/en/messages.json';
import russian from '@duofollow/extension/_locales/ru/messages.json';
import ukrainian from '@duofollow/extension/_locales/uk/messages.json';
import { locales, matchLocale } from '@duofollow/extension/src/locales';

import type { Locale } from '@duofollow/extension/src/locales';

const dictionaries = { en: english, ru: russian, uk: ukrainian } satisfies Record<
  Locale,
  typeof english
>;

export const EXTENSION_LANGUAGE_KEY = 'duofollow.extensionLocale';

export function extensionLocale(value?: unknown): Locale {
  return (
    locales.find((locale) => locale === value) ?? matchLocale(chrome.i18n.getUILanguage()) ?? 'en'
  );
}

export async function readExtensionLocale(): Promise<Locale> {
  return chrome.storage.local.get(EXTENSION_LANGUAGE_KEY).then(
    (settings) => extensionLocale(settings[EXTENSION_LANGUAGE_KEY]),
    () => extensionLocale(),
  );
}

export function extensionMessage(locale: Locale, key: string): string {
  const messages: Record<string, { message: string }> = dictionaries[locale];
  return Object.hasOwn(messages, key) ? messages[key].message : '';
}

export function localizeExtensionPage(locale: Locale, titleKey: string) {
  document.documentElement.lang = locale;
  document.title = `${extensionMessage(locale, titleKey)} — DuoFollow`;
  document.querySelectorAll<HTMLElement>('[data-message]').forEach((element) => {
    element.textContent = extensionMessage(locale, element.dataset.message ?? '');
  });
}
