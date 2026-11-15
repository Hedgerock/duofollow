import { Link } from 'react-router';
import { privacyPath } from '../extension/src/locales';
import { ConnectionDialog } from './ConnectionDialog';
import { ComparisonSkeleton } from './following/ComparisonSkeleton';
import { getDuolingoProfileUrl } from './following/profiles';
import type { WorkspaceState } from './following/useWorkspace';
import { NotificationViewport } from './notifications';
import { ProfileAvatar } from './ProfileAvatar';
import { LanguageSelect, SiteHeader } from './SiteLayout';
import { UnfollowDialog } from './UnfollowDialog';
import { useSite, useWorkspaceState, type SitePreferences } from './useSite';
import { VirtualFollowingList } from './VirtualFollowingList';

export default function App() {
  return <Workspace site={useSite()} workspace={useWorkspaceState()} />;
}

export function Workspace({
  site,
  workspace,
}: {
  site: SitePreferences;
  workspace: WorkspaceState;
}) {
  const { locale, messages } = site;
  const formatNumber = new Intl.NumberFormat(locale).format;
  const privacyHref = `/${privacyPath(locale)}`;
  const {
    status,
    revision,
    refreshConnection,
    dismissedRevision,
    setDismissedRevision,
    isReady,
    issue,
    notifications,
    dismiss,
    clearNotifications,
    accountUsername,
    setAccountUsername,
    compareFollowing,
    isLoading,
    comparison,
    nonMutualQuery,
    setNonMutualQuery,
    searchTerm,
    visibleNonMutual,
    consentRequired,
    confirmation,
    askToUnfollow,
    cancelUnfollow,
    confirmUnfollow,
    finishUnfollow,
    unfollowingId,
    removingId,
    nonMutualFollowing,
  } = workspace;

  const languageControl = <LanguageSelect site={site} onChange={clearNotifications} />;

  return (
    <>
      <SiteHeader site={site} languageControl={languageControl}>
        {comparison && (
          <a
            className="topbar-profile"
            href={getDuolingoProfileUrl(comparison.accountUsername)}
            target="_blank"
            rel="noopener noreferrer"
            inert={!isReady}
            aria-label={messages.resultProfile(comparison.accountUsername)}
          >
            <ProfileAvatar name={comparison.accountUsername} picture={comparison.accountPicture} />
            <div className="topbar-profile-text">
              <small>{messages.resultFor}</small>
              <strong title={`@${comparison.accountUsername}`}>
                @{comparison.accountUsername}
              </strong>
            </div>
            <span className="topbar-profile-arrow" aria-hidden="true">
              ↗
            </span>
          </a>
        )}
        {(isReady || status === 'signed-out' || status === 'duolingo-unavailable') && (
          <Link
            to="/access/"
            className="theme-toggle site-control-link"
            aria-label={messages.manageAccess}
            title={messages.manageAccess}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <rect x="5" y="10" width="14" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
            </svg>
          </Link>
        )}
      </SiteHeader>
      {!isReady && (
        <div className="connection-notice">
          <p role="status">
            {issue ? messages.connection.issues[issue].title : messages.connection.checking}
          </p>
          {issue && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setDismissedRevision(null)}
            >
              {messages.connection.help}
            </button>
          )}
        </div>
      )}
      <main inert={!isReady}>
        <section className="hero">
          <div className="hero-copy">
            <h1>{messages.heading}</h1>
            <p>{messages.intro}</p>
          </div>

          <form
            className="comparison-form"
            onSubmit={(event) => {
              event.preventDefault();
              compareFollowing();
            }}
          >
            <label htmlFor="duolingo-username">{messages.accountLabel}</label>
            <input
              id="duolingo-username"
              type="text"
              placeholder={messages.username}
              autoCapitalize="none"
              spellCheck={false}
              required
              value={accountUsername}
              disabled={!isReady || isLoading}
              onChange={(event) => setAccountUsername(event.target.value)}
            />
            <button
              type="submit"
              className="primary-button"
              disabled={!isReady || !accountUsername.trim() || isLoading || unfollowingId !== null}
            >
              {isLoading ? messages.comparing : messages.compare}
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
              <section className="stats comparison-reveal" aria-label={messages.resultsLabel}>
                <article>
                  <span>{messages.checked}</span>
                  <strong>{formatNumber(comparison.checkedFollowing)}</strong>
                  <small>{messages.ofTotal(formatNumber(comparison.totalFollowing))}</small>
                </article>
                <article>
                  <span>{messages.mutual}</span>
                  <strong>{formatNumber(comparison.mutualUsers)}</strong>
                  <small>{messages.amongChecked}</small>
                </article>
                <article className="accent">
                  <span>{messages.nonMutual}</span>
                  <strong>
                    {comparison.nonMutualUsers === null
                      ? '—'
                      : formatNumber(comparison.nonMutualUsers)}
                  </strong>
                  <small>
                    {comparison.nonMutualUsers === null
                      ? messages.incomplete
                      : messages.amongChecked}
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
                    <h2 id="non-mutual-following-title">{messages.nonMutualTitle}</h2>
                    <p>
                      {messages.checkedCount(
                        formatNumber(comparison.checkedFollowing),
                        formatNumber(comparison.totalFollowing),
                      )}
                    </p>
                  </div>
                  <span className="count" aria-live="polite">
                    {searchTerm
                      ? `${formatNumber(visibleNonMutual.length)} ${messages.ofTotal(formatNumber(nonMutualFollowing.length))}`
                      : formatNumber(nonMutualFollowing.length)}
                  </span>
                </div>

                {nonMutualFollowing.length > 0 && (
                  <div className="toolbar">
                    <input
                      type="search"
                      aria-label={messages.searchLabel}
                      placeholder={messages.searchPlaceholder}
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
                  emptyMessage={searchTerm ? messages.noMatches : messages.noNonMutual}
                  messages={messages}
                />
              </section>
            )}
          </div>
        </div>
      </main>
      <UnfollowDialog
        confirmation={consentRequired ? null : confirmation}
        onCancel={cancelUnfollow}
        onConfirm={() => void confirmUnfollow()}
        messages={messages}
      />
      {issue && (
        <ConnectionDialog
          issue={issue}
          open={dismissedRevision !== revision}
          onClose={() => setDismissedRevision(revision)}
          onRetry={refreshConnection}
          messages={messages}
          privacyHref={privacyHref}
          languageControl={languageControl}
        />
      )}
      <NotificationViewport
        notifications={notifications}
        dismiss={dismiss}
        messages={messages.notifications}
      />
    </>
  );
}
