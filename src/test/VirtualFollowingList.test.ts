import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComparedFollowingUser } from '../../extension/src/dto/DuolingoFollowingDto';
import { RelationshipMarker } from '../following/RelationshipMarker';
import { VirtualFollowingList } from '../VirtualFollowingList';
import { translations } from '../i18n/messages';
import { createRenderer, findElement, findElements, renderChild, runEvent } from './reactHarness';

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  ...(await import('./reactHarness')).mockHooks,
}));

const users: ComparedFollowingUser[] = Array.from({ length: 10_000 }, (_, index) => ({
  userId: index + 1,
  username: index === 0 ? 'demo/name' : `demo${index + 1}`,
  displayName: `Demo ${index + 1}`,
  relationship: 'non-mutual',
}));

function mountList(showRelationships = false) {
  const renderer = createRenderer();
  const viewport = {
    clientHeight: 480,
    scrollTop: 0,
    querySelector: vi.fn(),
    getBoundingClientRect: () => ({ top: 0, bottom: 480 }),
  };
  let resize = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const onUnfollow = vi.fn();
  const onRemovalComplete = vi.fn();
  let options = {
    users,
    viewKey: '',
    label: 'Подписки',
    showRelationships,
    emptyMessage: 'No matches',
    unfollowingId: null as number | null,
    removingId: null as number | null,
    onUnfollow,
    onRemovalComplete,
    messages: translations.ru,
  };
  const commit = (tree: unknown) => {
    const list = findElement(tree, (node) => node.type === 'ul');
    (list.props.ref as { current: typeof viewport }).current = viewport;
  };
  const render = () => {
    renderer.render(() => VirtualFollowingList(options), { commit });
    return renderer.render(() => VirtualFollowingList(options), { commit });
  };
  return {
    viewport,
    renderer,
    disconnect,
    onUnfollow,
    onRemovalComplete,
    render,
    scroll(scrollTop: number) {
      viewport.scrollTop = scrollTop;
      runEvent(
        findElement(render(), (node) => node.type === 'ul'),
        'onScroll',
        { currentTarget: viewport },
      );
      return render();
    },
    filter(filtered: typeof users, viewKey: string) {
      options = { ...options, users: filtered, viewKey };
      return render();
    },
    resize(height: number) {
      viewport.clientHeight = height;
      resize();
      return render();
    },
    setPending(userId: number) {
      options = { ...options, unfollowingId: userId };
      return render();
    },
    remove(userId: number) {
      options = { ...options, removingId: userId };
      return render();
    },
  };
}

const rows = (tree: unknown) =>
  findElements(tree, (element) => 'onFocusedUserChange' in element.props);

afterEach(() => vi.unstubAllGlobals());

