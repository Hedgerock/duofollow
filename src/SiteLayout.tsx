import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router';

import { locales, matchLocale, privacyPath } from '@duofollow/extension/src/locales';
import { useWorkspace } from '@duofollow/src/following/useWorkspace';
import { ThemeToggle } from '@duofollow/src/ThemeToggle';
import { type SitePreferences, useSitePreferences } from '@duofollow/src/useSite';

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
        <NavLink
          to="/settings/"
          end
          className="theme-toggle settings-link"
          aria-label={site.messages.appearance.title}
          title={site.messages.appearance.title}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M5 3v4m0 4v10M12 3v10m0 4v4M19 3v4m0 4v10M2 7h6m1 6h6m1-6h6" />
          </svg>
        </NavLink>
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
  const settingsMatch = useMatch('/settings');
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
    ? `DuoFollow — ${site.messages.privacy}`
    : accessMatch
      ? `DuoFollow — ${site.messages.manageAccess}`
      : settingsMatch
        ? 'DuoFollow — ' + site.messages.appearance.title
        : site.messages.homeTitle;
  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div
      className="page"
      data-theme={site.theme}
      data-font-size={site.appearance.fontSize}
      data-font-family={site.appearance.fontFamily}
      data-color-vision={site.appearance.colorVision}
    >
      <Outlet context={{ site, workspace }} />
      <footer>
        <span>{site.messages.independent}</span>
        <Link to={`/${privacyPath(site.locale)}`}>{site.messages.privacy}</Link>
        <Link to="/access/">{site.messages.manageAccess}</Link>
      </footer>
    </div>
  );
}
