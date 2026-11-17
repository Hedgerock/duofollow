import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  ConnectorError,
  getConnectorErrorDetails,
  isConnectorErrorCode,
} from '@duofollow/extension/src/dto/ConnectorError';
import { isConnectorFailure } from '@duofollow/extension/src/dto/ConnectorResult';
import { getProfileIdentifier } from '@duofollow/src/following/profiles';
import { localizedError, translations } from '@duofollow/src/i18n/messages';

import type { NonMutualFollowingUser } from '@duofollow/extension/src/dto/DuolingoFollowingDto';
import type { Locale } from '@duofollow/extension/src/locales';
import type { DuoFollowConnector } from '@duofollow/src/api/extension/DuoFollowConnector';
import type { FollowingActivity } from '@duofollow/src/following/useFollowingComparison';
import type { NotificationInput } from '@duofollow/src/notifications';

type UnfollowAction = {
  kind: 'unfollow';
  account: string;
  user: NonMutualFollowingUser;
  phase: 'checking-preference' | 'confirming' | 'requesting' | 'removing' | 'closed';
};

interface UnfollowOptions {
  activity: FollowingActivity;
  account: string | undefined;
  connector: Pick<DuoFollowConnector, 'getQuickUnfollowPreference' | 'unfollow'>;
  enabled: boolean;
  notify: (input: NotificationInput) => void;
  removeSubscription: (account: string, userId: number) => void;
  locale: Locale;
}

export function useUnfollow({
  activity,
  account,
  connector,
  enabled,
  notify,
  removeSubscription,
  locale,
}: UnfollowOptions) {
  const [action, setAction] = useState<UnfollowAction | null>(null);
  const currentLocale = useRef(locale);

  useLayoutEffect(() => {
    currentLocale.current = locale;
  }, [locale]);

  useEffect(
    () => () => {
      if (activity.current?.kind === 'unfollow') activity.current = null;
    },
    [activity],
  );

  const closeAction = useCallback(
    (current: UnfollowAction) => {
      activity.current = null;
      // Keep the profile in the dialog until its closing transition ends.
      setAction({ ...current, phase: 'closed' });
    },
    [activity],
  );

  const clearUnfollow = useCallback(() => {
    if (activity.current?.kind === 'unfollow') activity.current = null;
    setAction(null);
  }, [activity]);

  useLayoutEffect(() => {
    if (
      !enabled &&
      (action?.phase === 'checking-preference' || action?.phase === 'confirming') &&
      activity.current === action
    )
      closeAction(action);
  }, [action, activity, closeAction, enabled]);

  function cancelUnfollow() {
    if (action?.phase === 'confirming' && activity.current === action) closeAction(action);
  }

  const requestUnfollow = useCallback(
    async (current: UnfollowAction) => {
      const pending: UnfollowAction = { ...current, phase: 'requesting' };
      activity.current = pending;
      setAction(pending);

      const { user } = pending;
      const group = `unfollow:${user.userId}`;
      try {
        const result = await connector.unfollow(pending.account, user.userId);
        if (activity.current !== pending) return;
        if (isConnectorFailure(result)) {
          if (isConnectorErrorCode(result.errorCode)) {
            throw new ConnectorError(result.errorCode, result.error);
          }
          throw new Error(result.error);
        }

        const removing: UnfollowAction = { ...pending, phase: 'removing' };
        activity.current = removing;
        setAction(removing);
        const identifier = getProfileIdentifier(user);
        const messages = translations[currentLocale.current];
        const target = user.username
          ? identifier
          : `${user.displayName || messages.user} (${identifier})`;
        notify({
          group,
          kind: 'success',
          title: messages.notifications.unfollowDone,
          message: target,
        });
      } catch (error) {
        if (activity.current !== pending) return;
        closeAction(pending);
        const { error: details, errorCode: code } = getConnectorErrorDetails(error);
        if (code === 'UNFOLLOW_CANCELLED') return;
        const needsComparison =
          !code || code === 'UNFOLLOW_UNCONFIRMED' || code === 'STILL_FOLLOWING';
        const copy = translations[currentLocale.current].notifications;
        notify({
          group,
          kind: 'error',
          title: copy.unfollowError,
          message: [
            localizedError(currentLocale.current, details, '', code),
            needsComparison ? copy.retryUnfollow : '',
          ]
            .filter(Boolean)
            .join(' '),
        });
      }
    },
    [activity, closeAction, connector, notify],
  );

  const askToUnfollow = useCallback(
    async (user: NonMutualFollowingUser) => {
      if (!enabled || !account || activity.current !== null) return;

      const checking: UnfollowAction = {
        kind: 'unfollow',
        account,
        user,
        phase: 'checking-preference',
      };
      activity.current = checking;
      setAction(checking);

      const quick = await connector.getQuickUnfollowPreference();
      if (activity.current !== checking) return;
      if (quick) return requestUnfollow(checking);

      const confirming: UnfollowAction = { ...checking, phase: 'confirming' };
      activity.current = confirming;
      setAction(confirming);
    },
    [account, activity, connector, enabled, requestUnfollow],
  );

  function confirmUnfollow() {
    if (enabled && action?.phase === 'confirming' && activity.current === action)
      return requestUnfollow(action);
  }

  const removing = action?.phase === 'removing' ? action : null;
  const finishUnfollow = useCallback(() => {
    if (!removing || activity.current !== removing) return;

    removeSubscription(removing.account, removing.user.userId);
    closeAction(removing);
  }, [removing, activity, closeAction, removeSubscription]);

  return {
    confirmation: action && {
      account: action.account,
      user: action.user,
      open: enabled && action.phase === 'confirming',
    },
    unfollowingId:
      action?.phase === 'checking-preference' ||
      action?.phase === 'requesting' ||
      action?.phase === 'removing'
        ? action.user.userId
        : null,
    removingId: removing?.user.userId ?? null,
    askToUnfollow,
    cancelUnfollow,
    clearUnfollow,
    confirmUnfollow,
    finishUnfollow,
  };
}
