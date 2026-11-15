import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { NotificationViewport } from '../notifications';
import { VirtualFollowingList } from '../VirtualFollowingList';
import type { FollowingComparisonResult } from '../../extension/src/dto/DuolingoFollowingDto';
import { createRenderer, findElement, findElements, renderChild, runEvent } from './reactHarness';

const { getFollowingSummary } = vi.hoisted(() => ({
  getFollowingSummary: vi.fn<(username: string) => Promise<FollowingComparisonResult>>(),
}));

vi.mock('../api/extension/DuoFollowConnector', () => ({
  DuoFollowConnector: class {
    getFollowingSummary = getFollowingSummary;
  },
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  ...(await import('./reactHarness')).mockHooks,
}));

function success(accountUsername: string, incomplete = false): FollowingComparisonResult {
  return {
    success: true,
    firstPage: {
      received: 1,
      cursor: 'v1:500',
      totalUsers: 2,
      isFollowingTrue: 1,
      isFollowingFalse: 0,
      isFollowedByTrue: 0,
      isFollowedByFalse: 1,
      isFollowedByMissingOrInvalid: 0,
    },
    secondPage: null,
    duplicatedUsers: 0,
    uniqueUsers: 1,
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

function mountApp(saved?: string, blockStorage = false) {
  const storage = {
    getItem: vi.fn(() => {
      if (blockStorage) throw new Error('Storage blocked');
      return saved ?? null;
    }),
    setItem: vi.fn(() => {
      if (blockStorage) throw new Error('Storage blocked');
    }),
  };
  vi.stubGlobal('window', { localStorage: storage });
  const renderer = createRenderer();
  const render = (strict = false) => renderer.render(App, { strict });
  const notifications = () =>
    findElement(render(), (node) => node.type === NotificationViewport).props.notifications;
  return {
    renderer,
    render,
    storage,
    notifications,
    input: () => findElement(render(), (node) => node.props.id === 'duolingo-username'),
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
  return findElements(tree, (node) => node.type === 'p')
    .map((node) => node.props.children)
    .flat()
    .filter((value) => typeof value === 'string');
}

afterEach(() => {
  getFollowingSummary.mockReset();
  vi.unstubAllGlobals();
});

describe('comparison screen', () => {
  it('restores a saved account once through the StrictMode effect cycle', async () => {
    getFollowingSummary.mockResolvedValueOnce(success('Saved'));
    const app = mountApp('Saved');
    app.render(true);
    expect(app.input().props.value).toBe('Saved');
    expect(getFollowingSummary).toHaveBeenCalledExactlyOnceWith('Saved');
    expect(app.notifications()).toMatchObject([{ kind: 'info' }]);
    expect(findElement(app.render(), (node) => node.props['aria-busy'] === true)).toBeDefined();
    await flush();
    expect(app.notifications()).toMatchObject([{ kind: 'success' }]);
    expect(app.storage.setItem).toHaveBeenCalledWith('duofollow.accountUsername', 'Saved');
    expect(visibleAccounts(app.render())).toContain('Saved');
  });

  it('preserves the current result when editing or when the next submission fails', async () => {
    getFollowingSummary
      .mockResolvedValueOnce(success('First'))
      .mockResolvedValueOnce({ success: false, error: 'HTTP 403' })
      .mockResolvedValueOnce(success('Second'));
    const app = mountApp();
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

  it('reports messaging rejection and still works when browser storage is unavailable', async () => {
    getFollowingSummary
      .mockRejectedValueOnce(new Error('Channel closed'))
      .mockResolvedValueOnce(success('Manual', true));
    const app = mountApp('Ignored', true);
    app.render(true);
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

  it('filters by case-insensitive display name or @username without requesting data again', async () => {
    getFollowingSummary.mockResolvedValueOnce(success('Saved'));
    const app = mountApp('Saved');
    app.render();
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
    app.render();
    app.renderer.unmount();
    resolve(success('Saved'));
    await flush();
    expect(app.storage.setItem).not.toHaveBeenCalled();
  });

  it('replays the skeleton on each submission and restores the previous list after an error', async () => {
    getFollowingSummary
      .mockResolvedValueOnce(success('Saved'))
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

    app.render();
    expect(skeletons()).toHaveLength(1);
    expect(
      findElement(
        renderChild(skeletons()[0]),
        (node) => node.props.className === 'comparison-skeleton',
      ).props.inert,
    ).toBe(true);
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
});
