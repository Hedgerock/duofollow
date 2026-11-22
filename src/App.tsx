import { Link } from 'react-router';

import { privacyPath } from '@duofollow/extension/src/locales';
import { ConnectionDialog } from '@duofollow/src/ConnectionDialog';
import { ComparisonSkeleton } from '@duofollow/src/following/ComparisonSkeleton';
import {
  AccountLookupFallback,
  ConnectedAccountCard,
} from '@duofollow/src/following/ConnectedAccountCard';
import { CoverageDetails } from '@duofollow/src/following/CoverageDetails';
import { FollowingCount } from '@duofollow/src/following/FollowingCount';
import { getDuolingoProfileUrl } from '@duofollow/src/following/profiles';
import { RelationshipLegend } from '@duofollow/src/following/RelationshipLegend';
import { FOLLOWING_ROW_HEIGHT } from '@duofollow/src/following/useFollowingViewport';
import { NotificationViewport } from '@duofollow/src/notifications';
import { ProfileAvatar } from '@duofollow/src/ProfileAvatar';
import { LanguageSelect, SiteContent, SiteHeader } from '@duofollow/src/SiteLayout';
import { Tooltip } from '@duofollow/src/Tooltip';
import { UnfollowDialog } from '@duofollow/src/UnfollowDialog';
import { fontSizes } from '@duofollow/src/useAppearance';
import { type SitePreferences, useSite, useWorkspaceState } from '@duofollow/src/useSite';
import { VirtualFollowingList } from '@duofollow/src/VirtualFollowingList';

import type {
  FollowingSortOrder,
  FollowingView,
} from '@duofollow/src/following/useFollowingComparison';
import type { WorkspaceState } from '@duofollow/src/following/useWorkspace';

const followingViews: FollowingView[] = ['all', 'mutual', 'non-mutual'];

export default function App() {
  return <Workspace site={useSite()} workspace={useWorkspaceState()} />;
}

/**
 * Renders the comparison screen from the state owned by SiteLayout.
 * Disables connector-dependent controls whenever the connection is unavailable.
 */
