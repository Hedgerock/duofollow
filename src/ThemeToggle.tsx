import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { Tooltip } from '@duofollow/src/Tooltip';

import type { Messages } from '@duofollow/src/i18n/messages';

type Theme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'duofollow.theme';

function readTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // При закрытом хранилище используется настройка системы.
  }

  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function useTheme() {
  const [theme, setTheme] = useState(readTheme);
  const requestedTheme = useRef(theme);

  function toggleTheme() {
    const next = requestedTheme.current === 'dark' ? 'light' : 'dark';
    requestedTheme.current = next;

    function applyTheme() {
      if (requestedTheme.current !== next) return;

      setTheme(next);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Тема сохранится до перезагрузки страницы.
      }
    }

    if (
      !document.startViewTransition ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      applyTheme();
      return;
    }

    const transition = document.startViewTransition(() => {
      flushSync(applyTheme);
    });
    void transition.ready.catch(() => {
      // Браузер может пропустить анимацию, например при быстрых повторных переключениях.
    });
  }

  return { theme, toggleTheme };
}

export function ThemeToggle({
  theme,
  onToggle,
  messages,
}: {
  theme: Theme;
  onToggle: () => void;
  messages: Pick<Messages, 'lightTheme' | 'darkTheme'>;
}) {
  const showSun = theme === 'dark';
  const label = showSun ? messages.lightTheme : messages.darkTheme;
  return (
    <Tooltip label={label}>
      <button type="button" className="theme-toggle" aria-label={label} onClick={onToggle}>
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {showSun ? (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42m0-14.14-1.42 1.42M6.35 17.65l-1.42 1.42" />
            </>
          ) : (
            <path d="M20.8 15.2A9.2 9.2 0 0 1 8.8 3.2a9.2 9.2 0 1 0 12 12Z" />
          )}
        </svg>
      </button>
    </Tooltip>
  );
}
