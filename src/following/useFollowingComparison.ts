import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ConnectorError,
  type ConnectorErrorCode,
} from '@duofollow/extension/src/dto/ConnectorError';
import { getProfileDisplayName } from '@duofollow/src/following/profiles';
import { localizedError, translations } from '@duofollow/src/i18n/messages';

import type {
  ComparedFollowingUser,
  FollowingComparison,
  FollowingComparisonResult,
} from '@duofollow/extension/src/dto/DuolingoFollowingDto';
import type { Locale } from '@duofollow/extension/src/locales';
import type { DuoFollowConnector } from '@duofollow/src/api/extension/DuoFollowConnector';
import type { NotificationInput } from '@duofollow/src/notifications';

type ComparisonRequest = { kind: 'comparison'; username: string };
export type FollowingActivity = RefObject<{ kind: 'comparison' | 'unfollow' } | null>;
export type FollowingSortOrder = 'received' | 'name-asc' | 'name-desc';
export type FollowingView = 'all' | 'mutual' | 'non-mutual';

const ACCOUNT_STORAGE_KEY = 'duofollow.accountUsername';
const EMPTY_USERS: ComparedFollowingUser[] = [];

function normalizeSearch(value: string) {
  return value.normalize('NFC').toLowerCase();
}

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
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<FollowingSortOrder>('received');
  const [view, setView] = useState<FollowingView>('non-mutual');
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

    function reportError(message: string, errorCode?: ConnectorErrorCode) {
      notify({
        group: 'comparison',
        kind: 'error',
        title: copy.compareError,
        message: localizedError(locale, message, copy.checkAccount, errorCode),
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
          reportError(response.error, response.errorCode);
          return;
        }

        const data = response.comparison;
        saveUsername(data.accountUsername);
        setComparison(data);
        setAccountUsername(data.accountUsername);
        setQuery('');
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
        reportError(
          error instanceof Error ? error.message : '',
          error instanceof ConnectorError ? error.errorCode : undefined,
        );
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
    setQuery('');
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
        following: previous.following?.filter((user) => user.userId !== userId),
      };
    });
  }, []);

  const following = comparison?.following;
  const nonMutualFollowing = comparison?.nonMutualFollowing;
  const canShowNonMutual = nonMutualFollowing != null;
  const activeView = !following
    ? 'non-mutual'
    : !canShowNonMutual && view === 'non-mutual'
      ? 'all'
      : view;
  const viewUsers = useMemo(() => {
    if (following) {
      return activeView === 'all'
        ? following
        : following.filter(({ relationship }) => relationship === activeView);
    }
    return (
      nonMutualFollowing?.map((user): ComparedFollowingUser => ({
        ...user,
        relationship: 'non-mutual',
      })) ?? EMPTY_USERS
    );
  }, [activeView, following, nonMutualFollowing]);
  const orderedUsers = useMemo(() => {
    if (sort === 'received' || viewUsers.length < 2) return viewUsers;

    const { compare } = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
    const userLabel = translations[locale].user;
    const direction = sort === 'name-asc' ? 1 : -1;
    return [...viewUsers].sort(
      (left, right) =>
        direction *
        (compare(getProfileDisplayName(left, userLabel), getProfileDisplayName(right, userLabel)) ||
          compare(left.username, right.username)),
    );
  }, [locale, viewUsers, sort]);
  const searchTerm = normalizeSearch(query.trim().replace(/^@/, ''));
  const visibleFollowing = useMemo(() => {
    if (!searchTerm) return orderedUsers;

    return orderedUsers.filter(
      ({ displayName, username }) =>
        normalizeSearch(displayName).includes(searchTerm) ||
        normalizeSearch(username).includes(searchTerm),
    );
  }, [orderedUsers, searchTerm]);

  return {
    accountUsername,
    setAccountUsername,
    compareFollowing,
    clearComparison,
    isLoading: enabled && request !== null,
    comparison,
    activity,
    removeSubscription,
    followingList: {
      activeView,
      setView,
      hasFullView: following !== undefined,
      canShowNonMutual,
      total: viewUsers.length,
      query,
      setQuery,
      sort,
      setSort,
      searchTerm,
      users: visibleFollowing,
    },
  };
}
