import { memo, useState } from 'react';

import { parseDuolingoAvatarUrl } from '@duofollow/extension/src/duolingoAvatarUrl';

interface ProfileAvatarProps {
  name: string;
  picture?: string | null;
  lazy?: boolean;
}

const FAILED_AVATAR_RETRY_DELAY_MS = 60_000;
const FAILED_AVATAR_LIMIT = 512;
const failedAvatars = new Map<string, number>();

function rememberFailedAvatar(picture: string) {
  failedAvatars.delete(picture);
  failedAvatars.set(picture, Date.now() + FAILED_AVATAR_RETRY_DELAY_MS);

  if (failedAvatars.size > FAILED_AVATAR_LIMIT) {
    const oldest = failedAvatars.keys().next().value;
    if (oldest !== undefined) failedAvatars.delete(oldest);
  }
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('')
    .toLocaleUpperCase();
}

/**
 * Shows an avatar from an approved origin, with initials as a fallback.
 * A failed image is temporarily skipped when its row remounts during scrolling.
 */
export const ProfileAvatar = memo(function ProfileAvatar({
  name,
  picture,
  lazy = false,
}: ProfileAvatarProps) {
  const [failedPicture, setFailedPicture] = useState<string | null>(null);
  const allowedPicture = parseDuolingoAvatarUrl(picture)?.href;
  const retryAt = allowedPicture ? failedAvatars.get(allowedPicture) : undefined;
  const src =
    allowedPicture &&
    allowedPicture !== failedPicture &&
    (retryAt === undefined || retryAt <= Date.now())
      ? allowedPicture
      : null;

  return (
    <span className="profile-avatar" aria-hidden="true">
      {src ? (
        <img
          src={src}
          alt=""
          loading={lazy ? 'lazy' : 'eager'}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => {
            failedAvatars.delete(src);
          }}
          onError={() => {
            rememberFailedAvatar(src);
            setFailedPicture(src);
          }}
        />
      ) : (
        getInitials(name) || '•'
      )}
    </span>
  );
});
