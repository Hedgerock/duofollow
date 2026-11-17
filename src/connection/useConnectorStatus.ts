import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { ConnectorStatus } from '@duofollow/extension/src/dto/ConnectorSession';
import type { DuoFollowConnector } from '@duofollow/src/api/extension/DuoFollowConnector';

const CHECK_INTERVAL_MS = 20_000;
const RECHECK_DELAY_MS = 250;
type Status = ConnectorStatus | 'checking';

export function useConnectorStatus(
  connector: Pick<DuoFollowConnector, 'getConnectionStatus' | 'watchAccessChanges'>,
  workspaceVisible: boolean,
) {
  const [connection, setConnection] = useState<{ status: Status; revision: number }>({
    status: 'checking',
    revision: 0,
  });
  const [quickUnfollowUpdate, setQuickUnfollowUpdate] = useState<{ enabled: boolean } | null>(null);
  const lastStatus = useRef<Status>('checking');
  const mounted = useRef(false);
  const visible = useRef(workspaceVisible);
  const pending = useRef<Promise<ConnectorStatus | undefined> | null>(null);
  const needsCheck = useRef(true);
  const stopWatching = useRef<(() => void) | undefined>(undefined);

  const publishStatus = useCallback((status: Status) => {
    lastStatus.current = status;
    setConnection((previous) =>
      previous.status === status ? previous : { status, revision: previous.revision + 1 },
    );
  }, []);

  const refreshStatus = useCallback(() => {
    if (!mounted.current || !visible.current) return;
    if (pending.current) return pending.current;
    needsCheck.current = false;
    const check: Promise<ConnectorStatus | undefined> = connector
      .getConnectionStatus()
      .then(confirm, () => confirm('connector-unavailable'));
    pending.current = check;

    function isCurrent() {
      return mounted.current && pending.current === check;
    }

    function confirm(status: ConnectorStatus) {
      if (!isCurrent()) return;
      if (
        status !== 'connector-unavailable' ||
        lastStatus.current !== 'ready' ||
        !visible.current
      ) {
        return finish(status);
      }

      // Confirm a transport failure before replacing a previously verified connection.
      return new Promise<void>((resolve) => setTimeout(resolve, RECHECK_DELAY_MS)).then(() => {
        if (!isCurrent()) return;
        if (!visible.current) return finish(status);
        return connector.getConnectionStatus().then(finish, () => finish(status));
      });
    }

    function finish(status: ConnectorStatus) {
      if (!isCurrent()) return;
      pending.current = null;
      if (status === 'connector-unavailable' && !visible.current) {
        needsCheck.current = true;
        return;
      }
      publishStatus(status);
      return status;
    }

    return check;
  }, [connector, publishStatus]);

  const watchAccess = useCallback(() => {
    if (!mounted.current || !visible.current) return;

    // Keep the subscription during internal navigation. Only the workspace sends checks.
    stopWatching.current ??= connector.watchAccessChanges(
      (change) => {
        if (!mounted.current) return;
        if (change === 'disconnected') {
          stopWatching.current = undefined;
          setQuickUnfollowUpdate({ enabled: false });
          needsCheck.current = true;
          if (lastStatus.current === 'ready') {
            // Ignore any response from a check that started before the port closed.
            pending.current = null;
            if (document.visibilityState !== 'hidden') refreshStatus();
          }
          return;
        }
        pending.current = null;
        needsCheck.current = change === 'granted';
        publishStatus(change === 'granted' ? 'checking' : 'consent-required');
        if (needsCheck.current && document.visibilityState !== 'hidden') refreshStatus();
      },
      (enabled) => {
        if (mounted.current) setQuickUnfollowUpdate({ enabled });
      },
    );
  }, [connector, publishStatus, refreshStatus]);

  const refreshConnection = useCallback(() => {
    watchAccess();
    return refreshStatus();
  }, [refreshStatus, watchAccess]);

  useLayoutEffect(() => {
    visible.current = workspaceVisible;
  }, [workspaceVisible]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopWatching.current?.();
      stopWatching.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!workspaceVisible) return;
    const needsRefresh = needsCheck.current || !stopWatching.current;
    watchAccess();
    const checkVisible = () => {
      if (document.visibilityState !== 'hidden') refreshConnection();
    };
    if (needsRefresh) checkVisible();

    const timer = window.setInterval(checkVisible, CHECK_INTERVAL_MS);
    window.addEventListener('focus', checkVisible);
    document.addEventListener('visibilitychange', checkVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', checkVisible);
      document.removeEventListener('visibilitychange', checkVisible);
    };
  }, [refreshConnection, watchAccess, workspaceVisible]);

  return { ...connection, refreshConnection, quickUnfollowUpdate };
}
