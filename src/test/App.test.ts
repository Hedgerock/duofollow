import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Workspace } from '@duofollow/src/App';
import { ConnectionDialog } from '@duofollow/src/ConnectionDialog';
import { CoverageDetails } from '@duofollow/src/following/CoverageDetails';
import { RelationshipLegend } from '@duofollow/src/following/RelationshipLegend';
import { useWorkspace } from '@duofollow/src/following/useWorkspace';
import { NotificationViewport } from '@duofollow/src/notifications';
import { ProfileAvatar } from '@duofollow/src/ProfileAvatar';
import { LanguageSelect, SiteHeader } from '@duofollow/src/SiteLayout';
import {
  createRenderer,
  findElement,
  findElements,
  renderChild,
  runEvent,
} from '@duofollow/src/test/reactHarness';
import { ThemeToggle } from '@duofollow/src/ThemeToggle';
import { UnfollowDialog } from '@duofollow/src/UnfollowDialog';
import { useSitePreferences } from '@duofollow/src/useSite';
import { VirtualFollowingList } from '@duofollow/src/VirtualFollowingList';

import type { ConnectorStatus } from '@duofollow/extension/src/dto/ConnectorSession';
import type {
  FollowingComparisonResult,
  UnfollowResult,
} from '@duofollow/extension/src/dto/DuolingoFollowingDto';
import type { AccessChange } from '@duofollow/src/api/extension/DuoFollowConnector';

const { getConnectionStatus, getFollowingSummary, getQuickUnfollowPreference, unfollow } =
  vi.hoisted(() => ({
    getConnectionStatus: vi.fn<() => Promise<ConnectorStatus>>(),
    getFollowingSummary: vi.fn<(username: string) => Promise<FollowingComparisonResult>>(),
    getQuickUnfollowPreference: vi.fn<() => Promise<boolean>>(),
    unfollow:
      vi.fn<(username: string, targetUserId: number, quick?: boolean) => Promise<UnfollowResult>>(),
  }));
let onAccessChanged: (change: AccessChange) => void;
let onQuickUnfollowChanged: (enabled: boolean) => void;

vi.mock('@duofollow/src/api/extension/DuoFollowConnector', () => ({
  DuoFollowConnector: class {
    getConnectionStatus = getConnectionStatus;
    getFollowingSummary = getFollowingSummary;
    getQuickUnfollowPreference = getQuickUnfollowPreference;
    unfollow = unfollow;
    openDuolingoSettings = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    watchAccessChanges(
      callback: (change: AccessChange) => void,
      quickUnfollow: (enabled: boolean) => void,
    ) {
      onAccessChanged = callback;
      onQuickUnfollowChanged = quickUnfollow;
      return () => {};
    }
  },
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  ...(await import('@duofollow/src/test/reactHarness')).mockHooks,
}));

function success(accountUsername: string, incomplete = false): FollowingComparisonResult {
  return {
    success: true,
    comparison: {
      accountUsername,
      checkedFollowing: 1,
      totalFollowing: 2,
      checkedFollowers: 0,
      totalFollowers: incomplete ? 1 : 0,
      mutualUsers: 0,
      nonMutualUsers: incomplete ? null : 1,
      nonMutualFollowing: incomplete
        ? null
        : [{ userId: 1, username: 'demo', displayName: 'Demo' }],
    },
  };
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function mountApp(saved?: string, blockStorage = false, browserLanguage = 'ru-RU') {
  let workspaceVisible = true;
  const storage = {
    getItem: vi.fn((key: string) => {
      if (blockStorage) throw new Error('Storage blocked');
      return key === 'duofollow.accountUsername' ? (saved ?? null) : null;
    }),
    setItem: vi.fn(() => {
      if (blockStorage) throw new Error('Storage blocked');
    }),
    removeItem: vi.fn(),
  };
  const windowEvents = new EventTarget();
  const visibilityEvents = new EventTarget();
  vi.stubGlobal('window', {
    localStorage: storage,
    navigator: { languages: [browserLanguage] },
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
  });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    documentElement: { lang: '' },
    addEventListener: visibilityEvents.addEventListener.bind(visibilityEvents),
    removeEventListener: visibilityEvents.removeEventListener.bind(visibilityEvents),
  });
  const renderer = createRenderer();
  const render = (strict = false) =>
    renderer.render(
      () => {
        const site = useSitePreferences();
        const workspace = useWorkspace(site.locale, workspaceVisible);
        return Workspace({ site, workspace });
      },
      { strict },
    );
  const notifications = () =>
    findElement(render(), (node) => node.type === NotificationViewport).props.notifications;
  return {
    renderer,
    render,
    storage,
    async connect(strict = false) {
      render(strict);
      await flush();
      render(strict);
    },
    focus: () => windowEvents.dispatchEvent(new Event('focus')),
    setWorkspaceVisible(visible: boolean) {
      workspaceVisible = visible;
      render();
    },
    connectionDialog: () => findElement(render(), (node) => node.type === ConnectionDialog),
    header: () => renderChild(findElement(render(), (node) => node.type === SiteHeader)),
    workspace: () => findElement(render(), (node) => node.type === 'main'),
    notifications,
    input: () => findElement(render(), (node) => node.props.id === 'duolingo-username'),
    list: () => findElement(render(), (node) => node.type === VirtualFollowingList),
    dialog: () => findElement(render(), (node) => node.type === UnfollowDialog),
    edit(value: string) {
      runEvent(
        findElement(render(), (node) => node.props.id === 'duolingo-username'),
        'onChange',
        { target: { value } },
      );
    },
    submit() {
      runEvent(
        findElement(render(), (node) => node.type === 'form'),
        'onSubmit',
        { preventDefault: vi.fn() },
      );
      render();
    },
  };
}

