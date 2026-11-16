import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { FollowingRelationship } from '@duofollow/extension/src/dto/DuolingoFollowingDto';

const GAP = 12;
const EDGE = 8;

export function RelationshipMarker({
  relationship,
  label,
}: {
  relationship: FollowingRelationship;
  label: string;
}) {
  const tooltip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  function position(x: number, y: number) {
    const bubble = tooltip.current;
    if (!bubble) return;
    const { clientWidth, clientHeight } = document.documentElement;
    const left = Math.max(EDGE, Math.min(x + GAP, clientWidth - bubble.offsetWidth - EDGE));
    const below = y + GAP;
    const top =
      below + bubble.offsetHeight <= clientHeight - EDGE
        ? below
        : Math.max(EDGE, y - GAP - bubble.offsetHeight);
    bubble.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }

  function positionByButton(button: HTMLButtonElement) {
    const { right, top, height } = button.getBoundingClientRect();
    position(right, top + height / 2);
  }

  useEffect(() => {
    if (!open) return;
    const dismiss = () => setOpen(false);
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', dismissOnEscape);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('keydown', dismissOnEscape);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="relationship-marker"
        data-relationship={relationship}
        aria-label={label}
        onPointerEnter={(event) => {
          if (event.pointerType === 'touch') return;
          position(event.clientX, event.clientY);
          setOpen(true);
        }}
        onPointerMove={(event) => {
          if (open && event.pointerType !== 'touch') position(event.clientX, event.clientY);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'touch') return;
          if (event.currentTarget.matches(':focus-visible')) positionByButton(event.currentTarget);
          else setOpen(false);
        }}
        onFocus={(event) => {
          if (!event.currentTarget.matches(':focus-visible')) return;
          positionByButton(event.currentTarget);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          const native = event.nativeEvent;
          if (event.detail === 0 || ('pointerType' in native && native.pointerType === 'touch')) {
            positionByButton(event.currentTarget);
            setOpen(true);
          }
        }}
      />
      {typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={tooltip}
            className="relationship-tooltip"
            role="tooltip"
            data-open={open}
            aria-hidden={!open}
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}
