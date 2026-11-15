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
import type { Locale } from '../../extension/src/locales';
import { localizedError, translations } from '../i18n/messages';
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
  {
    enabled,
    locale,
    workspaceVisible,
  }: { enabled: boolean; locale: Locale; workspaceVisible: boolean },
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
  const quietRequest = useRef<ComparisonRequest | null>(null);

  useLayoutEffect(() => {
    if (!workspaceVisible && pendingRequest.current) {
      quietRequest.current = pendingRequest.current.request;
    }
  }, [workspaceVisible]);

  useLayoutEffect(() => {
    if (request === null && activity.current?.kind === 'comparison') activity.current = null;
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const messages = translations[locale];
    const copy = messages.notifications;

    let active = true;
    let pending = pendingRequest.current;
    if (pending?.request !== request) {
      if (!enabled) return;

      notify({
        group: 'comparison',
        kind: 'info',
        title: copy.comparing,
        message: copy.loadingAccount(request.username),
      });
      pending = { request, result: connector.getFollowingSummary(request.username) };
      pendingRequest.current = pending;
    }

    function reportError(message: string) {
      notify({
        group: 'comparison',
        kind: 'error',
        title: copy.compareError,
        message: localizedError(locale, message, copy.checkAccount),
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
        if (quietRequest.current === request) return;

        const { format } = new Intl.NumberFormat(locale);
        notify({
          group: 'comparison',
          kind: 'success',
          title: copy.complete,
          message: `@${data.accountUsername} · ${messages.checkedCount(format(data.checkedFollowing), format(data.totalFollowing))}`,
        });
      },
      (error: unknown) => {
        if (!finishRequest()) return;
        reportError(error instanceof Error ? error.message : '');
      },
    );

    return () => {
      active = false;
    };
  }, [activity, connector, enabled, locale, notify, request]);

  function compareFollowing() {
    const username = accountUsername.trim();
    if (!enabled || !username || activity.current !== null) return;

    const next: ComparisonRequest = { kind: 'comparison', username };
    activity.current = next;
    setRequest(next);
  }

  const clearComparison = useCallback(() => {
    if (activity.current?.kind === 'comparison') activity.current = null;
    pendingRequest.current = null;
    quietRequest.current = null;
    setRequest(null);
    setComparison(null);
    setAccountUsername('');
    setNonMutualQuery('');
    try {
      window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
    } catch {
      // Браузер может блокировать доступ к хранилищу.
    }
  }, []);

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
    clearComparison,
    isLoading: enabled && request !== null,
    comparison,
    activity,
    removeSubscription,
    nonMutualQuery,
    setNonMutualQuery,
    searchTerm,
    visibleNonMutual,
  };
}
