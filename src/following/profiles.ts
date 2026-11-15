import type { NonMutualFollowingUser } from '../../extension/src/dto/DuolingoFollowingDto';

export function getProfileDisplayName(
  { displayName, username, userId }: NonMutualFollowingUser,
  userLabel: string,
): string {
  return displayName || username || `${userLabel} ${userId}`;
}

export function getProfileIdentifier({
  username,
  userId,
}: Pick<NonMutualFollowingUser, 'username' | 'userId'>): string {
  return username ? `@${username}` : `ID ${userId}`;
}

export function getDuolingoProfileUrl(username: string): string {
  return `https://www.duolingo.com/profile/${encodeURIComponent(username)}`;
}
