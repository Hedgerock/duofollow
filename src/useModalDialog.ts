import { useLayoutEffect, useRef } from 'react';

export function useModalDialog(isOpen: boolean) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open === isOpen) return;

    if (isOpen) dialog.showModal();
    else dialog.close();
  }, [isOpen]);

  return dialogRef;
}
