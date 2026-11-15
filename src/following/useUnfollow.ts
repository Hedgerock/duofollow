import { useCallback, useEffect, useState } from 'react';
import type { NonMutualFollowingUser } from '../../extension/src/dto/DuolingoFollowingDto';
import type { DuoFollowConnector } from '../api/extension/DuoFollowConnector';
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
  notify: (input: NotificationInput) => void;
  removeSubscription: (account: string, userId: number) => void;
}

export function useUnfollow({
  activity,
  account,
  connector,
  notify,
  removeSubscription,
}: UnfollowOptions) {
  const [action, setAction] = useState<UnfollowAction | null>(null);

  useEffect(
    () => () => {
      if (activity.current?.kind === 'unfollow') activity.current = null;
    },
    [activity],
  );

  const askToUnfollow = useCallback(
    (user: NonMutualFollowingUser) => {
      if (!account || activity.current !== null) return;

      const next: UnfollowAction = { kind: 'unfollow', account, user, phase: 'confirming' };
      activity.current = next;
      setAction(next);
    },
    [account, activity],
  );

  const closeAction = useCallback(
    (current: UnfollowAction) => {
      activity.current = null;
      // Keep the profile in the dialog until its closing transition ends.
      setAction({ ...current, phase: 'closed' });
    },
    [activity],
  );

  function cancelUnfollow() {
    if (action?.phase === 'confirming' && activity.current === action) closeAction(action);
  }

  async function confirmUnfollow() {
    if (action?.phase !== 'confirming' || activity.current !== action) return;

    const pending: UnfollowAction = { ...action, phase: 'requesting' };
    activity.current = pending;
    setAction(pending);

    const { user } = pending;
    const group = `unfollow:${user.userId}`;
    try {
      const result = await connector.unfollow(pending.account, user.userId);
      if (activity.current !== pending) return;
      if (!result.success) throw new Error(result.error);

      const removing: UnfollowAction = { ...pending, phase: 'removing' };
      activity.current = removing;
      setAction(removing);
      const identifier = getProfileIdentifier(user);
      const target = user.username
        ? identifier
        : `${user.displayName || 'Пользователь'} (${identifier})`;
      notify({ group, kind: 'success', title: 'Подписка удалена', message: target });
    } catch (error) {
      if (activity.current !== pending) return;
      closeAction(pending);
      const details = error instanceof Error ? error.message : '';
      notify({
        group,
        kind: 'error',
        title: 'Не удалось подтвердить отписку',
        message: [details, 'Сравни подписки перед повторной попыткой.'].filter(Boolean).join(' '),
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
      open: action.phase === 'confirming',
    },
    unfollowingId:
      action?.phase === 'requesting' || action?.phase === 'removing' ? action.user.userId : null,
    removingId: removing?.user.userId ?? null,
    askToUnfollow,
    cancelUnfollow,
    confirmUnfollow,
    finishUnfollow,
  };
}
