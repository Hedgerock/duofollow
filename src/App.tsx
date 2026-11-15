import { DuoFollowConnector } from './api/extension/DuoFollowConnector';
import { ComparisonSkeleton } from './following/ComparisonSkeleton';
import { getDuolingoProfileUrl } from './following/profiles';
import { useFollowingComparison } from './following/useFollowingComparison';
import { useUnfollow } from './following/useUnfollow';
import { NotificationViewport, useNotifications } from './notifications';
import { ProfileAvatar } from './ProfileAvatar';
import { UnfollowDialog } from './UnfollowDialog';
import { VirtualFollowingList } from './VirtualFollowingList';

const connector = new DuoFollowConnector(import.meta.env.VITE_DUOFOLLOW_EXTENSION_ID);

export default function App() {
  const { visible: notifications, notify, dismiss } = useNotifications();
  const {
    activity,
    accountUsername,
    setAccountUsername,
    compareFollowing,
    isLoading,
    comparison,
    removeSubscription,
    nonMutualQuery,
    setNonMutualQuery,
    searchTerm,
    visibleNonMutual,
  } = useFollowingComparison(connector, notify);
  const {
    confirmation,
    askToUnfollow,
    cancelUnfollow,
    confirmUnfollow,
    finishUnfollow,
    unfollowingId,
    removingId,
  } = useUnfollow({
    activity,
    account: comparison?.accountUsername,
    connector,
    notify,
    removeSubscription,
  });
  const nonMutualFollowing = comparison?.nonMutualFollowing;

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <img className="brand-icon" src={`${import.meta.env.BASE_URL}duofollow.svg`} alt="" />
          <span>
            DuoFollow <small>Subscription Manager</small>
          </span>
        </div>
        {comparison && (
          <a
            className="topbar-profile"
            href={getDuolingoProfileUrl(comparison.accountUsername)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Результат для @${comparison.accountUsername}. Открыть профиль в Duolingo в новой вкладке`}
          >
            <ProfileAvatar name={comparison.accountUsername} picture={comparison.accountPicture} />
            <div className="topbar-profile-text">
              <small>Результат для</small>
              <strong title={`@${comparison.accountUsername}`}>
                @{comparison.accountUsername}
              </strong>
            </div>
            <span className="topbar-profile-arrow" aria-hidden="true">
              ↗
            </span>
          </a>
        )}
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
            <button
              type="submit"
              disabled={!accountUsername.trim() || isLoading || unfollowingId !== null}
            >
              {isLoading ? 'Сравниваем…' : 'Сравнить мои подписки'}
            </button>
          </form>
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
                  unfollowingId={unfollowingId}
                  removingId={removingId}
                  onUnfollow={askToUnfollow}
                  onRemovalComplete={finishUnfollow}
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
      <UnfollowDialog
        confirmation={confirmation}
        onCancel={cancelUnfollow}
        onConfirm={() => void confirmUnfollow()}
      />
      <NotificationViewport notifications={notifications} dismiss={dismiss} />
    </div>
  );
}
