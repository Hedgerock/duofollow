import { describe, expect, it, vi } from 'vitest';

import { createRenderer } from '@duofollow/src/test/reactHarness';
import { useModalDialog } from '@duofollow/src/useModalDialog';

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  ...(await import('@duofollow/src/test/reactHarness')).mockHooks,
}));

function deferred() {
  let resolve!: () => void;
  let reject!: () => void;
  const finished = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { finished, resolve, reject };
}
function fixture(animations: { finished: Promise<unknown> }[] = []) {
  const renderer = createRenderer(),
    attributes = new Map<string, string>();
  const element = {
    open: false,
    inert: false,
    showModal: vi.fn(() => {
      element.open = true;
    }),
    close: vi.fn(() => {
      element.open = false;
    }),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    getAnimations: () => animations,
  };
  return {
    element,
    attributes,
    unmount: () => renderer.unmount(),
    render: (open: boolean) =>
      renderer.render(() => useModalDialog(open), {
        commit: (ref) => {
          ref.current = element as unknown as HTMLDialogElement;
        },
      }),
  };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('native modal closing lifecycle', () => {
  it('keeps the dialog modal and inert until all exit transitions finish', async () => {
    const one = deferred(),
      two = deferred(),
      mounted = fixture([one, two]);
    mounted.render(true);
    mounted.render(false);
    expect(mounted.element.open).toBe(true);
    expect(mounted.element.inert).toBe(true);
    expect(mounted.attributes.get('data-closing')).toBe('true');
    one.resolve();
    await flush();
    expect(mounted.element.close).not.toHaveBeenCalled();
    two.resolve();
    await flush();
    expect(mounted.element.close).toHaveBeenCalledOnce();
    expect(mounted.element.inert).toBe(false);
    expect(mounted.attributes.has('data-closing')).toBe(false);
  });
  it('closes synchronously when reduced motion produces no transition', () => {
    const mounted = fixture();
    mounted.render(true);
    mounted.render(false);
    expect(mounted.element.open).toBe(false);
    expect(mounted.element.close).toHaveBeenCalledOnce();
  });
  it('does not let an old exit close a reopened dialog', async () => {
    const animation = deferred(),
      mounted = fixture([animation]);
    mounted.render(true);
    mounted.render(false);
    mounted.render(true);
    animation.resolve();
    await flush();
    expect(mounted.element.open).toBe(true);
    expect(mounted.element.inert).toBe(false);
    expect(mounted.element.close).not.toHaveBeenCalled();
  });
  it('finishes closing if the browser cancels a transition', async () => {
    const animation = deferred(),
      mounted = fixture([animation]);
    mounted.render(true);
    mounted.render(false);
    animation.reject();
    await flush();
    expect(mounted.element.open).toBe(false);
  });
  it('drops a pending close after unmount', async () => {
    const animation = deferred(),
      mounted = fixture([animation]);
    mounted.render(true);
    mounted.render(false);
    mounted.unmount();
    animation.resolve();
    await flush();
    expect(mounted.element.close).not.toHaveBeenCalled();
    expect(mounted.element.inert).toBe(false);
  });
});
