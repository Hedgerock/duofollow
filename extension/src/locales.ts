export const locales = ['ru', 'en', 'uk'] as const;
export type Locale = (typeof locales)[number];

export function matchLocale(value: string | null | undefined): Locale | undefined {
  const language = value?.toLowerCase().split(/[-_]/)[0];
  return locales.find((locale) => locale === language);
}

export function privacyPath(locale: Locale): string {
  return locale === 'en' ? 'privacy/' : `privacy/${locale}/`;
}