describe('virtual following list', () => {
  it('renders a bounded window over 10,000 cards including the last record', () => {
    const list = mountList();
    expect(rows(list.render())).toHaveLength(12);
    expect(rows(list.scroll(340_000)).some((row) => row.props.index === 5000)).toBe(true);
    const last = rows(list.scroll(680_000 - 480));
    expect(last.length).toBeLessThanOrEqual(17);
    expect(last.at(-1)?.props.index).toBe(9999);
    list.renderer.unmount();
    expect(list.disconnect).toHaveBeenCalled();
  });

  it('retains the focused row, resets on search, and remeasures on resize', () => {
    const list = mountList();
    const first = findElement(renderChild(rows(list.render())[0]), (node) => node.type === 'li');
    runEvent(first, 'onFocus');
    expect(rows(list.scroll(340_000)).some((card) => card.props.index === 0)).toBe(true);
    runEvent(first, 'onBlur', { currentTarget: { contains: () => false }, relatedTarget: null });
    expect(rows(list.render()).some((card) => card.props.index === 0)).toBe(false);
    const empty = list.filter([], 'not-found');
    expect(list.viewport.scrollTop).toBe(0);
    expect(findElement(empty, (node) => node.props.className === 'empty').props.children).toBe(
      'No matches',
    );
    expect(findElement(empty, (node) => node.type === 'ul').props.className).toContain(
      'virtual-following',
    );
    list.filter(users, '');
    expect(rows(list.resize(240))).toHaveLength(8);
  });

  it('exposes selectable names as siblings of the separately labelled profile link', () => {
    const list = mountList();
    const row = renderChild(rows(list.render())[0]);
    const link = findElement(row, (node) => node.type === 'a');
    expect(link.props.href).toBe('https://www.duolingo.com/profile/demo%2Fname');
    expect(link.props['aria-label']).toContain('Demo 1');
    expect(findElements(link, (node) => node.type === 'strong')).toHaveLength(0);
    const name = findElement(row, (node) => node.type === 'strong');
    expect(findElement(name, (node) => node.type === 'bdi').props.children).toBe('Demo 1');
    expect(findElements(link, (node) => node.type === 'button')).toHaveLength(0);
    const button = findElement(row, (node) => node.type === 'button');
    expect(button.props['aria-label']).toContain('Demo 1');
    runEvent(button, 'onClick');
    expect(list.onUnfollow).toHaveBeenCalledExactlyOnceWith(users[0]);
    const pendingRow = renderChild(rows(list.setPending(1))[0]);
    const pendingButton = findElement(pendingRow, (node) => node.type === 'button');
    expect(pendingButton.props).toMatchObject({ 'aria-disabled': true, 'aria-busy': true });
    runEvent(pendingButton, 'onClick');
    expect(list.onUnfollow).toHaveBeenCalledTimes(1);
  });

  it('isolates Arabic names and identifiers while marking mutual rows', () => {
    const list = mountList(true);
    const row = renderChild(
      rows(list.filter([{ ...users[0], displayName: 'صديقات', relationship: 'mutual' }], 'all'))[0],
    );
    expect(findElement(row, (node) => node.type === 'li').props['data-relationship']).toBe(
      'mutual',
    );
    expect(
      findElements(row, (node) => node.type === 'bdi').map((node) => node.props.children),
    ).toEqual(['صديقات', '@demo/name']);
    expect(findElement(row, (node) => node.type === RelationshipMarker).props).toMatchObject({
      relationship: 'mutual',
      label: 'Взаимная',
    });
    expect(findElements(row, (node) => node.type === 'button')).toHaveLength(0);
  });

  it('preserves scroll position when a card is removed without changing the filter', () => {
    const list = mountList();
    list.render();
    list.scroll(340_000);
    const remaining = users.filter(({ userId }) => userId !== 5_001);
    const cards = rows(list.filter(remaining, ''));
    expect(list.viewport.scrollTop).toBe(340_000);
    expect(cards.some(({ props }) => props.user === users[5001])).toBe(true);
  });

  it('keeps a visible row until its exit animation finishes', async () => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const animate = vi.fn(() => ({ finished, cancel: vi.fn() }));
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    const list = mountList();
    list.viewport.querySelector.mockReturnValue({
      animate,
      getBoundingClientRect: () => ({ top: 0, bottom: 68 }),
    });
    list.remove(1);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(list.onRemovalComplete).not.toHaveBeenCalled();
    finish();
    await finished;
    expect(list.onRemovalComplete).toHaveBeenCalledTimes(1);
    list.renderer.unmount();
  });

  it.each([
    { top: 0, bottom: 68, reducedMotion: true },
    { top: 600, bottom: 668, reducedMotion: false },
  ])(
    'skips the animation when reduced motion is on or the row is out of sight (%j)',
    (testCase) => {
      vi.stubGlobal('window', { matchMedia: () => ({ matches: testCase.reducedMotion }) });
      const list = mountList();
      const animate = vi.fn();
      list.viewport.querySelector.mockReturnValue({
        animate,
        getBoundingClientRect: () => testCase,
      });
      list.remove(1);
      expect(animate).not.toHaveBeenCalled();
      expect(list.onRemovalComplete).toHaveBeenCalledTimes(1);
    },
  );
});
