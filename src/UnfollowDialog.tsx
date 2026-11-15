import { useLayoutEffect, useRef } from 'react';
import type { NonMutualFollowingUser } from '../extension/src/dto/DuolingoFollowingDto';
import { getProfileIdentifier } from './following/profiles';
import { ProfileAvatar } from './ProfileAvatar';

export interface UnfollowConfirmation {
  account: string;
  user: NonMutualFollowingUser;
  open: boolean;
}

interface UnfollowDialogProps {
  confirmation: UnfollowConfirmation | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function UnfollowDialog({ confirmation, onCancel, onConfirm }: UnfollowDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isOpen = confirmation?.open ?? false;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open === isOpen) return;

    if (isOpen) dialog.showModal();
    else dialog.close();
  }, [isOpen]);

  const user = confirmation?.user;
  const identifier = user && getProfileIdentifier(user);

  return (
    <dialog
      ref={dialogRef}
      className="unfollow-dialog"
      aria-labelledby="unfollow-title"
      aria-describedby="unfollow-profile unfollow-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="unfollow-title">Отписаться от пользователя?</h2>
      {confirmation && user && (
        <>
          <div className="unfollow-dialog-profile" id="unfollow-profile">
            <ProfileAvatar name={user.displayName || user.username} picture={user.picture} />
            <div className="unfollow-dialog-profile-text">
              <strong>{user.displayName || identifier}</strong>
              {user.displayName && <span>{identifier}</span>}
            </div>
          </div>
          <p id="unfollow-description">
            Подписка с аккаунта <strong>@{confirmation.account}</strong> будет удалена.
          </p>
        </>
      )}
      <div className="unfollow-dialog-actions">
        <button type="button" onClick={onCancel}>
          Отмена
        </button>
        <button type="button" className="unfollow-dialog-confirm" onClick={onConfirm}>
          Отписаться
        </button>
      </div>
    </dialog>
  );
}
