import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type {
  FollowingComparison,
  FollowingComparisonResult,
  NonMutualFollowingUser,
} from '../../extension/src/dto/DuolingoFollowingDto';
import type { DuoFollowConnector } from '../api/extension/DuoFollowConnector';
import type { NotificationInput } from '../notifications';

type ComparisonRequest = { kind: 'comparison'; username: string };
export type FollowingActivity = RefObject<{ kind: 'comparison' | 'unfollow' } | null>;

const ACCOUNT_STORAGE_KEY = 'duofollow.accountUsername';
const EMPTY_USERS: NonMutualFollowingUser[] = [];

function readSavedUsername(): string {
  try {
    return window.localStorage.getItem(ACCOUNT_STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

function saveUsername(username: string): void {
  try {
    window.localStorage.setItem(ACCOUNT_STORAGE_KEY, username);
  } catch {
    // Браузер может блокировать доступ к хранилищу.
  }
}

export function useFollowingComparison(
  connector: Pick<DuoFollowConnector, 'getFollowingSummary'>,
  notify: (input: NotificationInput) => void,
) {
  const [accountUsername, setAccountUsername] = useState(readSavedUsername);
  const [request, setRequest] = useState<ComparisonRequest | null>(() =>
    accountUsername ? { kind: 'comparison', username: accountUsername } : null,
  );
  const [comparison, setComparison] = useState<FollowingComparison | null>(null);
  const [nonMutualQuery, setNonMutualQuery] = useState('');
  // React commits state asynchronously. Share ownership of the current operation between both hooks.
  const activity = useRef<FollowingActivity['current']>(request);
  const pendingRequest = useRef<{
    request: ComparisonRequest;
    result: Promise<FollowingComparisonResult>;
  } | null>(null);

  useLayoutEffect(() => {
    if (request === null && activity.current?.kind === 'comparison') activity.current = null;
  }, [request]);

  useEffect(() => {
    if (!request) return;

    let active = true;
    let pending = pendingRequest.current;
    if (pending?.request !== request) {
      notify({
        group: 'comparison',
        kind: 'info',
        title: 'Сравниваем подписки',
        message: `Загружаем данные для ${request.username}.`,
      });
      pending = { request, result: connector.getFollowingSummary(request.username) };
      pendingRequest.current = pending;
    }

    function reportError(message: string) {
      notify({
        group: 'comparison',
        kind: 'error',
        title: 'Не удалось сравнить подписки',
        message,
      });
    }

    function finishRequest() {
      if (!active || activity.current !== request) return false;

      pendingRequest.current = null;
      setRequest(null);
      return true;
    }

    void pending.result.then(
      (response) => {
        if (!finishRequest()) return;

        if (!response.success) {
          reportError(response.error);
          return;
        }

        const data = response.comparison;
        saveUsername(data.accountUsername);
        setComparison(data);
        setAccountUsername(data.accountUsername);
        setNonMutualQuery('');
        notify({
          group: 'comparison',
          kind: 'success',
          title: 'Сравнение завершено',
          message: `@${data.accountUsername} · проверено ${data.checkedFollowing} из ${data.totalFollowing} подписок.`,
        });
      },
      (error: unknown) => {
        if (!finishRequest()) return;
        reportError(error instanceof Error ? error.message : 'Не удалось связаться с расширением');
      },
    );

    return () => {
      active = false;
    };
  }, [activity, connector, notify, request]);

  function compareFollowing() {
    const username = accountUsername.trim();
    if (!username || activity.current !== null) return;

    const next: ComparisonRequest = { kind: 'comparison', username };
    activity.current = next;
    setRequest(next);
  }

  const removeSubscription = useCallback((account: string, userId: number) => {
    setComparison((previous) => {
      if (previous?.accountUsername !== account || !previous.nonMutualFollowing) return previous;

      const users = previous.nonMutualFollowing.filter((user) => user.userId !== userId);
      if (users.length === previous.nonMutualFollowing.length) return previous;

      return {
        ...previous,
        checkedFollowing: previous.checkedFollowing - 1,
        totalFollowing: Math.max(0, previous.totalFollowing - 1),
        nonMutualUsers: users.length,
        nonMutualFollowing: users,
      };
    });
  }, []);

  const nonMutualFollowing = comparison?.nonMutualFollowing;
  const searchTerm = nonMutualQuery.trim().replace(/^@/, '').toLowerCase();
  const visibleNonMutual = useMemo(() => {
    const users = nonMutualFollowing ?? EMPTY_USERS;
    if (!searchTerm) return users;

    return users.filter(
      ({ displayName, username }) =>
        displayName.toLowerCase().includes(searchTerm) ||
        username.toLowerCase().includes(searchTerm),
    );
  }, [nonMutualFollowing, searchTerm]);

  return {
    accountUsername,
    setAccountUsername,
    compareFollowing,
    isLoading: request !== null,
    comparison,
    activity,
    removeSubscription,
    nonMutualQuery,
    setNonMutualQuery,
    searchTerm,
    visibleNonMutual,
  };
}
