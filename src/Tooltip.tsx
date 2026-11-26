import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { useTooltips } from '@duofollow/src/TooltipProvider';

import type {
  FocusEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  PointerEventHandler,
  ReactElement,
} from 'react';

type TriggerProps = {
  'aria-describedby'?: string;
  onPointerEnter?: PointerEventHandler<HTMLElement>;
  onPointerMove?: PointerEventHandler<HTMLElement>;
  onPointerLeave?: PointerEventHandler<HTMLElement>;
  onPointerDown?: PointerEventHandler<HTMLElement>;
  onFocus?: FocusEventHandler<HTMLElement>;
  onBlur?: FocusEventHandler<HTMLElement>;
  onClick?: MouseEventHandler<HTMLElement>;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
};

/** Adds a viewport-bound tooltip without changing the trigger's layout or click behavior. */
export function Tooltip({
  label,
  children,
  followPointer = false,
  placement = 'bottom',
  onlyWhenTruncated = false,
}: {
  label: string;
  children: ReactElement<TriggerProps>;
  followPointer?: boolean;
  placement?: 'bottom' | 'inline-start';
  onlyWhenTruncated?: boolean;
}) {
  const id = useId();
  const { enabled, ownership } = useTooltips();
  const bubble = useRef<HTMLSpanElement>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const focused = useRef(false);
  const hovered = useRef(false);
  const pointerFocus = useRef(false);
  const pickerFrame = useRef<number | undefined>(undefined);
  const pickerFocus = useRef<(() => void) | null>(null);
  const pickerKeyboardIntent = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [state, setState] = useState<{ open: boolean; continuous: boolean } | null>(null);
  const open = enabled && state?.open === true;
  const cancelPicker = useCallback(() => {
    if (pickerFrame.current !== undefined) cancelAnimationFrame(pickerFrame.current);
    pickerFrame.current = undefined;
    if (pickerFocus.current) window.removeEventListener('focus', pickerFocus.current);
    pickerFocus.current = null;
  }, []);
  const remove = useCallback(() => {
    clearTimeout(closeTimer.current);
    clearTimeout(removeTimer.current);
    cancelPicker();
    setState(null);
    ownership.release(id);
  }, [cancelPicker, id, ownership]);
  const dismiss = useCallback(() => {
    clearTimeout(closeTimer.current);
    clearTimeout(removeTimer.current);
    setState((previous) => (previous ? { ...previous, open: false } : null));
    removeTimer.current = setTimeout(() => {
      setState(null);
      ownership.release(id);
    }, 160);
  }, [id, ownership]);
  function show(element: HTMLElement) {
    if (!enabled || (element.tagName === 'SELECT' && pickerOpen(element))) return;
    if (
      onlyWhenTruncated &&
      ![element, ...Array.from(element.children)].some(
        (line) => line.scrollWidth > line.clientWidth,
      )
    )
      return;
    anchor.current = element;
    clearTimeout(closeTimer.current);
    clearTimeout(removeTimer.current);
    const continuous = ownership.claim(id, remove);
    setState({ open: true, continuous });
  }
  function pickerOpen(element: HTMLElement) {
    return CSS.supports('selector(select:open)') && element.matches(':open');
  }
  function watchPicker(element: HTMLElement) {
    const keyboardIntent =
      focused.current ||
      ((pickerFrame.current !== undefined || pickerFocus.current !== null) &&
        pickerKeyboardIntent.current);
    cancelPicker();
    if (element.tagName !== 'SELECT' || !CSS.supports('selector(select:open)')) return;
    pickerKeyboardIntent.current = keyboardIntent;
    const restore = () => {
      if (pickerFocus.current) window.removeEventListener('focus', pickerFocus.current);
      pickerFocus.current = null;
      hovered.current = element.matches(':hover');
      // The native popup may blur the select and return focus without :focus-visible.
      focused.current = keyboardIntent && document.activeElement === element;
      if (
        document.visibilityState !== 'hidden' &&
        document.hasFocus() &&
        (hovered.current || focused.current)
      )
        show(element);
    };
    const check = () => {
      if (pickerOpen(element)) {
        pickerFrame.current = requestAnimationFrame(check);
        return;
      }
      pickerFrame.current = undefined;
      if (document.visibilityState !== 'hidden' && !document.hasFocus()) {
        pickerFocus.current = restore;
        window.addEventListener('focus', restore, { once: true });
      } else restore();
    };
    pickerFrame.current = requestAnimationFrame(check);
  }
  function position() {
    const tooltip = bubble.current;
    const element = anchor.current;
    if (!tooltip || !element) return;
    const bounds = element.getBoundingClientRect();
    const point = followPointer ? pointer.current : null;
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    const beside = !point && placement === 'inline-start';
    const start =
      getComputedStyle(element).direction === 'rtl'
        ? bounds.right + 8
        : bounds.left - tooltip.offsetWidth - 8;
    const x = point
      ? point.x + 12
      : beside
        ? start
        : bounds.left + (bounds.width - tooltip.offsetWidth) / 2;
    const below = point ? point.y + 12 : bounds.bottom + 8;
    const above = (point ? point.y - 12 : bounds.top - 8) - tooltip.offsetHeight;
    const left = Math.max(8, Math.min(x, width - tooltip.offsetWidth - 8));
    const top = beside
      ? Math.max(
          8,
          Math.min(
            bounds.top + (bounds.height - tooltip.offsetHeight) / 2,
            height - tooltip.offsetHeight - 8,
          ),
        )
      : below + tooltip.offsetHeight <= height - 8
        ? below
        : Math.max(8, above);
    tooltip.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }
  useLayoutEffect(position, [state, label, followPointer, placement]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        pickerFrame.current === undefined &&
        pickerFocus.current === null
      )
        dismiss();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', dismiss);
    const onWindowBlur = () => {
      dismiss();
    };
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open, dismiss]);
  useEffect(() => {
    if (!enabled) remove();
  }, [enabled, remove]);
  useEffect(
    () => () => {
      clearTimeout(closeTimer.current);
      clearTimeout(removeTimer.current);
      cancelPicker();
      ownership.release(id);
    },
    [cancelPicker, id, ownership],
  );
  if (!enabled) return children;
  const trigger = cloneElement(children, {
    'aria-describedby':
      [children.props['aria-describedby'], open ? id : undefined].filter(Boolean).join(' ') ||
      undefined,
    onPointerEnter(event) {
      children.props.onPointerEnter?.(event);
      if (event.pointerType === 'touch') return;
      hovered.current = true;
      pointer.current = { x: event.clientX, y: event.clientY };
      show(event.currentTarget);
    },
    onPointerMove(event) {
      children.props.onPointerMove?.(event);
      if (open && event.pointerType !== 'touch' && followPointer) {
        pointer.current = { x: event.clientX, y: event.clientY };
        position();
      }
      if (
        !open &&
        event.pointerType !== 'touch' &&
        event.buttons === 0 &&
        event.currentTarget.tagName === 'SELECT'
      ) {
        show(event.currentTarget);
      }
    },
    onPointerLeave(event) {
      children.props.onPointerLeave?.(event);
      if (event.pointerType === 'touch') return;
      hovered.current = false;
      if (!focused.current) {
        closeTimer.current = setTimeout(dismiss, 80);
      }
    },
    onPointerDown(event) {
      children.props.onPointerDown?.(event);
      pointerFocus.current = true;
      focused.current = false;
      dismiss();
      if (event.pointerType !== 'touch') watchPicker(event.currentTarget);
    },
    onFocus(event) {
      children.props.onFocus?.(event);
      if (pointerFocus.current || !event.currentTarget.matches(':focus-visible')) return;
      focused.current = true;
      pointer.current = null;
      show(event.currentTarget);
    },
    onBlur(event) {
      children.props.onBlur?.(event);
      focused.current = false;
      pointerFocus.current = false;
      // Native popups can temporarily blur the control; the monitor verifies focus when they close.
      if (!hovered.current) dismiss();
    },
    onKeyDown(event) {
      children.props.onKeyDown?.(event);
      pointerFocus.current = false;
      if (event.key === 'Escape') {
        // Native popup cancellation can also reach the DOM in Firefox. Keep watching until it closes.
        if (
          event.currentTarget.tagName === 'SELECT' &&
          (pickerFrame.current !== undefined || pickerFocus.current !== null)
        )
          return;
        cancelPicker();
        dismiss();
      } else if (
        event.currentTarget.tagName === 'SELECT' &&
        ['ArrowDown', 'ArrowUp', ' ', 'Enter', 'F4'].includes(event.key)
      ) {
        focused.current = true;
        dismiss();
        watchPicker(event.currentTarget);
      }
    },
    onClick(event) {
      children.props.onClick?.(event);
      if (event.currentTarget.tagName === 'SELECT') {
        dismiss();
        watchPicker(event.currentTarget);
        return;
      }
      const native = event.nativeEvent;
      if (
        followPointer &&
        (event.detail === 0 || ('pointerType' in native && native.pointerType === 'touch'))
      ) {
        pointer.current = null;
        show(event.currentTarget);
      }
    },
  });
  return (
    <>
      {trigger}
      {enabled &&
        state &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={bubble}
            id={id}
            className="ui-tooltip"
            role="tooltip"
            dir="auto"
            data-open={open}
            data-continuous={state.continuous}
            aria-hidden={!open}
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}
