import { useState } from 'react';

import { getDuolingoProfileUrl } from '@duofollow/src/following/profiles';
import { ProfileAvatar } from '@duofollow/src/ProfileAvatar';

import type { ConnectedDuolingoAccount } from '@duofollow/extension/src/dto/ConnectorSession';
import type { Messages } from '@duofollow/src/i18n/messages';

/** Displays the verified account and refreshes its comparison on demand. */
export function ConnectedAccountCard({
  account,
  disabled,
  isLoading,
  messages,
  onCompare,
}: {
  account: ConnectedDuolingoAccount;
  disabled: boolean;
  isLoading: boolean;
  messages: Messages;
  onCompare: () => void;
}) {
  const copy = messages.connectedAccount;
  return (
    <div className="comparison-form" aria-busy={isLoading}>
      <span className="connected-account-label">{copy.label}</span>
      <a
        className="connected-account-profile"
        href={getDuolingoProfileUrl(account.username)}
        target="_blank"
        rel="noopener noreferrer"
        inert={isLoading}
      >
        <ProfileAvatar name={account.username} picture={account.picture} />
        <div className="connected-account-details">
          <strong dir="auto">@{account.username}</strong>
          <small className="connected-account-status">{copy.status}</small>
        </div>
        <span className="connected-account-arrow" aria-hidden="true">
          ↗
        </span>
        {isLoading && (
          <>
            <span className="profile-avatar skeleton-bar" />
            <div className="connected-account-text-placeholder">
              <span className="skeleton-bar skeleton-label" />
              <span className="skeleton-bar skeleton-caption" />
            </div>
          </>
        )}
      </a>
      <button
        type="button"
        className="primary-button"
        disabled={disabled || isLoading}
        onClick={onCompare}
      >
        {isLoading ? messages.comparing : copy.refresh}
      </button>
    </div>
  );
}

export function AccountLookupFallback({
  messages,
  onRetry,
}: {
  messages: Messages;
  onRetry: () => Promise<unknown> | undefined;
}) {
  const [checking, setChecking] = useState(false);

  async function retry() {
    setChecking(true);
    try {
      await onRetry();
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="account-lookup-fallback">
      <p role="status">{messages.connectedAccount.missing}</p>
      <button
        type="button"
        className="secondary-button"
        disabled={checking}
        onClick={() => void retry()}
      >
        {checking ? messages.connection.checking : messages.connectedAccount.retry}
      </button>
    </div>
  );
}
