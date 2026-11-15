import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ProfileAvatar } from '../ProfileAvatar';
import { NotificationViewport } from '../notifications';
import { UnfollowDialog } from '../UnfollowDialog';
import { VirtualFollowingList } from '../VirtualFollowingList';
import type {
  FollowingComparisonResult,
  UnfollowResult,
} from '../../extension/src/dto/DuolingoFollowingDto';
import { createRenderer, findElement, findElements, renderChild, runEvent } from './reactHarness';

const { getFollowingSummary, unfollow } = vi.hoisted(() => ({
  getFollowingSummary: vi.fn<(username: string) => Promise<FollowingComparisonResult>>(),
  unfollow: vi.fn<(username: string, targetUserId: number) => Promise<UnfollowResult>>(),
}));

vi.mock('../api/extension/DuoFollowConnector', () => ({
  DuoFollowConnector: class {
    getFollowingSummary = getFollowingSummary;
    unfollow = unfollow;
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
  return findElements(
    tree,
    (node) => node.type === 'strong' && typeof node.props.title === 'string',
  )
    .map((node) => node.props.children)
    .flat()
    .filter((value) => typeof value === 'string');
}

afterEach(() => {
  getFollowingSummary.mockReset();
  unfollow.mockReset();
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

  it('links the compared profile in the header and shows its picture', async () => {
    const data = success('Saved');
    if (!data.success) throw new Error('Expected a successful comparison fixture');
    data.comparison.accountPicture = 'https://simg-ssl.duolingo.com/avatar/example/medium';
    getFollowingSummary.mockResolvedValueOnce(data);
    const app = mountApp('Saved');
    app.render();
    await flush();
    app.edit('Draft');

    const link = findElement(app.render(), (node) => node.props.className === 'topbar-profile');
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

  it('blocks stale handlers while the new comparison is pending and until its result is committed', async () => {
    getFollowingSummary.mockResolvedValueOnce(success('Saved'));
    let complete!: (result: FollowingComparisonResult) => void;
    getFollowingSummary.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const app = mountApp('Saved');
    app.render();
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
    expect(app.dialog().props.confirmation).toMatchObject({ account: 'Next', open: true });
  });

  it('confirms the displayed account and removes the card only after success and animation', async () => {
    const data = success('Saved');
    if (!data.success) throw new Error('Expected a successful comparison fixture');
    const picture = 'https://simg-ssl.duolingo.com/avatar/demo/medium';
    const other = { userId: 2, username: 'other', displayName: 'Other' };
    data.comparison.checkedFollowing = 3;
    data.comparison.totalFollowing = 10;
    data.comparison.mutualUsers = 1;
    data.comparison.nonMutualUsers = 2;
    data.comparison.nonMutualFollowing = [
      { userId: 1, username: 'demo', displayName: 'Demo', picture },
      other,
    ];
    getFollowingSummary.mockResolvedValueOnce(data);
    const app = mountApp('Saved');
    app.render();
    await flush();
    app.edit('Draft');
    const list = app.list();
    const users = list.props.users as (typeof other)[];
    runEvent(list, 'onUnfollow', users[0]);
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
    const dialog = app.dialog();
    runEvent(dialog, 'onConfirm');
    runEvent(dialog, 'onConfirm');
    runEvent(list, 'onUnfollow', other);
    app.submit();
    expect(unfollow).toHaveBeenCalledExactlyOnceWith('Saved', 1);
    expect(getFollowingSummary).toHaveBeenCalledTimes(1);
    expect(app.list().props).toMatchObject({ users, unfollowingId: 1, removingId: null });

    complete({ success: true, targetUserId: 1 });
    await flush();
    expect(app.list().props).toMatchObject({ users, unfollowingId: 1, removingId: 1 });
    const removingList = app.list();
    runEvent(removingList, 'onRemovalComplete');
    runEvent(removingList, 'onRemovalComplete');
    expect(app.list().props).toMatchObject({ users: [other], unfollowingId: null });
    expect(app.input().props.value).toBe('Draft');
    const stats = findElement(
      app.render(),
      (node) => node.props['aria-label'] === 'Результат проверки подписок',
    );
    expect(
      findElements(stats, (node) => node.type === 'strong').map((node) => node.props.children),
    ).toEqual([2, 1, 1]);
    expect(findElements(stats, (node) => node.type === 'small')[0].props.children).toEqual([
      'из ',
      9,
    ]);
    expect(app.notifications()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'success', title: 'Подписка удалена' }),
      ]),
    );
  });

  it('keeps the list and offers a fresh comparison after a refusal or a lost reply', async () => {
    getFollowingSummary.mockResolvedValueOnce(success('Saved'));
    unfollow
      .mockResolvedValueOnce({ success: false, error: 'HTTP 403' })
      .mockRejectedValueOnce(new Error('Connector response timed out'));
    const app = mountApp('Saved');
    app.render();
    await flush();
    const users = app.list().props.users as unknown[];
    for (const reason of ['HTTP 403', 'Connector response timed out']) {
      runEvent(app.list(), 'onUnfollow', users[0]);
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
