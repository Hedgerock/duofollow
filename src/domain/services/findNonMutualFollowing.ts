import type { DuolingoUser } from '@duofollow/src/domain/models/DuolingoUser';

export function findNonMutualFollowing(users: readonly DuolingoUser[]): DuolingoUser[] {
  return users.filter((user) => user.isFollowing && !user.isFollowedBy);
}
