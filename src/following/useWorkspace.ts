import { useLayoutEffect, useState } from 'react';
import type { Locale } from '../../extension/src/locales';
import { DuoFollowConnector } from '../api/extension/DuoFollowConnector';
import { useConnectorStatus } from '../connection/useConnectorStatus';
import { useNotifications } from '../notifications';
import { useFollowingComparison } from './useFollowingComparison';
import { useUnfollow } from './useUnfollow';

const connector = new DuoFollowConnector(import.meta.env.VITE_DUOFOLLOW_EXTENSION_ID);

export function useWorkspace(locale: Locale, workspaceVisible: boolean) {
  const { status, revision, refreshConnection } = useConnectorStatus(connector, workspaceVisible);
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
    clearComparison,
    isLoading,
    comparison: previousComparison,
    removeSubscription,
    nonMutualQuery,
    setNonMutualQuery,
    searchTerm,
    visibleNonMutual,
  } = useFollowingComparison(connector, notify, {
    enabled: workspaceVisible && isReady,
    locale,
    workspaceVisible,
  });
  const consentRequired = status === 'consent-required';
  const comparison = consentRequired ? null : previousComparison;
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
    enabled: workspaceVisible && isReady,
    notify,
    removeSubscription,
    locale,
  });
  const nonMutualFollowing = comparison?.nonMutualFollowing;

  useLayoutEffect(() => {
    if (!workspaceVisible) dismissGroup('comparison', ['info', 'success']);
  }, [dismissGroup, workspaceVisible]);

  useLayoutEffect(() => {
    if (!consentRequired) return;
    clearComparison();
    clearUnfollow();
    clearNotifications();
  }, [clearComparison, clearNotifications, clearUnfollow, consentRequired]);

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
  };
}

export type WorkspaceState = ReturnType<typeof useWorkspace>;
