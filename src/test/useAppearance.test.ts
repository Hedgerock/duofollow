import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRenderer } from '@duofollow/src/test/reactHarness';
import { useAppearance } from '@duofollow/src/useAppearance';

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  ...(await import('@duofollow/src/test/reactHarness')).mockHooks,
}));

afterEach(() => vi.unstubAllGlobals());

describe('tooltip preference migration', () => {
  it.each([null, '{}', '{"tooltips":"false"}', '{"tooltips":0}', '{"tooltips":null}', 'broken'])(
    'keeps hints enabled for missing or invalid storage %s',
    (saved) => {
      const setItem = vi.fn();
      vi.stubGlobal('window', { localStorage: { getItem: () => saved, setItem } });
      const renderer = createRenderer();
      expect(renderer.render(useAppearance).appearance.tooltips).toBe(true);
      expect(setItem).not.toHaveBeenCalled();
      renderer.unmount();
    },
  );

  it('restores an explicit opt-out and saves subsequent changes with the existing appearance', () => {
    const setItem = vi.fn();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () =>
          '{"tooltips":false,"fontSize":"large","fontFamily":"serif","colorVision":true}',
        setItem,
      },
    });
    const renderer = createRenderer();
    const initial = renderer.render(useAppearance);
    expect(initial.appearance.tooltips).toBe(false);
    initial.updateAppearance({ tooltips: true });
    const next = renderer.render(useAppearance);
    expect(next.appearance).toEqual({
      tooltips: true,
      fontSize: 'large',
      fontFamily: 'serif',
      colorVision: true,
    });
    expect(setItem).toHaveBeenCalledWith('duofollow.appearance', JSON.stringify(next.appearance));
    renderer.unmount();
  });

  it('applies a toggle for the current page when storage is unavailable', () => {
    const blocked = () => {
      throw new Error('Storage blocked');
    };
    vi.stubGlobal('window', { localStorage: { getItem: blocked, setItem: blocked } });
    const renderer = createRenderer();
    const initial = renderer.render(useAppearance);
    expect(initial.appearance.tooltips).toBe(true);
    initial.updateAppearance({ tooltips: false });
    expect(renderer.render(useAppearance).appearance.tooltips).toBe(false);
    renderer.unmount();
  });
});
