import { afterEach, describe, expect, it, vi } from 'vitest';
import { VirtualFollowingList } from '../VirtualFollowingList';
import { createRenderer, findElement, findElements, renderChild, runEvent } from './reactHarness';

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  ...(await import('./reactHarness')).mockHooks,
}));

const users = Array.from({ length: 10_000 }, (_, index) => ({
  userId: index + 1,
  username: index === 0 ? 'demo/name' : `demo${index + 1}`,
  displayName: `Demo ${index + 1}`,
}));

function mountList() {
  const renderer = createRenderer();
  const viewport = { clientHeight: 480, scrollTop: 0 };
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
  let options = { users, filterKey: '', emptyMessage: 'No matches' };
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
    filter(filtered: typeof users, filterKey: string) {
      options = { ...options, users: filtered, filterKey };
      return render();
    },
    resize(height: number) {
      viewport.clientHeight = height;
      resize();
      return render();
    },
  };
}

const rows = (tree: unknown) =>
  findElements(tree, (element) => 'onFocusedIndexChange' in element.props);

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
    expect(findElement(row, (node) => node.type === 'strong').props.children).toBe('Demo 1');
  });
});
