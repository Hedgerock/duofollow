import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { Link, Outlet, useMatch, useNavigate } from 'react-router';
import { locales, matchLocale, privacyPath } from '../extension/src/locales';
import { useWorkspace } from './following/useWorkspace';
import { ThemeToggle } from './ThemeToggle';
import { useSitePreferences, type SitePreferences } from './useSite';

const languageNames = { ru: 'Русский', en: 'English', uk: 'Українська' };

export function LanguageSelect({
  site,
  onChange,
}: {
  site: SitePreferences;
  onChange?: () => void;
}) {
  return (
    <select
      className="language-select"
      aria-label={site.messages.language}
      value={site.locale}
      onChange={(event) => {
        const next = matchLocale(event.target.value);
        if (next && next !== site.locale) {
          site.changeLocale(next);
          onChange?.();
        }
      }}
    >
      {locales.map((language) => (
        <option key={language} value={language} lang={language}>
          {languageNames[language]}
        </option>
      ))}
    </select>
  );
}

export function SiteHeader({
  site,
  children,
  languageControl = <LanguageSelect site={site} />,
}: {
  site: SitePreferences;
  children?: ReactNode;
  languageControl?: ReactNode;
}) {
  return (
    <header className="topbar">
      <Link className="brand site-home-link" to="/">
        <img className="brand-icon" src={`${import.meta.env.BASE_URL}duofollow.svg`} alt="" />
        <span>
          DuoFollow <small>{site.messages.subtitle}</small>
        </span>
      </Link>
      <div className="topbar-controls">
        {children}
        <ThemeToggle theme={site.theme} onToggle={site.toggleTheme} messages={site.messages} />
        {languageControl}
      </div>
    </header>
  );
}

export function SiteLayout() {
  const privacyMatch = useMatch('/privacy/:language?');
  const accessMatch = useMatch('/access');
  const workspaceVisible = Boolean(useMatch('/'));
  const section = privacyMatch ? 'privacy' : accessMatch ? 'access' : 'workspace';
  const routeLocale = privacyMatch
    ? (matchLocale(privacyMatch.params.language) ?? 'en')
    : undefined;
  const navigate = useNavigate();
  const preferences = useSitePreferences(routeLocale);
  const workspace = useWorkspace(preferences.locale, workspaceVisible);
  const site: SitePreferences = {
    ...preferences,
    changeLocale(next) {
      preferences.changeLocale(next);
      if (privacyMatch) void navigate(`/${privacyPath(next)}`, { replace: true });
    },
  };
  const title = privacyMatch
    ? site.messages.privacy
    : accessMatch
      ? site.messages.manageAccess
      : site.messages.subtitle;
  useEffect(() => {
    document.title = `DuoFollow — ${title}`;
  }, [title]);
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [section]);

  return (
    <div className="page" data-theme={site.theme}>
      <Outlet context={{ site, workspace }} />
      <footer>
        <span>{site.messages.independent}</span>
        <Link to={`/${privacyPath(site.locale)}`}>{site.messages.privacy}</Link>
        <Link to="/access/">{site.messages.manageAccess}</Link>
      </footer>
    </div>
  );
}
