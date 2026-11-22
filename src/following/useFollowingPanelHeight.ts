import { useLayoutEffect } from 'react';

import type { RefObject } from 'react';

/** Fits the list panel in the content viewport when at least one row fits. */
export function useFollowingPanelHeight(
  ref: RefObject<HTMLUListElement | null>,
  rowHeight: number,
) {
  useLayoutEffect(() => {
    const list = ref.current;
    const panel = list?.closest<HTMLElement>('.live-following');
    const content = list?.closest<HTMLElement>('.site-content');
    if (!list || !panel || !content) return;
    const update = () => {
      const controls = panel.offsetHeight - list.offsetHeight;
      const available = content.clientHeight - controls - 32;
      const natural = Math.min(540, window.innerHeight * 0.55);
      const height = available >= rowHeight ? Math.min(natural, available) : natural;
      const value = `${Math.floor(height)}px`;
      if (list.style.blockSize !== value) list.style.blockSize = value;
    };
    const observer = new ResizeObserver(update);
    observer.observe(content);
    observer.observe(panel);
    update();
    return () => observer.disconnect();
  }, [ref, rowHeight]);
}
