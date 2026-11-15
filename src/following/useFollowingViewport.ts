import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { NonMutualFollowingUser } from '../../extension/src/dto/DuolingoFollowingDto';

export const FOLLOWING_ROW_HEIGHT = 68;
const OVERSCAN = 4;

export function useFollowingViewport(users: NonMutualFollowingUser[], filterKey: string) {
  const viewportRef = useRef<HTMLUListElement>(null);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [focusedUserId, setFocusedUserId] = useState<number | null>(null);
  const total = users.length;

  const updateRange = useCallback(
    (viewport: HTMLUListElement) => {
      const height = viewport.clientHeight;
      const maxScrollTop = Math.max(0, total * FOLLOWING_ROW_HEIGHT - height);
      const top = Math.max(0, Math.min(viewport.scrollTop, maxScrollTop));
      const start = Math.max(0, Math.floor(top / FOLLOWING_ROW_HEIGHT) - OVERSCAN);
      const end = Math.min(total, Math.ceil((top + height) / FOLLOWING_ROW_HEIGHT) + OVERSCAN);

      setRange((previous) =>
        previous.start === start && previous.end === end ? previous : { start, end },
      );
    },
    [total],
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = 0;
  }, [filterKey]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    updateRange(viewport);

    const observer = new ResizeObserver(() => updateRange(viewport));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [filterKey, updateRange]);

  const end = Math.min(range.end, total);
  const indices = Array.from(
    { length: Math.max(0, end - range.start) },
    (_, offset) => range.start + offset,
  );

  const focusedIndex = useMemo(
    () => (focusedUserId === null ? -1 : users.findIndex(({ userId }) => userId === focusedUserId)),
    [focusedUserId, users],
  );
  useLayoutEffect(() => {
    if (focusedUserId === null || focusedIndex >= 0) return;
    setFocusedUserId(null);
    if (document.activeElement === document.body)
      viewportRef.current?.focus({ preventScroll: true });
  }, [focusedIndex, focusedUserId]);

  if (focusedIndex >= 0 && (focusedIndex < range.start || focusedIndex >= end)) {
    indices.push(focusedIndex);
    indices.sort((left, right) => left - right);
  }

  return { viewportRef, indices, updateRange, setFocusedUserId };
}

export function useFollowingRemovalAnimation(
  viewportRef: RefObject<HTMLUListElement | null>,
  removingId: number | null,
  onRemovalComplete: () => void,
) {
  useLayoutEffect(() => {
    if (removingId === null) return;

    const viewport = viewportRef.current;
    const row = viewport?.querySelector<HTMLLIElement>(`[data-following-id="${removingId}"]`);
    if (
      !viewport ||
      !row ||
      !row.animate ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      onRemovalComplete();
      return;
    }

    const bounds = viewport.getBoundingClientRect();
    const card = row.getBoundingClientRect();
    if (card.bottom <= bounds.top || card.top >= bounds.bottom) {
      onRemovalComplete();
      return;
    }

    const animation = row.animate(
      [
        { opacity: 1, transform: 'translateX(0)' },
        { opacity: 0, transform: 'translateX(12px)' },
      ],
      { duration: 180, easing: 'ease-out', fill: 'forwards' },
    );
    let active = true;
    const finish = () => {
      if (active) onRemovalComplete();
    };
    void animation.finished.then(finish, finish);
    return () => {
      active = false;
      animation.cancel();
    };
  }, [onRemovalComplete, removingId, viewportRef]);
}
