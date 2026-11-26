import { useLayoutEffect, useRef } from 'react';

/** Keeps the native modal open until its exit finishes, without relying on discrete display transitions. */
export function useModalDialog(isOpen: boolean) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (!dialog.open) return;
    let active = true;
    dialog.setAttribute('data-closing', 'true');
    dialog.inert = true;
    const close = () => {
      if (!active) return;
      dialog.inert = false;
      dialog.close();
      dialog.removeAttribute('data-closing');
    };
    // getAnimations flushes the closing styles. Reduced motion produces no transition.
    const animations = dialog.getAnimations();
    if (animations.length)
      void Promise.allSettled(animations.map(({ finished }) => finished)).then(close);
    else close();
    return () => {
      active = false;
      dialog.inert = false;
      dialog.removeAttribute('data-closing');
    };
  }, [isOpen]);
  return dialogRef;
}
