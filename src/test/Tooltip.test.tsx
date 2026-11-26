import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRenderer, findElement, runEvent } from '@duofollow/src/test/reactHarness';
import { Tooltip } from '@duofollow/src/Tooltip';

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  ...(await import('@duofollow/src/test/reactHarness')).mockHooks,
  useId: () => 'tooltip-fixture',
}));
vi.mock('react-dom', () => ({ createPortal: (node: unknown) => node }));
const tooltipContext = vi.hoisted(() => ({
  enabled: true,
  ownership: { claim: () => false, release() {} },
}));
vi.mock('@duofollow/src/TooltipProvider', () => ({ useTooltips: () => tooltipContext }));

let mounted: ReturnType<typeof fixture> | undefined;
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function fixture() {
  const renderer = createRenderer(),
    windowEvents = new EventTarget();
  const frames = new Map<number, FrameRequestCallback>();
  let documentFocused = true;
  let nextFrame = 1,
    nativeOpen = false,
    hover = false,
    focusVisible = true;
  const select = {
    tagName: 'SELECT',
    matches: (selector: string) =>
      selector === ':open' ? nativeOpen : selector === ':hover' ? hover : focusVisible,
  };
  const document = {
    activeElement: select as unknown,
    visibilityState: 'visible',
    body: {},
    hasFocus: () => documentFocused,
  };
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', windowEvents);
  vi.stubGlobal('CSS', { supports: () => true });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const render = () =>
    renderer.render(() => Tooltip({ label: 'Sort follows', children: <select /> }));
  let tree = render();
  const event = (name: string, fields: Record<string, unknown> = {}) => {
    runEvent(
      findElement(tree, (node) => node.type === 'select'),
      name,
      { currentTarget: select, nativeEvent: {}, ...fields },
    );
  };
  return {
    windowFocus(value: boolean) {
      documentFocused = value;
      if (value) windowEvents.dispatchEvent(new Event('focus'));
    },
    removedListener: vi.spyOn(windowEvents, 'removeEventListener'),
    event,
    render() {
      tree = render();
    },
    open() {
      tree = render();
      return !!findElement(tree, (node) => node.type === 'span').props['data-open'];
    },
    key(key: string) {
      const event = new Event('keydown');
      Object.assign(event, { key });
      windowEvents.dispatchEvent(event);
    },
    native(value: boolean) {
      nativeOpen = value;
    },
    hover(value: boolean) {
      hover = value;
    },
    focusVisible(value: boolean) {
      focusVisible = value;
    },
    active(value: boolean) {
      document.activeElement = value ? select : {};
    },
    visible(value: boolean) {
      document.visibilityState = value ? 'visible' : 'hidden';
    },
    frame() {
      const [id, callback] = frames.entries().next().value ?? [];
      if (id !== undefined && callback) {
        frames.delete(id);
        callback(0);
      }
    },
    pending: () => frames.size,
    unmount: () => renderer.unmount(),
  };
}

describe('native select tooltip restoration', () => {
  it('waits for the page to regain focus after the native popup has already closed', () => {
    const current = (mounted = fixture());
    current.event('onFocus');
    current.render();
    current.native(true);
    current.event('onKeyDown', { key: ' ' });
    current.event('onBlur');
    current.render();
    current.windowFocus(false);
    current.native(false);
    current.frame();
    expect(current.open()).toBe(false);
    expect(current.pending()).toBe(0);
    current.windowFocus(true);
    expect(current.open()).toBe(true);
  });
  it('removes a pending focus listener on unmount', () => {
    const current = (mounted = fixture());
    current.event('onFocus');
    current.render();
    current.native(true);
    current.event('onKeyDown', { key: ' ' });
    current.render();
    current.windowFocus(false);
    current.native(false);
    current.frame();
    current.unmount();
    expect(current.removedListener).toHaveBeenCalledWith('focus', expect.any(Function));
  });
  it('restores keyboard intent after native blur even when :focus-visible is lost', () => {
    const current = (mounted = fixture());
    current.event('onFocus');
    current.render();
    expect(current.open()).toBe(true);
    current.native(true);
    current.event('onKeyDown', { key: ' ' });
    current.render();
    current.event('onBlur');
    current.focusVisible(false);
    expect(current.pending()).toBe(1);
    current.native(false);
    current.active(true);
    current.frame();
    expect(current.open()).toBe(true);
  });
  it('leaves Escape to the native picker and allows a subsequent Escape to dismiss the hint', () => {
    const current = (mounted = fixture());
    current.event('onFocus');
    current.render();
    current.native(true);
    current.event('onKeyDown', { key: ' ' });
    current.event('onKeyDown', { key: 'Escape' });
    current.key('Escape');
    current.render();
    current.native(false);
    current.frame();
    expect(current.open()).toBe(true);
    current.event('onKeyDown', { key: 'Escape' });
    current.key('Escape');
    expect(current.open()).toBe(false);
  });
  it('checks the picker again at click and restores the hint without moving the pointer', () => {
    const current = (mounted = fixture());
    current.hover(true);
    current.event('onPointerEnter', { pointerType: 'mouse' });
    current.render();
    current.event('onPointerDown', { pointerType: 'mouse' });
    current.frame();
    current.render();
    current.native(true);
    current.event('onClick');
    current.render();
    current.event('onBlur');
    current.native(false);
    current.frame();
    expect(current.open()).toBe(true);
  });
  it('does not restore a keyboard hint when focus moved to another control', () => {
    const current = (mounted = fixture());
    current.event('onFocus');
    current.render();
    current.native(true);
    current.event('onKeyDown', { key: ' ' });
    current.event('onBlur');
    current.render();
    current.active(false);
    current.native(false);
    current.frame();
    expect(current.open()).toBe(false);
  });
  it('does not restore a hint in a hidden document and cancels a pending frame on unmount', () => {
    const current = (mounted = fixture());
    current.event('onFocus');
    current.render();
    current.native(true);
    current.event('onKeyDown', { key: ' ' });
    current.render();
    current.visible(false);
    current.native(false);
    current.frame();
    expect(current.open()).toBe(false);
    current.native(true);
    current.event('onKeyDown', { key: ' ' });
    current.unmount();
    expect(current.pending()).toBe(0);
  });
});
