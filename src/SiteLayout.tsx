import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useMatch, useNavigate } from 'react-router';
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
  profile,
  children,
  languageControl = <LanguageSelect site={site} />,
}: {
  site: SitePreferences;
  profile?: ReactNode;
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
      {profile}
      <div className="topbar-controls">
        {children}
        <ThemeToggle theme={site.theme} onToggle={site.toggleTheme} messages={site.messages} />
        {languageControl}
      </div>
    </header>
  );
}

export function SiteContent({ label, children }: { label: string; children: ReactNode }) {
  const { pathname } = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [pathname]);

  return (
    <div className="site-content" ref={scrollRef} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

export function SiteLayout() {
  const privacyMatch = useMatch('/privacy/:language?');
  const accessMatch = useMatch('/access');
  const workspaceVisible = Boolean(useMatch('/'));
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
