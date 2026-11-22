import { useLayoutEffect, useRef, useState } from 'react';

import { getConnectorExtensionId } from '@duofollow/src/api/extension/connectorConfig';
import { DuoFollowConnector } from '@duofollow/src/api/extension/DuoFollowConnector';
import { useConnectorStatus } from '@duofollow/src/connection/useConnectorStatus';
import { useFollowingComparison } from '@duofollow/src/following/useFollowingComparison';
import { useUnfollow } from '@duofollow/src/following/useUnfollow';
import { useNotifications } from '@duofollow/src/notifications';

import type { Locale } from '@duofollow/extension/src/locales';

const connector = new DuoFollowConnector(getConnectorExtensionId());

/**
 * Coordinates connection status, comparison, unfollow actions, and notifications.
 * Keep this hook mounted in the shared layout so navigation preserves comparison state.
 * Revoking access clears the stored account and results.
 */
export function useWorkspace(locale: Locale, workspaceVisible: boolean) {
  const {
    status: connectionStatus,
    revision,
    refreshConnection,
    quickUnfollowUpdate,
    sessionUserId,
    account,
  } = useConnectorStatus(connector, workspaceVisible);
  const sessionChanged = connectionStatus === 'session-changed';
  const status = sessionChanged ? 'checking' : connectionStatus;
  const previousSessionId = useRef<number | undefined>(undefined);
  const comparedSessionId = useRef<number | undefined>(undefined);
  const hadReadySession = useRef(false);
  const [dismissedRevision, setDismissedRevision] = useState<number | null>(null);
  const isReady = status === 'ready';
  const issue = status === 'checking' || status === 'ready' ? null : status;
  const {
    visible: notifications,
    notify,
    dismiss,
    dismissGroup,
    clear: clearNotifications,
  } = useNotifications();
  const {
    activity,
    accountUsername,
    setAccountUsername,
    compareFollowing,
    resetComparison,
    isLoading,
    comparison: previousComparison,
    removeSubscription,
    followingList,
  } = useFollowingComparison(connector, notify, {
    enabled: workspaceVisible && isReady,
    locale,
    workspaceVisible,
    activeAccountId: account?.userId,
  });
  const consentRequired = status === 'consent-required';
  const sessionEnded = consentRequired || status === 'signed-out' || sessionChanged;
  const comparison = sessionEnded ? null : previousComparison;
  const {
    confirmation,
    askToUnfollow,
    cancelUnfollow,
    clearUnfollow,
    confirmUnfollow,
    finishUnfollow,
    unfollowingId,
    removingId,
  } = useUnfollow({
    activity,
    account: comparison?.accountUsername,
    connector,
    quickUnfollowUpdate,
    enabled: workspaceVisible && isReady,
    notify,
    removeSubscription,
    locale,
  });

  useLayoutEffect(() => {
    if (!workspaceVisible) dismissGroup('comparison', ['info', 'success']);
  }, [dismissGroup, workspaceVisible]);

  useLayoutEffect(() => {
    if (isReady) hadReadySession.current = true;
    if (sessionEnded) {
      if (!consentRequired && !sessionChanged && !hadReadySession.current) return;
      hadReadySession.current = false;
      previousSessionId.current = undefined;
      comparedSessionId.current = undefined;
      clearUnfollow();
      resetComparison();
      clearNotifications();
      return;
    }
    if (sessionUserId === undefined) return;

    const switched =
      previousSessionId.current !== undefined && previousSessionId.current !== sessionUserId;
    previousSessionId.current = sessionUserId;
    if (switched) comparedSessionId.current = undefined;
    const autoCompare = account && comparedSessionId.current !== account.userId;
    if (!switched && !autoCompare) return;

    comparedSessionId.current = account?.userId;
    clearUnfollow();
    resetComparison(account ?? undefined);
    clearNotifications();
  }, [
    account,
    clearNotifications,
    clearUnfollow,
    consentRequired,
    isReady,
    resetComparison,
    sessionChanged,
    sessionEnded,
    sessionUserId,
  ]);

  return {
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
    compareFollowing: () => compareFollowing(account ?? undefined),
    connectedAccount: account,
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
  };
}

export type WorkspaceState = ReturnType<typeof useWorkspace>;
