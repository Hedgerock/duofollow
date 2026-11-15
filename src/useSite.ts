import { useOutletContext } from 'react-router';
import type { Locale } from '../extension/src/locales';
import type { WorkspaceState } from './following/useWorkspace';
import { useLocale } from './i18n/useLocale';
import { useTheme } from './ThemeToggle';

export function useSitePreferences(routeLocale?: Locale) {
  return { ...useLocale(routeLocale), ...useTheme() };
}

export type SitePreferences = ReturnType<typeof useSitePreferences>;
export type SiteOutletContext = { site: SitePreferences; workspace: WorkspaceState };

export function useSite() {
  return useOutletContext<SiteOutletContext>().site;
}

export function useWorkspaceState() {
  return useOutletContext<SiteOutletContext>().workspace;
}
