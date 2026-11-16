import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ConnectorError, isConnectorErrorCode } from '../../extension/src/dto/ConnectorError';
import type { NonMutualFollowingUser } from '../../extension/src/dto/DuolingoFollowingDto';
import type { Locale } from '../../extension/src/locales';
import type { DuoFollowConnector } from '../api/extension/DuoFollowConnector';
import { localizedError, translations } from '../i18n/messages';
import type { NotificationInput } from '../notifications';
import type { FollowingActivity } from './useFollowingComparison';
import { getProfileIdentifier } from './profiles';

type UnfollowAction = {
  kind: 'unfollow';
  account: string;
  user: NonMutualFollowingUser;
  phase: 'confirming' | 'requesting' | 'removing' | 'closed';
};

interface UnfollowOptions {
  activity: FollowingActivity;
  account: string | undefined;
  connector: Pick<DuoFollowConnector, 'unfollow'>;
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

  const askToUnfollow = useCallback(
    (user: NonMutualFollowingUser) => {
      if (!enabled || !account || activity.current !== null) return;

      const next: UnfollowAction = { kind: 'unfollow', account, user, phase: 'confirming' };
      activity.current = next;
      setAction(next);
    },
    [account, activity, enabled],
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
    if (!enabled && action?.phase === 'confirming' && activity.current === action)
      closeAction(action);
  }, [action, activity, closeAction, enabled]);

  function cancelUnfollow() {
    if (action?.phase === 'confirming' && activity.current === action) closeAction(action);
  }

  async function confirmUnfollow() {
    if (!enabled || action?.phase !== 'confirming' || activity.current !== action) return;

    const pending: UnfollowAction = { ...action, phase: 'requesting' };
    activity.current = pending;
    setAction(pending);

    const { user } = pending;
    const group = `unfollow:${user.userId}`;
    try {
      const result = await connector.unfollow(pending.account, user.userId);
      if (activity.current !== pending) return;
      if (!result.success) {
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
      const details = error instanceof Error ? error.message : '';
      const code = error instanceof ConnectorError ? error.errorCode : undefined;
      const needsComparison = !code || code === 'UNFOLLOW_UNCONFIRMED';
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
      action?.phase === 'requesting' || action?.phase === 'removing' ? action.user.userId : null,
    removingId: removing?.user.userId ?? null,
    askToUnfollow,
    cancelUnfollow,
    clearUnfollow,
    confirmUnfollow,
    finishUnfollow,
  };
}
