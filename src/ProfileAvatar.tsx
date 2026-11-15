import { memo, useState } from 'react';

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

export const ProfileAvatar = memo(function ProfileAvatar({
  name,
  picture,
  lazy = false,
}: ProfileAvatarProps) {
  const [failedPicture, setFailedPicture] = useState<string | null>(null);
  const retryAt = picture ? failedAvatars.get(picture) : undefined;
  const src =
    picture && picture !== failedPicture && (retryAt === undefined || retryAt <= Date.now())
      ? picture
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
