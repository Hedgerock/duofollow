import { useEffect, useMemo, useState } from 'react';
import { demoClient } from './data/demo';
import { findNonMutualFollowing, type DuoUser } from './domain/users';

type Filter = 'nonmutual' | 'all' | 'mutual';

export default function App() {
  const [following, setFollowing] = useState<DuoUser[]>([]);
  const [followers, setFollowers] = useState<DuoUser[]>([]);
  const [filter, setFilter] = useState<Filter>('nonmutual');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('Загрузка демоданных…');
  useEffect(() => {
    Promise.all([demoClient.getFollowing(), demoClient.getFollowers()])
      .then(([nextFollowing, nextFollowers]) => {
        setFollowing(nextFollowing);
        setFollowers(nextFollowers);
        setStatus('Демонстрационный режим · реальные аккаунты не затрагиваются');
      })
      .catch(() => setStatus('Не удалось загрузить данные'));
  }, []);
  const nonmutual = useMemo(
    () => findNonMutualFollowing(following, followers),
    [following, followers],
  );
  const followerIds = useMemo(() => new Set(followers.map((user) => user.id)), [followers]);
  const visible = following.filter((user) => {
    const mutual = followerIds.has(user.id);
    return (
      (filter === 'all' || (filter === 'mutual' ? mutual : !mutual)) &&
      `${user.username} ${user.displayName}`.toLowerCase().includes(query.toLowerCase())
    );
  });
  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectVisible() {
    setSelected((current) => {
      const next = new Set(current);
      visible.forEach((user) => next.add(user.id));
      return next;
    });
  }
  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">D</span>
          <span>
            DuoFollow <small>Subscription Manager</small>
          </span>
        </div>
        <span className="pill">● Demo mode</span>
      </header>
      <main>
        <section className="hero">
          <span className="eyebrow">DUOLINGO FOLLOWING MANAGER</span>
          <h1>
            Управляй подписками
            <br />
            <em>без лишних усилий.</em>
          </h1>
          <p>
            Найди пользователей, которые не подписаны на тебя взаимно. Пока доступен безопасный
            демонстрационный режим.
          </p>
        </section>
        <section className="stats">
          <article>
            <span>Подписки</span>
            <strong>{following.length}</strong>
            <small>Following</small>
          </article>
          <article>
            <span>Подписчики</span>
            <strong>{followers.length}</strong>
            <small>Followers</small>
          </article>
          <article className="accent">
            <span>Не подписаны взаимно</span>
            <strong>{nonmutual.length}</strong>
            <small>Not following back</small>
          </article>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Мои подписки</h2>
              <p>{status}</p>
            </div>
            <span className="count">{visible.length} пользователей</span>
          </div>
          <div className="toolbar">
            <div className="tabs">
              <button
                className={filter === 'nonmutual' ? 'active' : ''}
                onClick={() => setFilter('nonmutual')}
              >
                Невзаимные
              </button>
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
                Все
              </button>
              <button
                className={filter === 'mutual' ? 'active' : ''}
                onClick={() => setFilter('mutual')}
              >
                Взаимные
              </button>
            </div>
            <input
              aria-label="Поиск пользователей"
              placeholder="Поиск по имени…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="bulk">
            <label>
              <input
                type="checkbox"
                checked={visible.length > 0 && visible.every((u) => selected.has(u.id))}
                onChange={(e) =>
                  e.target.checked
                    ? selectVisible()
                    : setSelected((current) => {
                        const next = new Set(current);
                        visible.forEach((u) => next.delete(u.id));
                        return next;
                      })
                }
              />{' '}
              Выбрать отображаемых
            </label>
            <span>Выбрано: {selected.size}</span>
          </div>
          <div className="users">
            {visible.length === 0 ? (
              <p className="empty">Ничего не найдено</p>
            ) : (
              visible.map((user) => (
                <div className="user" key={user.id}>
                  <input
                    aria-label={`Выбрать ${user.username}`}
                    type="checkbox"
                    checked={selected.has(user.id)}
                    onChange={() => toggle(user.id)}
                  />
                  <div className="avatar">{user.displayName.slice(0, 1)}</div>
                  <div className="user-info">
                    <strong>{user.displayName}</strong>
                    <span>@{user.username}</span>
                  </div>
                  <span className={`status ${followerIds.has(user.id) ? 'mutual' : ''}`}>
                    {followerIds.has(user.id) ? '✓ Взаимно' : 'Не взаимно'}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="actions">
            <button
              disabled={selected.size === 0}
              onClick={() =>
                window.alert(
                  `Dry-run: выбрано ${selected.size} пользователей. Реальная отписка отключена.`,
                )
              }
            >
              Проверить отписку ({selected.size})
            </button>
            <span>Безопасный dry-run · без изменений аккаунта</span>
          </div>
        </section>
        <footer>
          Неофициальный проект. Не связан с Duolingo. API-интеграция пока не реализована.
        </footer>
      </main>
    </div>
  );
}
