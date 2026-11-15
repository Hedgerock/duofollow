import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationViewport, useNotifications } from '../notifications';
import { createRenderer, findElement, renderChild, runEvent } from './reactHarness';

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  ...(await import('./reactHarness')).mockHooks,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('notifications', () => {
  it('processes a queue of 100 with a maximum of three visible', () => {
    const renderer = createRenderer();
    const state = () => renderer.render(useNotifications);
    for (let index = 0; index < 100; index++) {
      state().notify({ kind: 'info', title: `Message ${index}` });
    }
    expect(state().visible).toHaveLength(3);
    for (let index = 0; index < 100; index++) {
      const [first] = state().visible;
      expect(first.title).toBe(`Message ${index}`);
      state().dismiss(first.id);
    }
    expect(state().visible).toEqual([]);
  });

  it('replaces a notification in the same group without allowing an old timer to dismiss it', () => {
    const renderer = createRenderer();
    const state = () => renderer.render(useNotifications);
    state().notify({ kind: 'info', title: 'Loading', group: 'comparison' });
    const previous = state().visible[0];
    state().notify({ kind: 'success', title: 'Done', group: 'comparison' });
    const [current] = state().visible;
    expect(current.id).not.toBe(previous.id);
    state().dismiss(previous.id);
    expect(state().visible).toEqual([current]);
  });

  function mountToast(kind: 'info' | 'success' | 'error' = 'success') {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    const dismiss = vi.fn();
    const queue = createRenderer();
    const state = () => queue.render(useNotifications);
    state().notify({ kind, title: 'Result' });
    const viewport = NotificationViewport({ notifications: state().visible, dismiss });
    const toast = findElement(viewport, (element) => 'notification' in element.props);
    const card = createRenderer();
    const render = (strict = false) => card.render(() => renderChild(toast), { strict });
    return { viewport, render, card, dismiss };
  }

  it.each([
    ['info', 5500],
    ['success', 6500],
    ['error', 9500],
  ] as const)('expires a %s toast at the configured time', (kind, duration) => {
    const { render, card, dismiss } = mountToast(kind);
    const tree = render(true);
    const progress = findElement(tree, (node) => node.props.className === 'toast-progress-fill');
    expect(progress.props.style).toMatchObject({ animationDuration: `${duration}ms` });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(duration - 1);
    expect(dismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dismiss).toHaveBeenCalledOnce();
    card.unmount();
  });

  it('pauses on pointer or keyboard focus and resumes with the remaining time', () => {
    const { viewport, render, card, dismiss } = mountToast();
    expect(viewport.props['aria-live']).toBe('polite');
    const row = () => findElement(render(), (node) => node.type === 'li');
    row();
    vi.advanceTimersByTime(1000);
    runEvent(row(), 'onPointerEnter', { pointerType: 'mouse' });
    expect(
      findElement(render(), (node) => node.props.className === 'toast-progress-fill').props.style,
    ).toMatchObject({ animationPlayState: 'paused' });
    vi.advanceTimersByTime(20_000);
    runEvent(row(), 'onFocus');
    runEvent(row(), 'onPointerLeave');
    row();
    expect(vi.getTimerCount()).toBe(0);
    runEvent(row(), 'onBlur', { currentTarget: { contains: () => false }, relatedTarget: null });
    row();
    vi.advanceTimersByTime(5499);
    expect(dismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dismiss).toHaveBeenCalledOnce();
    card.unmount();
  });

  it('closes from the labelled button and cleans up its timer on unmount', () => {
    const { render, card, dismiss } = mountToast();
    const button = findElement(render(), (node) => node.type === 'button');
    expect(button.props['aria-label']).toBe('Закрыть уведомление «Result»');
    runEvent(button, 'onClick');
    expect(dismiss).toHaveBeenCalledOnce();
    card.unmount();
    vi.advanceTimersByTime(9500);
    expect(vi.getTimerCount()).toBe(0);
    expect(dismiss).toHaveBeenCalledOnce();
  });
});