export function Workspace({
  site,
  workspace,
}: {
  site: SitePreferences;
  workspace: WorkspaceState;
}) {
  const { appearance, locale, messages } = site;
  const rowHeight = Math.ceil(FOLLOWING_ROW_HEIGHT * fontSizes[appearance.fontSize]);
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
    connectedAccount,
    setAccountUsername,
    compareFollowing,
    isLoading,
    comparison,
    followingList,
    consentRequired,
    confirmation,
    askToUnfollow,
    cancelUnfollow,
    confirmUnfollow,
    finishUnfollow,
    unfollowingId,
    removingId,
  } = workspace;
  const {
    activeView,
    hasFullView,
    canShowNonMutual,
    total,
    query,
    sort,
    searchTerm,
    highlighting,
    users,
  } = followingList;
  const formattedTotal = formatNumber(total);
  const listTitle = messages.followingViews[activeView];
  const followingCoverage = comparison?.coverage?.following;
  const followersCoverage = comparison?.coverage?.followers;

  const canManageAccess =
    status !== 'checking' &&
    status !== 'consent-required' &&
    status !== 'connector-unavailable' &&
    status !== 'connector-outdated';

  const languageControl = <LanguageSelect site={site} onChange={clearNotifications} />;

  return (
    <>
      <SiteHeader
        site={site}
        languageControl={languageControl}
        profile={
          comparison && (
            <Tooltip label={`@${comparison.accountUsername}`}>
              <a
                className="topbar-profile"
                href={getDuolingoProfileUrl(comparison.accountUsername)}
                target="_blank"
                rel="noopener noreferrer"
                inert={!isReady}
                aria-label={messages.resultProfile(comparison.accountUsername)}
              >
                <ProfileAvatar
                  name={comparison.accountUsername}
                  picture={comparison.accountPicture}
                />
                <div className="topbar-profile-text">
                  <small>{messages.resultFor}</small>
                  <strong>@{comparison.accountUsername}</strong>
                </div>
                <span className="topbar-profile-arrow" aria-hidden="true">
                  ↗
                </span>
              </a>
            </Tooltip>
          )
        }
      >
        {canManageAccess && (
          <Tooltip label={messages.manageAccess}>
            <Link
              to="/access/"
              className="theme-toggle site-control-link"
              aria-label={messages.manageAccess}
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
          </Tooltip>
        )}
      </SiteHeader>
      <SiteContent label={messages.heading}>
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
        <main className="comparison-page" inert={!isReady}>
          <section className="hero">
            <div className="hero-copy">
              <h1>{messages.heading}</h1>
              <p>{messages.intro}</p>
            </div>

            {connectedAccount ? (
              <ConnectedAccountCard
                account={connectedAccount}
                disabled={!isReady || unfollowingId !== null}
                isLoading={isLoading}
                messages={messages}
                onCompare={compareFollowing}
              />
            ) : (
              <form
                className="comparison-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  compareFollowing();
                }}
              >
                {connectedAccount === null && (
                  <AccountLookupFallback onRetry={refreshConnection} messages={messages} />
                )}
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
                  disabled={
                    !isReady || !accountUsername.trim() || isLoading || unfollowingId !== null
                  }
                >
                  {isLoading ? messages.comparing : messages.compare}
                </button>
              </form>
            )}
          </section>
          <div className="comparison-results" aria-busy={isLoading}>
            {(comparison || isLoading) && (
              <section
                className={isLoading ? 'stats stats-loading' : 'stats comparison-reveal'}
                aria-label={messages.resultsLabel}
                aria-hidden={isLoading || undefined}
                inert={isLoading}
              >
                <article>
                  <span>{messages.checked}</span>
                  <strong>{formatNumber(comparison?.checkedFollowing ?? 0)}</strong>
                  <CoverageDetails
                    key={followingCoverage}
                    status={followingCoverage}
                    label={messages.checked}
                    total={messages.ofTotal(formatNumber(comparison?.totalFollowing ?? 0))}
                    messages={messages}
                  />
                </article>
                <article>
                  <span>{messages.followersChecked}</span>
                  <strong>{formatNumber(comparison?.checkedFollowers ?? 0)}</strong>
                  <CoverageDetails
                    key={followersCoverage}
                    status={followersCoverage}
                    label={messages.followersChecked}
                    total={messages.ofTotal(formatNumber(comparison?.totalFollowers ?? 0))}
                    messages={messages}
                  />
                </article>
                <article>
                  <span>{messages.mutual}</span>
                  <strong>{formatNumber(comparison?.mutualUsers ?? 0)}</strong>
                  <small>
                    {comparison?.nonMutualUsers === null
                      ? messages.confirmed
                      : messages.amongChecked}
                  </small>
                </article>
                <article className="accent">
                  <span>{messages.nonMutual}</span>
                  <strong>
                    {comparison?.nonMutualUsers === null
                      ? '—'
                      : formatNumber(comparison?.nonMutualUsers ?? 0)}
                  </strong>
                  <small>
                    {comparison?.nonMutualUsers === null
                      ? messages.incomplete
                      : messages.amongChecked}
                  </small>
                </article>
                {comparison && !hasFullView && comparison.nonMutualUsers === null && (
                  <p className="comparison-coverage-note">{messages.incompleteFollowersNote}</p>
                )}
                {comparison && !hasFullView && (
                  <p className="comparison-coverage-note following-upgrade-note">
                    {messages.updateConnectorForViews}
                  </p>
                )}
              </section>
            )}
            {isLoading && <ComparisonSkeleton rowHeight={rowHeight} />}
            <div
              className="comparison-content"
              aria-hidden={isLoading || undefined}
              inert={isLoading}
            >
              {comparison && (hasFullView || canShowNonMutual) && (
                <section
                  className="panel live-following comparison-reveal"
                  aria-labelledby="following-list-title"
                >
                  <div className="panel-heading">
                    <div>
                      <h2 id="following-list-title">{listTitle}</h2>
                      <p>
                        {messages.checkedCount(
                          formatNumber(comparison.checkedFollowing),
                          formatNumber(comparison.totalFollowing),
                        )}
                      </p>
                    </div>
                    <FollowingCount
                      displayed={searchTerm ? formatNumber(users.length) : formattedTotal}
                      total={formattedTotal}
                      ofTotal={messages.ofTotal(formattedTotal)}
                      searching={!!searchTerm}
                    />
                  </div>

                  {hasFullView && (
                    <div className="following-list-controls">
                      <div
                        className="following-views"
                        role="group"
                        aria-label={messages.followingViewLabel}
                        aria-describedby={!canShowNonMutual ? 'following-filter-note' : undefined}
                      >
                        {followingViews.map((view) => (
                          <button
                            key={view}
                            type="button"
                            className="secondary-button"
                            aria-pressed={activeView === view}
                            disabled={view === 'non-mutual' && !canShowNonMutual}
                            onClick={() => followingList.setView(view)}
                          >
                            {messages.followingViews[view]}
                          </button>
                        ))}
                      </div>
                      {!canShowNonMutual && (
                        <p id="following-filter-note" className="following-filter-note">
                          {messages.incompleteFollowersNote}
                        </p>
                      )}
                      <RelationshipLegend
                        relationships={['mutual', canShowNonMutual ? 'non-mutual' : 'unknown']}
                        messages={messages}
                        visible={activeView === 'all'}
                      />
                    </div>
                  )}
                  {(total > 0 || (hasFullView && comparison.checkedFollowing > 0)) && (
                    <div className="toolbar following-toolbar">
                      <input
                        type="search"
                        aria-label={messages.searchLabel}
                        placeholder={messages.searchPlaceholder}
                        value={query}
                        onChange={(event) => followingList.setQuery(event.target.value)}
                      />
                      <div
                        className="following-sort-control"
                        data-custom-order={sort !== 'received'}
                      >
                        <Tooltip label={messages.sortLabel}>
                          <select
                            className="following-sort"
                            aria-label={messages.sortLabel}
                            value={sort}
                            onChange={(event) =>
                              followingList.setSort(event.currentTarget.value as FollowingSortOrder)
                            }
                          >
                            <option value="received">{messages.sortReceived}</option>
                            <option value="name-asc">{messages.sortNameAsc}</option>
                            <option value="name-desc">{messages.sortNameDesc}</option>
                          </select>
                        </Tooltip>
                        <svg
                          className="following-sort-icon"
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M4 6h11M4 12h8M4 18h5m10-12v12m-3-3 3 3 3-3" />
                        </svg>
                      </div>
                    </div>
                  )}

                  <VirtualFollowingList
                    key={comparison.accountUsername}
                    users={users}
                    highlightTerm={searchTerm}
                    highlighting={highlighting}
                    rowHeight={rowHeight}
                    viewKey={`${activeView}:${sort}:${sort === 'received' ? '' : locale}:${searchTerm}`}
                    label={listTitle}
                    showRelationships={activeView === 'all'}
                    unfollowingId={unfollowingId}
                    removingId={removingId}
                    onUnfollow={askToUnfollow}
                    onRemovalComplete={finishUnfollow}
                    emptyMessage={
                      searchTerm && total > 0
                        ? messages.noMatches
                        : messages.followingEmpty[activeView]
                    }
                    messages={messages}
                  />
                </section>
              )}
            </div>
          </div>
        </main>
      </SiteContent>
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