function visibleAccounts(tree: unknown) {
  const header = renderChild(findElement(tree, (node) => node.type === SiteHeader));
  return findElements(
    header,
    (node) => node.type === 'strong' && typeof node.props.title === 'string',
  )
    .map((node) => node.props.children)
    .flat()
    .filter((value) => typeof value === 'string');
}

beforeEach(() => {
  getConnectionStatus.mockResolvedValue('ready');
});

afterEach(() => {
  vi.useRealTimers();
  getConnectionStatus.mockReset();
  getFollowingSummary.mockReset();
  getQuickUnfollowPreference.mockReset().mockResolvedValue(false);
  unfollow.mockReset();
  vi.unstubAllGlobals();
});

describe('comparison screen', () => {
  it('defers the first connection check until the workspace is opened', async () => {
    const app = mountApp();
    app.setWorkspaceVisible(false);
    app.focus();
    await flush();
    expect(getConnectionStatus).not.toHaveBeenCalled();

    app.setWorkspaceVisible(true);
    await flush();
    expect(getConnectionStatus).toHaveBeenCalledOnce();
  });

  it('keeps the existing comparison and skips a connection check when leaving and returning', async () => {
    getFollowingSummary.mockResolvedValueOnce(success('Saved'));
    const app = mountApp('Saved');
    await app.connect();
    await flush();
    expect(app.notifications()).toMatchObject([{ group: 'comparison', kind: 'success' }]);
    app.edit('Draft');
    app.setWorkspaceVisible(false);
    app.focus();
    app.setWorkspaceVisible(true);
    await flush();

    expect(visibleAccounts(app.render()).join('')).toBe('@Saved');
    expect(app.input().props.value).toBe('Draft');
    expect(getFollowingSummary).toHaveBeenCalledExactlyOnceWith('Saved');
    expect(getConnectionStatus).toHaveBeenCalledOnce();
    expect(app.notifications()).toEqual([]);
  });

  it('rechecks on return when a status request failed on the privacy page', async () => {
    const app = mountApp();
    await app.connect();
    let finishCheck!: (status: ConnectorStatus) => void;
    getConnectionStatus.mockReturnValueOnce(
      new Promise((resolve) => {
        finishCheck = resolve;
      }),
    );
    app.focus();
    app.setWorkspaceVisible(false);
    finishCheck('connector-unavailable');
    await flush();
    expect(getConnectionStatus).toHaveBeenCalledTimes(2);

    app.setWorkspaceVisible(true);
    expect(app.workspace().props.inert).toBe(false);
    await flush();
    expect(getConnectionStatus).toHaveBeenCalledTimes(3);
    expect(app.workspace().props.inert).toBe(false);
  });

  it('confirms a connection failure after returning before showing a warning', async () => {
    vi.useFakeTimers();
    getFollowingSummary.mockResolvedValueOnce(success('Saved'));
    const app = mountApp('Saved');
    await app.connect();
    await flush();
    app.setWorkspaceVisible(false);
    onAccessChanged('disconnected');
    getConnectionStatus.mockResolvedValueOnce('connector-unavailable');

    app.setWorkspaceVisible(true);
    await flush();
    expect(getConnectionStatus).toHaveBeenCalledTimes(2);
    expect(app.workspace().props.inert).toBe(false);
    expect(findElements(app.render(), (node) => node.type === ConnectionDialog)).toEqual([]);

    await vi.advanceTimersByTimeAsync(500);
    expect(getConnectionStatus).toHaveBeenCalledTimes(3);
    expect(visibleAccounts(app.render()).join('')).toBe('@Saved');
    expect(getFollowingSummary).toHaveBeenCalledOnce();
    expect(app.notifications()).toEqual([]);
  });

  it('cancels a delayed confirmation when Duolingo access is revoked', async () => {
    vi.useFakeTimers();
    const app = mountApp();
    await app.connect();
    getConnectionStatus.mockResolvedValueOnce('connector-unavailable');
    app.focus();
    await flush();

    onAccessChanged('revoked');
    await vi.advanceTimersByTimeAsync(500);

    expect(getConnectionStatus).toHaveBeenCalledTimes(2);
    expect(app.connectionDialog().props.issue).toBe('consent-required');
    expect(app.workspace().props.inert).toBe(true);
  });

  it.each(['away', 'after returning'] as const)(
    'uses a comparison finished %s without a success notification',
    async (when) => {
      let complete!: (result: FollowingComparisonResult) => void;
      getFollowingSummary.mockReturnValueOnce(
        new Promise((resolve) => {
          complete = resolve;
        }),
      );
      const app = mountApp('Saved');
      await app.connect();
      expect(app.notifications()).toMatchObject([{ group: 'comparison', kind: 'info' }]);

      app.setWorkspaceVisible(false);
      if (when === 'after returning') app.setWorkspaceVisible(true);
      complete(success('Saved'));
      await flush();
      if (when === 'away') app.setWorkspaceVisible(true);

      expect(visibleAccounts(app.render()).join('')).toBe('@Saved');
      expect(getFollowingSummary).toHaveBeenCalledExactlyOnceWith('Saved');
      expect(app.notifications()).toEqual([]);
    },
  );

  it.each(['home', 'privacy'] as const)(
    'rechecks a disconnected Connector from %s and ignores the previous response',
    async (page) => {
      vi.useFakeTimers();
      const app = mountApp();
      await app.connect();
      expect(app.workspace().props.inert).toBe(false);

      let finishPreviousCheck!: (status: ConnectorStatus) => void;
      getConnectionStatus.mockReturnValueOnce(
        new Promise((resolve) => {
          finishPreviousCheck = resolve;
        }),
      );
      app.focus();
      if (page === 'privacy') app.setWorkspaceVisible(false);

      getConnectionStatus
        .mockResolvedValueOnce('connector-unavailable')
        .mockResolvedValueOnce('connector-unavailable');
      onAccessChanged('disconnected');

      if (page === 'privacy') {
        expect(getConnectionStatus).toHaveBeenCalledTimes(2);
        app.setWorkspaceVisible(true);
      }

      expect(getConnectionStatus).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(500);
      expect(getConnectionStatus).toHaveBeenCalledTimes(4);
      finishPreviousCheck('ready');
      await flush();

      expect(app.workspace().props.inert).toBe(true);
      expect(app.connectionDialog().props.issue).toBe('connector-unavailable');
      expect(getFollowingSummary).not.toHaveBeenCalled();
    },
  );

  it('checks once on return after a grant, and clears results on revocation without a new request', async () => {
    getConnectionStatus.mockResolvedValueOnce('consent-required');
    const app = mountApp();
    await app.connect();
    app.setWorkspaceVisible(false);
    onAccessChanged('granted');
    await flush();
    expect(getConnectionStatus).toHaveBeenCalledOnce();
    app.setWorkspaceVisible(true);
    await flush();
    expect(getConnectionStatus).toHaveBeenCalledTimes(2);
    expect(app.workspace().props.inert).toBe(false);

    getFollowingSummary.mockResolvedValueOnce(success('Learner'));
    app.edit('Learner');
    app.submit();
    await flush();
    app.setWorkspaceVisible(false);
    onAccessChanged('revoked');
    app.setWorkspaceVisible(true);
    await flush();
    expect(getConnectionStatus).toHaveBeenCalledTimes(2);
    expect(getFollowingSummary).toHaveBeenCalledOnce();
    expect(visibleAccounts(app.render())).toEqual([]);
    expect(app.workspace().props.inert).toBe(true);
    expect(app.storage.removeItem).toHaveBeenLastCalledWith('duofollow.accountUsername');
  });

  it('uses the browser language, saves changes and links to the localized public policy', async () => {
    getConnectionStatus.mockResolvedValue('consent-required');
    const app = mountApp(undefined, false, 'uk-UA');
    await app.connect();
    const languageSelect = () =>
      findElement(
        renderChild(findElement(app.header(), (node) => node.type === LanguageSelect)),
        (node) => node.type === 'select',
      );
    expect(languageSelect().props.value).toBe('uk');
    expect(document.documentElement.lang).toBe('uk');
    expect(app.connectionDialog().props.privacyHref).toBe('/privacy/uk/');

    runEvent(languageSelect(), 'onChange', { target: { value: 'en' } });
    expect(languageSelect().props.value).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(app.connectionDialog().props.privacyHref).toBe('/privacy/');
    expect(app.storage.setItem).toHaveBeenCalledWith('duofollow.language', 'en');
    expect(getConnectionStatus).toHaveBeenCalledOnce();
    expect(getFollowingSummary).not.toHaveBeenCalled();
  });

  it('blocks comparison before consent and clears saved and displayed data when access is revoked', async () => {
    getConnectionStatus.mockResolvedValueOnce('consent-required');
    getFollowingSummary.mockResolvedValueOnce(success('Learner'));
    const app = mountApp('Saved');
    await app.connect();
    expect(app.connectionDialog().props).toMatchObject({ issue: 'consent-required', open: true });
    expect(app.workspace().props.inert).toBe(true);
    app.submit();
    expect(getFollowingSummary).not.toHaveBeenCalled();

    app.focus();
    await flush();
    app.edit('Learner');
    app.submit();
    await flush();
    expect(visibleAccounts(app.render()).join('')).toBe('@Learner');

    onAccessChanged('revoked');
    expect(app.workspace().props.inert).toBe(true);
    expect(visibleAccounts(app.render())).toEqual([]);
    expect(app.input().props.value).toBe('');
    expect(app.notifications()).toEqual([]);
    expect(app.storage.removeItem).toHaveBeenCalledWith('duofollow.accountUsername');
  });

  it('discards an old status and comparison response after an access revocation', async () => {
    let completeComparison!: (data: FollowingComparisonResult) => void;
    let completeCheck!: (status: ConnectorStatus) => void;
    getFollowingSummary.mockReturnValueOnce(
      new Promise((resolve) => {
        completeComparison = resolve;
      }),
    );
    const app = mountApp('Saved');
    await app.connect();
    getConnectionStatus.mockReturnValueOnce(
      new Promise((resolve) => {
        completeCheck = resolve;
      }),
    );
    app.focus();
    onAccessChanged('revoked');
    app.render();
    completeComparison(success('Saved'));
    completeCheck('ready');
    await flush();
    expect(app.connectionDialog().props.issue).toBe('consent-required');
    expect(app.input().props.value).toBe('');
    expect(app.storage.setItem).not.toHaveBeenCalled();
  });

  it('keeps the workspace locked after closing the warning and recovers automatically', async () => {
    getConnectionStatus
      .mockResolvedValueOnce('connector-unavailable')
      .mockResolvedValueOnce('connector-unavailable')
      .mockResolvedValueOnce('signed-out')
      .mockResolvedValueOnce('ready');
    getFollowingSummary.mockResolvedValueOnce(success('Saved'));
    const app = mountApp('Saved');
    await app.connect();

    expect(app.connectionDialog().props).toMatchObject({
      issue: 'connector-unavailable',
      open: true,
    });
    expect(app.workspace().props.inert).toBe(true);
    runEvent(app.connectionDialog(), 'onClose');
    expect(app.connectionDialog().props.open).toBe(false);
    app.submit();
    expect(getFollowingSummary).not.toHaveBeenCalled();

    app.focus();
    await flush();
    expect(app.connectionDialog().props.open).toBe(false);
    expect(app.workspace().props.inert).toBe(true);

    app.focus();
    await flush();
    expect(app.connectionDialog().props).toMatchObject({ issue: 'signed-out', open: true });
    runEvent(app.connectionDialog(), 'onRetry');
    await flush();
    expect(app.workspace().props.inert).toBe(false);
    expect(getFollowingSummary).toHaveBeenCalledExactlyOnceWith('Saved');
  });

  it('opens install help and reports an unchanged status after retrying a pending check', async () => {
    getConnectionStatus.mockResolvedValueOnce('connector-unavailable');
    const app = mountApp();
    await app.connect();
    const dialogRenderer = createRenderer();
    const renderDialog = () => {
      const dialog = app.connectionDialog();
      return dialogRenderer.render(() => renderChild(dialog));
    };
    const disclosure = () =>
      findElement(renderDialog(), (node) => node.props.className === 'connection-disclosure');
    const instructions = () =>
      findElement(renderDialog(), (node) => node.props.id === 'connection-install-instructions');
    const retry = () =>
      findElement(
        renderDialog(),
        (node) => node.type === 'button' && node.props['aria-busy'] !== undefined,
      );
    const feedback = () => findElement(renderDialog(), (node) => node.props.role === 'status');

    expect(disclosure().props['aria-expanded']).toBe(false);
    expect(instructions().props['aria-hidden']).toBe(true);
    runEvent(disclosure(), 'onClick');
    expect(disclosure().props['aria-expanded']).toBe(true);
    expect(instructions().props['aria-hidden']).toBe(false);

    let finishCheck!: (status: ConnectorStatus) => void;
    getConnectionStatus.mockReturnValueOnce(
      new Promise((resolve) => {
        finishCheck = resolve;
      }),
    );
    app.focus();
    runEvent(retry(), 'onClick');
    expect(retry().props).toMatchObject({ 'aria-disabled': true, children: 'Проверяем…' });
    runEvent(retry(), 'onClick');
    expect(getConnectionStatus).toHaveBeenCalledTimes(2);

    finishCheck('connector-unavailable');
    await flush();
    expect(retry().props).toMatchObject({ 'aria-disabled': false, children: 'Проверить снова' });
    expect(feedback().props.children).toBe('Подключение пока не восстановлено.');
    expect(app.workspace().props.inert).toBe(true);
  });

  it('keeps the site dialog and sends a quick request only after confirmation', async () => {
    getFollowingSummary.mockResolvedValueOnce(success('Saved'));
    getQuickUnfollowPreference.mockResolvedValueOnce(true);
    unfollow.mockResolvedValueOnce({
      success: false,
      errorCode: 'UNFOLLOW_CANCELLED',
      error: 'Cancelled',
    });
    const app = mountApp('Saved');
    await app.connect();
    await flush();
    const list = app.list();
    const [profile] = list.props.users as unknown[];

    runEvent(list, 'onUnfollow', profile);
    runEvent(list, 'onUnfollow', profile);
    await flush();
    expect(unfollow).not.toHaveBeenCalled();
    expect(app.dialog().props.confirmation).toMatchObject({ open: true, quick: true });
    runEvent(app.dialog(), 'onCancel');
    expect(unfollow).not.toHaveBeenCalled();

    getQuickUnfollowPreference.mockResolvedValueOnce(true);
    runEvent(app.list(), 'onUnfollow', profile);
    await flush();
    const confirmation = app.dialog();
    expect(confirmation.props.confirmation).toMatchObject({ open: true, quick: true });
    runEvent(confirmation, 'onConfirm');
    runEvent(confirmation, 'onConfirm');
    await flush();
    expect(unfollow).toHaveBeenCalledExactlyOnceWith('Saved', 1, true);
    expect(app.list().props.users).toHaveLength(1);

    runEvent(app.list(), 'onUnfollow', profile);
    await flush();
    expect(app.dialog().props.confirmation).toMatchObject({ open: true, quick: false });
    expect(unfollow).toHaveBeenCalledOnce();
  });

  it('updates the open dialog on quick unfollow changes and uses the latest mode', async () => {
    getFollowingSummary.mockResolvedValueOnce(success('Saved'));
    getQuickUnfollowPreference.mockResolvedValueOnce(true);
    unfollow.mockResolvedValueOnce({
      success: false,
      errorCode: 'UNFOLLOW_CANCELLED',
      error: 'Cancelled',
    });
    const app = mountApp('Saved');
    await app.connect();
    await flush();
    const list = app.list();
    const [profile] = list.props.users as unknown[];
    runEvent(list, 'onUnfollow', profile);
    await flush();
    expect(app.dialog().props.confirmation).toMatchObject({
      open: true,
      quick: true,
      user: profile,
    });

    onQuickUnfollowChanged(false);
    app.render();
    expect(app.dialog().props.confirmation).toMatchObject({
      open: true,
      quick: false,
      user: profile,
    });
    onQuickUnfollowChanged(true);
    app.render();
    expect(app.dialog().props.confirmation).toMatchObject({
      open: true,
      quick: true,
      user: profile,
    });
    onQuickUnfollowChanged(false);
    app.render();
    runEvent(app.dialog(), 'onConfirm');
    await flush();
    expect(unfollow).toHaveBeenCalledExactlyOnceWith('Saved', 1, false);
  });

  it('ignores a stale quick preference reply after receiving a newer port update', async () => {
    getFollowingSummary.mockResolvedValueOnce(success('Saved'));
    let finishRead!: (enabled: boolean) => void;
    getQuickUnfollowPreference.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    );
    const app = mountApp('Saved');
    await app.connect();
    await flush();
    const list = app.list();
    runEvent(list, 'onUnfollow', (list.props.users as unknown[])[0]);

    onQuickUnfollowChanged(false);
    app.render();
    finishRead(true);
    await flush();
    expect(app.dialog().props.confirmation).toMatchObject({ open: true, quick: false });
    expect(unfollow).not.toHaveBeenCalled();
  });

  it('ignores a quick unfollow setting reply received after access is revoked', async () => {
    getFollowingSummary.mockResolvedValueOnce(success('Saved'));
    let resolveSetting!: (enabled: boolean) => void;
    getQuickUnfollowPreference.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSetting = resolve;
      }),
    );
    const app = mountApp('Saved');
    await app.connect();
    await flush();
    const list = app.list();
    runEvent(list, 'onUnfollow', (list.props.users as unknown[])[0]);
    onAccessChanged('revoked');
    app.render();
    resolveSetting(true);
    await flush();
    expect(unfollow).not.toHaveBeenCalled();
  });

  it('closes an open unfollow confirmation when connection is lost', async () => {
    getConnectionStatus.mockResolvedValueOnce('ready').mockResolvedValueOnce('signed-out');
    getFollowingSummary.mockResolvedValueOnce(success('Saved'));
    const app = mountApp('Saved');
    await app.connect();
    await flush();
    const list = app.list();
    runEvent(list, 'onUnfollow', (list.props.users as unknown[])[0]);
    await flush();
    const confirmation = app.dialog();
    expect(confirmation.props.confirmation).toMatchObject({ open: true });

    app.focus();
    await flush();
    expect(app.dialog().props.confirmation).toMatchObject({ open: false });
    runEvent(confirmation, 'onConfirm');
    expect(unfollow).not.toHaveBeenCalled();
    expect(app.connectionDialog().props).toMatchObject({ issue: 'signed-out', open: true });
  });

  it('switches and saves the color theme while the workspace is locked', async () => {
    getConnectionStatus.mockResolvedValueOnce('signed-out');
    const app = mountApp();
    await app.connect();
    const toggle = findElement(app.header(), (node) => node.type === ThemeToggle);
    expect(toggle.props.theme).toBe('dark');
    runEvent(toggle, 'onToggle');
    expect(findElement(app.header(), (node) => node.type === ThemeToggle).props.theme).toBe(
      'light',
    );
    expect(app.storage.setItem).toHaveBeenCalledWith('duofollow.theme', 'light');
    expect(app.workspace().props.inert).toBe(true);
  });

  it('restores a saved account once through the StrictMode effect cycle', async () => {
    let complete!: (result: FollowingComparisonResult) => void;
    getFollowingSummary.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const app = mountApp('Saved');
    await app.connect(true);
    expect(app.input().props.value).toBe('Saved');
    expect(getConnectionStatus).toHaveBeenCalledTimes(1);
    expect(getFollowingSummary).toHaveBeenCalledExactlyOnceWith('Saved');
    expect(app.notifications()).toMatchObject([{ kind: 'info' }]);
    expect(findElement(app.render(), (node) => node.props['aria-busy'] === true)).toBeDefined();
    complete(success('Saved'));
    await flush();
    expect(app.notifications()).toMatchObject([{ kind: 'success' }]);
    expect(app.storage.setItem).toHaveBeenCalledWith('duofollow.accountUsername', 'Saved');
    expect(visibleAccounts(app.render())).toContain('Saved');
  });

  it.each([
    ['en-US', 'Duolingo is limiting requests. Wait before trying again.'],
    ['uk-UA', 'Duolingo обмежив частоту запитів. Зачекай перед повторною спробою.'],
    ['ru-RU', 'Duolingo ограничил частоту запросов. Подожди перед повторной попыткой.'],
  ])('shows the localized rate limit for %s instead of worker details', async (locale, message) => {
    getFollowingSummary.mockResolvedValueOnce({
      success: false,
      error: 'HTTP 429',
      errorCode: 'RATE_LIMITED',
    });
    const app = mountApp(undefined, false, locale);
    await app.connect();
    app.edit('Learner');
    app.submit();
    await flush();
    expect(app.notifications()).toMatchObject([{ kind: 'error', message }]);
  });

  it('preserves the current result when editing or when the next submission fails', async () => {
    getFollowingSummary
      .mockResolvedValueOnce(success('First'))
      .mockResolvedValueOnce({ success: false, error: 'HTTP 403' })
      .mockResolvedValueOnce(success('Second'));
    const app = mountApp();
    await app.connect();
    app.submit();
    expect(getFollowingSummary).not.toHaveBeenCalled();
    app.edit('  First  ');
    expect(getFollowingSummary).not.toHaveBeenCalled();
    app.submit();
    expect(getFollowingSummary).toHaveBeenLastCalledWith('First');
    await flush();
    app.edit('Second');
    expect(getFollowingSummary).toHaveBeenCalledTimes(1);
    expect(visibleAccounts(app.render())).toContain('First');
    app.submit();
    expect(visibleAccounts(app.render())).toContain('First');
    await flush();
    expect(app.notifications()).toMatchObject([{ kind: 'error', message: 'HTTP 403' }]);
    expect(visibleAccounts(app.render())).toContain('First');
    expect(app.storage.setItem).toHaveBeenCalledTimes(1);
    app.submit();
    await flush();
    expect(visibleAccounts(app.render())).toContain('Second');
    expect(app.storage.setItem).toHaveBeenLastCalledWith('duofollow.accountUsername', 'Second');
  });

  it('links the compared profile in the header and shows its picture', async () => {
    const data = success('Saved');
    if (!data.success) throw new Error('Expected a successful comparison fixture');
    data.comparison.accountPicture = 'https://simg-ssl.duolingo.com/avatar/example/medium';
    getFollowingSummary.mockResolvedValueOnce(data);
    const app = mountApp('Saved');
    await app.connect();
    await flush();
    app.edit('Draft');

    const link = findElement(app.header(), (node) => node.props.className === 'topbar-profile');
    expect(link.type).toBe('a');
    expect(link.props).toMatchObject({
      href: 'https://www.duolingo.com/profile/Saved',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    expect(findElement(link, (node) => node.type === ProfileAvatar).props).toMatchObject({
      name: 'Saved',
      picture: data.comparison.accountPicture,
    });
  });

  it('reports messaging rejection and still works when browser storage is unavailable', async () => {
    getFollowingSummary
      .mockRejectedValueOnce(new Error('Channel closed'))
      .mockResolvedValueOnce(success('Manual', true));
    const app = mountApp('Ignored', true);
    await app.connect(true);
    expect(getFollowingSummary).not.toHaveBeenCalled();
    app.edit('Manual');
    app.submit();
    await flush();
    expect(app.notifications()).toMatchObject([{ kind: 'error', message: 'Channel closed' }]);
    app.submit();
    await flush();
    expect(app.notifications()).toMatchObject([{ kind: 'success' }]);
    expect(visibleAccounts(app.render())).toContain('Manual');
    expect(
      findElements(app.render(), (node) => node.props.id === 'non-mutual-following-title'),
    ).toEqual([]);
  });

  it.each([false, true])(
    'shows followers coverage with incomplete data set to %s',
    async (incomplete) => {
      const data = success('Saved', incomplete);
      if (!data.success) throw new Error('Expected a successful comparison fixture');
      data.comparison.checkedFollowers = incomplete ? 3 : 8;
      data.comparison.totalFollowers = 8;
      getFollowingSummary.mockResolvedValueOnce(data);
      const app = mountApp('Saved');
      await app.connect();
      await flush();

      const tree = app.render();
      const [follows, followers, mutual, nonMutual] = findElements(
        tree,
        (node) => node.type === 'article',
      );
      expect(findElement(follows, (node) => node.type === 'strong').props.children).toBe('1');
      expect(findElement(followers, (node) => node.type === 'strong').props.children).toBe(
        incomplete ? '3' : '8',
      );
      const followersTotal = findElement(followers, (node) => node.type === CoverageDetails);
      expect(followersTotal.props.total).toBe('из 8');
      expect(findElement(mutual, (node) => node.type === 'small').props.children).toBe(
        incomplete ? 'подтверждено' : 'среди проверенных',
      );
      expect(findElement(nonMutual, (node) => node.type === 'strong').props.children).toBe(
        incomplete ? '—' : '1',
      );
      expect(
        findElements(tree, (node) => node.props.className === 'comparison-coverage-note'),
      ).toHaveLength(incomplete ? 1 : 0);
      expect(findElements(tree, (node) => node.type === VirtualFollowingList)).toHaveLength(
        incomplete ? 0 : 1,
      );
    },
  );

  it.each([false, true])(
    'switches received profiles with incomplete followers set to %s',
    async (incomplete) => {
      const data = success('Saved', incomplete);
      if (!data.success) throw new Error('Expected a successful comparison fixture');
      const arabic = { userId: 1, displayName: 'ا\u0654حمد', username: 'ahmad' };
      data.comparison.nonMutualFollowing = incomplete ? null : [arabic];
      data.comparison.following = [
        { ...arabic, relationship: incomplete ? 'unknown' : 'non-mutual' },
        { userId: 2, displayName: 'セリーナ', username: 'selina', relationship: 'mutual' },
      ];
      data.comparison.checkedFollowing = 2;
      data.comparison.mutualUsers = 1;
      getFollowingSummary.mockResolvedValueOnce(data);
      const app = mountApp('Saved');
      await app.connect();
      await flush();

      const viewButton = (label: string) =>
        findElement(
          app.render(),
          (node) => node.type === 'button' && node.props.children === label,
        );
      const selectView = (label: string) => runEvent(viewButton(label), 'onClick');
      const shown = () =>
        (app.list().props.users as { userId: number; relationship: string }[]).map(
          ({ userId, relationship }) => [userId, relationship],
        );
      expect(viewButton('Невзаимные').props.disabled).toBe(incomplete);
      selectView('Все полученные');
      expect(app.list().props.showRelationships).toBe(true);
      expect(shown()).toEqual([
        [1, incomplete ? 'unknown' : 'non-mutual'],
        [2, 'mutual'],
      ]);
      const legend = findElement(app.render(), (node) => node.type === RelationshipLegend);
      expect(legend.props.relationships).toEqual(['mutual', incomplete ? 'unknown' : 'non-mutual']);
      const search = findElement(app.render(), (node) => node.props.type === 'search');
      runEvent(search, 'onChange', { target: { value: 'أحمد' } });
      expect(shown()).toEqual([[1, incomplete ? 'unknown' : 'non-mutual']]);
      runEvent(search, 'onChange', { target: { value: 'セリ' } });
      selectView('Взаимные');
      expect(shown()).toEqual([[2, 'mutual']]);
      expect(getFollowingSummary).toHaveBeenCalledOnce();
    },
  );

  it('sorts the visible profiles by name while preserving search and source order', async () => {
    const data = success('Saved');
    if (!data.success) throw new Error('Expected a successful comparison fixture');
    data.comparison.checkedFollowing = 3;
    data.comparison.totalFollowing = 3;
    data.comparison.nonMutualUsers = 3;
    data.comparison.nonMutualFollowing = [
      { userId: 1, displayName: 'Zebra', username: 'zebra' },
      { userId: 2, displayName: 'Alpha10', username: 'alpha10' },
      { userId: 3, displayName: '', username: 'alpha2' },
    ];
    getFollowingSummary.mockResolvedValueOnce(data);
    const app = mountApp('Saved');
    await app.connect();
    await flush();
    const visibleOrder = () =>
      (app.list().props.users as { userId: number }[]).map(({ userId }) => userId);
    const sort = (value: string) => {
      const control = findElement(
        app.render(),
        (node) => node.props.className === 'following-sort',
      );
      runEvent(control, 'onChange', { currentTarget: { value } });
    };
    const search = findElement(app.render(), (node) => node.props.type === 'search');
    expect(visibleOrder()).toEqual([1, 2, 3]);
    const initialView = app.list().props.viewKey;

    sort('name-asc');
    expect(visibleOrder()).toEqual([3, 2, 1]);
    expect(app.list().props.viewKey).not.toBe(initialView);
    runEvent(search, 'onChange', { target: { value: '@alpha' } });
    expect(visibleOrder()).toEqual([3, 2]);

    sort('name-desc');
    expect(visibleOrder()).toEqual([2, 3]);
    expect(findElement(app.render(), (node) => node.props.type === 'search').props.value).toBe(
      '@alpha',
    );
    runEvent(search, 'onChange', { target: { value: '' } });
    expect(visibleOrder()).toEqual([1, 2, 3]);
    sort('received');
    expect(visibleOrder()).toEqual([1, 2, 3]);
    expect(data.comparison.nonMutualFollowing.map(({ userId }) => userId)).toEqual([1, 2, 3]);
    expect(getFollowingSummary).toHaveBeenCalledOnce();
  });

  it('filters by case-insensitive display name or @username without requesting data again', async () => {
    getFollowingSummary.mockResolvedValueOnce(success('Saved'));
    const app = mountApp('Saved');
    await app.connect();
    await flush();
    for (const query of [' dEmO ', '@DEMO', 'unknown', '']) {
      const search = findElement(app.render(), (node) => node.props.type === 'search');
      runEvent(search, 'onChange', { target: { value: query } });
      const list = findElement(app.render(), (node) => node.type === VirtualFollowingList);
      expect(list.props.users).toHaveLength(query === 'unknown' ? 0 : 1);
    }
    expect(getFollowingSummary).toHaveBeenCalledTimes(1);
  });

  it('ignores a comparison that finishes after the screen has unmounted', async () => {
    let resolve!: (value: FollowingComparisonResult) => void;
    getFollowingSummary.mockReturnValueOnce(
      new Promise((complete) => {
        resolve = complete;
      }),
    );
    const app = mountApp('Saved');
    await app.connect();
    app.renderer.unmount();
    resolve(success('Saved'));
    await flush();
    expect(app.storage.setItem).not.toHaveBeenCalled();
  });

  it('replays the skeleton on each submission and restores the previous list after an error', async () => {
    let complete!: (result: FollowingComparisonResult) => void;
    getFollowingSummary
      .mockReturnValueOnce(
        new Promise((resolve) => {
          complete = resolve;
        }),
      )
      .mockResolvedValueOnce({ success: false, error: 'HTTP 403' })
      .mockResolvedValueOnce(success('Saved'));
    const app = mountApp('Saved');
    const skeletons = () =>
      findElements(
        app.render(),
        (node) => typeof node.type === 'function' && node.type.name === 'ComparisonSkeleton',
      );
    const content = () =>
      findElement(app.render(), (node) => node.props.className === 'comparison-content');
    const list = () => findElement(app.render(), (node) => node.type === VirtualFollowingList);

    await app.connect();
    expect(skeletons()).toHaveLength(1);
    expect(
      findElement(
        renderChild(skeletons()[0]),
        (node) => node.props.className === 'comparison-skeleton',
      ).props.inert,
    ).toBe(true);
    complete(success('Saved'));
    await flush();
    expect(skeletons()).toHaveLength(0);
    const previousUsers = list().props.users;

    app.submit();
    expect(skeletons()).toHaveLength(1);
    expect(content().props).toMatchObject({ 'aria-hidden': true, inert: true });
    expect(list().props.users).toBe(previousUsers);
    await flush();
    expect(skeletons()).toHaveLength(0);
    expect(content().props.inert).toBe(false);
    expect(list().props.users).toBe(previousUsers);

    app.submit();
    expect(skeletons()).toHaveLength(1);
    await flush();
    expect(skeletons()).toHaveLength(0);
    expect(list().props.users).not.toBe(previousUsers);
  });

  it('blocks stale handlers while the new comparison is pending and until its result is committed', async () => {
    getFollowingSummary.mockResolvedValueOnce(success('Saved'));
    let complete!: (result: FollowingComparisonResult) => void;
    getFollowingSummary.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const app = mountApp('Saved');
    await app.connect();
    await flush();
    app.edit('Next');
    const form = findElement(app.render(), (node) => node.type === 'form');
    const list = app.list();
    const [user] = list.props.users as unknown[];
    const submit = () => runEvent(form, 'onSubmit', { preventDefault: vi.fn() });
    submit();
    app.render();

    submit();
    runEvent(list, 'onUnfollow', user);
    expect(app.dialog().props.confirmation).toBeNull();
    expect(getFollowingSummary).toHaveBeenCalledTimes(2);

    complete(success('Next'));
    await flush();
    runEvent(list, 'onUnfollow', user);
    expect(app.dialog().props.confirmation).toBeNull();
    const nextList = app.list();
    runEvent(nextList, 'onUnfollow', (nextList.props.users as unknown[])[0]);
    await flush();
    expect(app.dialog().props.confirmation).toMatchObject({ account: 'Next', open: true });
  });

  it('confirms the displayed account and removes the card only after success and animation', async () => {
    const data = success('Saved');
    if (!data.success) throw new Error('Expected a successful comparison fixture');
    const picture = 'https://simg-ssl.duolingo.com/avatar/demo/medium';
    const other = { userId: 2, username: 'other', displayName: 'Other' };
    data.comparison.checkedFollowing = 3;
    data.comparison.totalFollowing = 10;
    data.comparison.checkedFollowers = 2;
    data.comparison.totalFollowers = 2;
    data.comparison.mutualUsers = 1;
    data.comparison.nonMutualUsers = 2;
    data.comparison.nonMutualFollowing = [
      { userId: 1, username: 'demo', displayName: 'Demo', picture },
      other,
    ];
    data.comparison.following = [
      ...data.comparison.nonMutualFollowing.map((user) => ({
        ...user,
        relationship: 'non-mutual' as const,
      })),
      { userId: 3, username: 'mutual', displayName: 'Mutual', relationship: 'mutual' },
    ];
    getFollowingSummary.mockResolvedValueOnce(data);
    const app = mountApp('Saved');
    await app.connect();
    await flush();
    app.edit('Draft');
    const list = app.list();
    const users = list.props.users as (typeof other)[];
    runEvent(list, 'onUnfollow', users[0]);
    await flush();
    expect(app.list().props.onRemovalComplete).toBe(list.props.onRemovalComplete);
    expect(app.dialog().props.confirmation).toMatchObject({
      account: 'Saved',
      user: { username: 'demo' },
      open: true,
    });
    const confirmationView = app.dialog();
    const dialogTree = createRenderer().render(() => renderChild(confirmationView));
    const target = findElement(dialogTree, (node) => node.props.id === 'unfollow-profile');
    expect(findElement(target, (node) => node.type === ProfileAvatar).props).toMatchObject({
      name: 'Demo',
      picture,
    });
    expect(findElement(target, (node) => node.type === 'strong').props.children).toBe('Demo');
    expect(findElement(target, (node) => node.props.children === '@demo')).toBeDefined();
    expect(unfollow).not.toHaveBeenCalled();
    runEvent(app.dialog(), 'onCancel');
    expect(app.list().props.onRemovalComplete).toBe(list.props.onRemovalComplete);
    runEvent(confirmationView, 'onConfirm');
    expect(app.dialog().props.confirmation).toMatchObject({ open: false });
    expect(unfollow).not.toHaveBeenCalled();

    let complete!: (result: UnfollowResult) => void;
    unfollow.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    runEvent(list, 'onUnfollow', users[0]);
    await flush();
    const dialog = app.dialog();
    runEvent(dialog, 'onConfirm');
    runEvent(dialog, 'onConfirm');
    runEvent(list, 'onUnfollow', other);
    app.submit();
    expect(unfollow).toHaveBeenCalledExactlyOnceWith('Saved', 1, false);
    expect(getFollowingSummary).toHaveBeenCalledTimes(1);
    expect(app.list().props).toMatchObject({ users, unfollowingId: 1, removingId: null });

    complete({ success: true, targetUserId: 1 });
    await flush();
    expect(app.list().props).toMatchObject({ users, unfollowingId: 1, removingId: 1 });
    const removingList = app.list();
    runEvent(removingList, 'onRemovalComplete');
    runEvent(removingList, 'onRemovalComplete');
    expect(app.list().props).toMatchObject({ users: [other], unfollowingId: null });
    runEvent(
      findElement(
        app.render(),
        (node) => node.type === 'button' && node.props.children === 'Все полученные',
      ),
      'onClick',
    );
    expect(app.list().props.users).toMatchObject([{ userId: 2 }, { userId: 3 }]);
    expect(app.input().props.value).toBe('Draft');
    const stats = findElement(
      app.render(),
      (node) => node.props['aria-label'] === 'Результат проверки подписок',
    );
    expect(
      findElements(stats, (node) => node.type === 'strong').map((node) => node.props.children),
    ).toEqual(['2', '2', '1', '1']);
    const followingTotal = findElements(stats, (node) => node.type === CoverageDetails)[0];
    expect(followingTotal.props.total).toBe('из 9');
    expect(app.notifications()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'success', title: 'Подписка удалена' }),
      ]),
    );
  });

  it.each([
    [
      'UNFOLLOW_UNCONFIRMED',
      'DuoFollow could not tell whether the follow was removed. Compare your follows before trying again.',
    ],
    ['RATE_LIMITED', 'Duolingo is limiting requests. Wait before trying again.'],
  ] as const)(
    'retains the profile and shows the correct action for %s',
    async (errorCode, message) => {
      getFollowingSummary.mockResolvedValueOnce(success('Saved'));
      unfollow.mockResolvedValueOnce({ success: false, error: 'worker details', errorCode });
      const app = mountApp('Saved', false, 'en-US');
      await app.connect();
      await flush();
      const users = app.list().props.users as unknown[];
      runEvent(app.list(), 'onUnfollow', users[0]);
      await flush();
      runEvent(app.dialog(), 'onConfirm');
      await flush();
      expect(app.list().props).toMatchObject({ users, unfollowingId: null, removingId: null });
      expect(app.notifications()).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'error', message })]),
      );
      expect(unfollow).toHaveBeenCalledOnce();
    },
  );

  it('keeps the list and offers a fresh comparison after a refusal or a lost reply', async () => {
    getFollowingSummary.mockResolvedValueOnce(success('Saved'));
    unfollow
      .mockResolvedValueOnce({ success: false, error: 'HTTP 403' })
      .mockRejectedValueOnce(new Error('Connector response timed out'));
    const app = mountApp('Saved');
    await app.connect();
    await flush();
    const users = app.list().props.users as unknown[];
    for (const reason of ['HTTP 403', 'Connector response timed out']) {
      runEvent(app.list(), 'onUnfollow', users[0]);
      await flush();
      runEvent(app.dialog(), 'onConfirm');
      await flush();
      expect(app.list().props).toMatchObject({ users, unfollowingId: null, removingId: null });
      expect(app.notifications()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'error', message: expect.stringContaining(reason) }),
        ]),
      );
    }
  });
});
