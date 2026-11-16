import { useEffect, useState } from 'react';

import { type Locale, matchLocale } from '@duofollow/extension/src/locales';
import { translations } from '@duofollow/src/i18n/messages';

const languageKey = 'duofollow.language';

function readLocale(): Locale {
  try {
    const saved = matchLocale(window.localStorage.getItem(languageKey));
    if (saved) return saved;
  } catch {
    // Browser preferences are still available when storage is blocked.
  }
  for (const language of window.navigator?.languages ?? []) {
    const locale = matchLocale(language);
    if (locale) return locale;
  }
  return 'en';
}

export function useLocale(routeLocale?: Locale) {
  const [preferredLocale, setLocale] = useState(readLocale);
  const locale = routeLocale ?? preferredLocale;
  const messages = translations[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function changeLocale(next: Locale) {
    setLocale(next);
    try {
      window.localStorage.setItem(languageKey, next);
    } catch {
      // The selection still applies to the current page.
    }
  }

  return { locale, messages, changeLocale };
}
