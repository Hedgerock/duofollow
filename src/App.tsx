import { DuoFollowConnector } from './api/extension/DuoFollowConnector.ts';
import type {
  FollowingComparison,
  FollowingComparisonResult,
} from '../extension/src/dto/DuolingoFollowingDto';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NotificationViewport, useNotifications } from './notifications';
import { VirtualFollowingList } from './VirtualFollowingList';

type ComparisonRequest = { username: string };

const ACCOUNT_STORAGE_KEY = 'duofollow.accountUsername';
const connector = new DuoFollowConnector(import.meta.env.VITE_DUOFOLLOW_EXTENSION_ID);

function readSavedUsername(): string {
  try {
    return window.localStorage.getItem(ACCOUNT_STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

function saveUsername(username: string): void {
  try {
    window.localStorage.setItem(ACCOUNT_STORAGE_KEY, username);
  } catch {
    // Браузер может блокировать доступ к хранилищу.
  }
}

export default function App() {
  const [accountUsername, setAccountUsername] = useState(readSavedUsername);
  const [request, setRequest] = useState<ComparisonRequest | null>(() =>
    accountUsername ? { username: accountUsername } : null,
  );
  const [isLoading, setIsLoading] = useState(request !== null);
  const [comparison, setComparison] = useState<FollowingComparison | null>(null);
  const [nonMutualQuery, setNonMutualQuery] = useState('');
  const pendingRequest = useRef<{
    request: ComparisonRequest;
    result: Promise<FollowingComparisonResult>;
  } | null>(null);
  const { visible: notifications, notify, dismiss } = useNotifications();

  useEffect(() => {
    if (!request) return;

    let active = true;
    const pending = pendingRequest.current;
    if (pending?.request !== request) {
      notify({
        group: 'comparison',
        kind: 'info',
        title: 'Сравниваем подписки',
        message: `Загружаем данные для ${request.username}.`,
      });
    }
    const result =
      pending?.request === request
        ? pending.result
        : connector.getFollowingSummary(request.username);

    pendingRequest.current = { request, result };

    void result.then(
      (response) => {
        if (!active) return;

        pendingRequest.current = null;
        setIsLoading(false);

        if (!response.success) {
          notify({
            group: 'comparison',
            kind: 'error',
            title: 'Не удалось сравнить подписки',
            message: response.error,
          });
          return;
        }

        const data = response.comparison;
        saveUsername(data.accountUsername);
        setComparison(data);
        setAccountUsername(data.accountUsername);
        setNonMutualQuery('');
        notify({
          group: 'comparison',
          kind: 'success',
          title: 'Сравнение завершено',
          message: `@${data.accountUsername} · проверено ${data.checkedFollowing} из ${data.totalFollowing} подписок.`,
        });
      },
      (error: unknown) => {
        if (!active) return;

        pendingRequest.current = null;
        setIsLoading(false);
        notify({
          group: 'comparison',
          kind: 'error',
          title: 'Не удалось сравнить подписки',
          message: error instanceof Error ? error.message : 'Не удалось связаться с расширением',
        });
      },
    );

    return () => {
      active = false;
    };
  }, [notify, request]);

  function compareFollowing() {
    const username = accountUsername.trim();
    if (!username || isLoading) return;

    setIsLoading(true);
    setRequest({ username });
  }

  const nonMutualFollowing = comparison?.nonMutualFollowing;
  const searchTerm = nonMutualQuery.trim().replace(/^@/, '').toLowerCase();
  const visibleNonMutual = useMemo(() => {
    const users = nonMutualFollowing ?? [];

    return searchTerm
      ? users.filter(
          ({ displayName, username }) =>
            displayName.toLowerCase().includes(searchTerm) ||
            username.toLowerCase().includes(searchTerm),
        )
      : users;
  }, [nonMutualFollowing, searchTerm]);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <img className="brand-icon" src={`${import.meta.env.BASE_URL}duofollow.svg`} alt="" />
          <span>
            DuoFollow <small>Subscription Manager</small>
          </span>
        </div>
      </header>
      <main>
        <section className="hero">
          <span className="eyebrow">DUOLINGO FOLLOWING MANAGER</span>
          <h1>
            Управляй подписками
            <br />
            <em>без лишних усилий.</em>
          </h1>

          <h2>DuoFollow</h2>

          <form
            className="toolbar comparison-form"
            onSubmit={(event) => {
              event.preventDefault();
              compareFollowing();
            }}
          >
            <label htmlFor="duolingo-username">Имя аккаунта, открытого в Duolingo</label>
            <input
              id="duolingo-username"
              type="text"
              placeholder="Имя пользователя"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={accountUsername}
              disabled={isLoading}
              onChange={(event) => setAccountUsername(event.target.value)}
            />
            <button type="submit" disabled={!accountUsername.trim() || isLoading}>
              {isLoading ? 'Сравниваем…' : 'Сравнить мои подписки'}
            </button>
          </form>

          {comparison && <p>Результат для @{comparison.accountUsername}</p>}
        </section>
        <div className="comparison-results" aria-busy={isLoading}>
          {isLoading && <ComparisonSkeleton />}
          <div
            className="comparison-content"
            aria-hidden={isLoading || undefined}
            inert={isLoading}
          >
            {comparison && (
              <section className="stats comparison-reveal" aria-label="Результат проверки подписок">
                <article>
                  <span>Подписки проверены</span>
                  <strong>{comparison.checkedFollowing}</strong>
                  <small>из {comparison.totalFollowing}</small>
                </article>
                <article>
                  <span>Взаимные</span>
                  <strong>{comparison.mutualUsers}</strong>
                  <small>среди проверенных</small>
                </article>
                <article className="accent">
                  <span>Невзаимные</span>
                  <strong>{comparison.nonMutualUsers ?? '—'}</strong>
                  <small>
                    {comparison.nonMutualUsers === null
                      ? 'Список подписчиков неполный'
                      : 'среди проверенных'}
                  </small>
                </article>
              </section>
            )}
            {comparison && nonMutualFollowing && (
              <section
                className="panel live-following comparison-reveal"
                aria-labelledby="non-mutual-following-title"
              >
                <div className="panel-heading">
                  <div>
                    <h2 id="non-mutual-following-title">Невзаимные подписки Duolingo</h2>
                    <p>
                      Проверено {comparison.checkedFollowing} из {comparison.totalFollowing}{' '}
                      подписок.
                    </p>
                  </div>
                  <span className="count" aria-live="polite">
                    {searchTerm
                      ? `${visibleNonMutual.length} из ${nonMutualFollowing.length}`
                      : nonMutualFollowing.length}
                  </span>
                </div>

                {nonMutualFollowing.length > 0 && (
                  <div className="toolbar">
                    <input
                      type="search"
                      aria-label="Поиск по невзаимным подпискам"
                      placeholder="Имя или @username"
                      value={nonMutualQuery}
                      onChange={(event) => setNonMutualQuery(event.target.value)}
                    />
                  </div>
                )}

                <VirtualFollowingList
                  key={comparison.accountUsername}
                  users={visibleNonMutual}
                  filterKey={searchTerm}
                  emptyMessage={
                    searchTerm
                      ? 'По этому запросу никого не найдено.'
                      : 'Среди проверенных подписок невзаимных нет.'
                  }
                />
              </section>
            )}
          </div>
        </div>
        <footer>Неофициальный проект. Не связан с Duolingo.</footer>
      </main>
      <NotificationViewport notifications={notifications} dismiss={dismiss} />
    </div>
  );
}

function ComparisonSkeleton() {
  return (
    <div className="comparison-skeleton" aria-hidden="true" inert>
      <div className="stats">
        {[0, 1, 2].map((index) => (
          <article key={index}>
            <span className="skeleton-bar skeleton-label" />
            <span className="skeleton-bar skeleton-value" />
            <span className="skeleton-bar skeleton-caption" />
          </article>
        ))}
      </div>

      <div className="panel live-following">
        <div className="panel-heading">
          <div className="skeleton-heading">
            <span className="skeleton-bar skeleton-title" />
            <span className="skeleton-bar skeleton-caption" />
          </div>
        </div>

        <div className="toolbar">
          <span className="skeleton-bar skeleton-search" />
        </div>

        <ul className="users live-following-list virtual-following">
          {[0, 1, 2, 3, 4, 5, 6].map((index) => (
            <li className="user" key={index}>
              <div className="user-info">
                <span className="skeleton-bar skeleton-label" />
                <span className="skeleton-bar skeleton-caption" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
