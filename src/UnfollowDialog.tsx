import { getProfileIdentifier } from '@duofollow/src/following/profiles';
import { ProfileAvatar } from '@duofollow/src/ProfileAvatar';
import { useModalDialog } from '@duofollow/src/useModalDialog';

import type { NonMutualFollowingUser } from '@duofollow/extension/src/dto/DuolingoFollowingDto';
import type { Messages } from '@duofollow/src/i18n/messages';

export interface UnfollowConfirmation {
  account: string;
  user: NonMutualFollowingUser;
  open: boolean;
}

interface UnfollowDialogProps {
  confirmation: UnfollowConfirmation | null;
  onCancel: () => void;
  onConfirm: () => void;
  messages: Messages;
}

/**
 * Shows the target profile and the account that will unfollow it.
 * The parent owns the request and can retain the profile during the closing animation.
 */
export function UnfollowDialog({
  confirmation,
  onCancel,
  onConfirm,
  messages,
}: UnfollowDialogProps) {
  const dialogRef = useModalDialog(confirmation?.open ?? false);

  const user = confirmation?.user;
  const identifier = user && getProfileIdentifier(user);

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog unfollow-dialog"
      aria-labelledby="unfollow-title"
      aria-describedby="unfollow-profile unfollow-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="unfollow-title">{messages.unfollowTitle}</h2>
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
            {messages.unfollowDescription[0]}
            <strong>@{confirmation.account}</strong>
            {messages.unfollowDescription[1]}
          </p>
        </>
      )}
      <div className="unfollow-dialog-actions">
        <button type="button" onClick={onCancel}>
          {messages.cancel}
        </button>
        <button type="button" className="unfollow-dialog-confirm" onClick={onConfirm}>
          {messages.unfollowContinue}
        </button>
      </div>
    </dialog>
  );
}
