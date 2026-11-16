// Runs the hooks and inspects React elements in Node. Browser layout and real focus are smoke-tested separately.
type Dependencies = readonly unknown[];
type Effect = () => void | (() => void);
type Setter<T> = (value: T | ((previous: T) => T)) => void;

interface Frame {
  index: number;
  values: unknown[];
  memos: Map<number, { deps: Dependencies; value: unknown }>;
  effects: Map<number, { deps: Dependencies; cleanup: ReturnType<Effect> }>;
  scheduled: Array<(strict: boolean) => void>;
}

let frame: Frame;

const sameDependencies = (previous: Dependencies | undefined, next: Dependencies) =>
  previous?.length === next.length &&
  previous.every((value, index) => Object.is(value, next[index]));

function useState<T>(initial: T | (() => T)): [T, Setter<T>] {
  const current = frame;
  const index = current.index++;
  if (!(index in current.values)) {
    current.values[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
  }
  return [
    current.values[index] as T,
    (next) => {
      current.values[index] =
        typeof next === 'function'
          ? (next as (previous: T) => T)(current.values[index] as T)
          : next;
    },
  ];
}

function useRef<T>(initial: T): { current: T } {
  const index = frame.index++;
  frame.values[index] ??= { current: initial };
  return frame.values[index] as { current: T };
}

function rememberValue<T>(create: () => T, deps: Dependencies): T {
  const index = frame.index++;
  let cached = frame.memos.get(index);
  if (!cached || !sameDependencies(cached.deps, deps)) {
    cached = { deps, value: create() };
    frame.memos.set(index, cached);
  }
  return cached.value as T;
}

function useEffect(effect: Effect, deps: Dependencies): void {
  const current = frame;
  const index = current.index++;
  const previous = current.effects.get(index);
  if (sameDependencies(previous?.deps, deps)) return;
  current.scheduled.push((strict) => {
    previous?.cleanup?.();
    let cleanup = effect();
    if (strict && !previous) {
      cleanup?.();
      cleanup = effect();
    }
    current.effects.set(index, { deps, cleanup });
  });
}

export const mockHooks = {
  memo: <T>(component: T) => component,
  useState,
  useRef,
  useMemo: rememberValue,
  useCallback: <T>(callback: T, deps: Dependencies) => rememberValue(() => callback, deps),
  useEffect,
  useLayoutEffect: useEffect,
};

export function createRenderer() {
  const current: Frame = {
    index: 0,
    values: [],
    memos: new Map(),
    effects: new Map(),
    scheduled: [],
  };
  return {
    render<T>(
      component: () => T,
      { strict = false, commit }: { strict?: boolean; commit?: (tree: T) => void } = {},
    ): T {
      current.index = 0;
      frame = current;
      const tree = component();
      commit?.(tree);
      current.scheduled.splice(0).forEach((run) => run(strict));
      return tree;
    },
    unmount() {
      current.effects.forEach(({ cleanup }) => cleanup?.());
    },
  };
}

export interface ElementNode {
  type: unknown;
  props: Record<string, unknown>;
}

export function findElements(
  tree: unknown,
  predicate: (element: ElementNode) => boolean,
): ElementNode[] {
  if (Array.isArray(tree)) return tree.flatMap((child: unknown) => findElements(child, predicate));
  if (!tree || typeof tree !== 'object' || !('props' in tree)) return [];
  const element = tree as ElementNode;
  return [
    ...(predicate(element) ? [element] : []),
    ...findElements(element.props.children, predicate),
  ];
}

export function findElement(
  tree: unknown,
  predicate: (element: ElementNode) => boolean,
): ElementNode {
  const [element] = findElements(tree, predicate);
  if (!element) throw new Error('Expected a matching React element');
  return element;
}

export function runEvent(element: ElementNode, name: string, event?: unknown) {
  const handler = element.props[name];
  if (typeof handler !== 'function') throw new Error(`Expected event handler ${name}`);
  handler(event);
}

export function renderChild(element: ElementNode): unknown {
  if (typeof element.type !== 'function') throw new Error('Expected a function component');
  return element.type(element.props);
}
