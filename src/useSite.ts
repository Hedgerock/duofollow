import { useOutletContext } from 'react-router';

import { useLocale } from '@duofollow/src/i18n/useLocale';
import { useTheme } from '@duofollow/src/ThemeToggle';
import { useAppearance } from '@duofollow/src/useAppearance';

import type { Locale } from '@duofollow/extension/src/locales';
import type { WorkspaceState } from '@duofollow/src/following/useWorkspace';

export function useSitePreferences(routeLocale?: Locale) {
  return { ...useLocale(routeLocale), ...useTheme(), ...useAppearance() };
}

export type SitePreferences = ReturnType<typeof useSitePreferences>;
export type SiteOutletContext = { site: SitePreferences; workspace: WorkspaceState };

export function useSite() {
  return useOutletContext<SiteOutletContext>().site;
}

export function useWorkspaceState() {
  return useOutletContext<SiteOutletContext>().workspace;
}
