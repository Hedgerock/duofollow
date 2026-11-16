import type {
  ComparedFollowingUser,
  FollowingComparison,
  NonMutualFollowingUser,
} from '@duofollow/extension/src/dto/DuolingoFollowingDto';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isOptionalPicture(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function isFollowingUser(value: unknown): value is NonMutualFollowingUser {
  return (
    isObject(value) &&
    Number.isSafeInteger(value.userId) &&
    typeof value.username === 'string' &&
    typeof value.displayName === 'string' &&
    isOptionalPicture(value.picture)
  );
}

function isComparedUser(value: unknown): value is ComparedFollowingUser {
  return (
    isFollowingUser(value) &&
    'relationship' in value &&
    (value.relationship === 'mutual' ||
      value.relationship === 'non-mutual' ||
      value.relationship === 'unknown')
  );
}

function isProfileList(value: unknown, checkUser: (value: unknown) => boolean): boolean {
  if (!Array.isArray(value)) return false;
  for (const user of value) {
    if (!checkUser(user)) return false;
  }
  return true;
}

/** Checks the data the comparison screen consumes, including optional lists from older replies. */
export function isFollowingComparison(value: unknown): value is FollowingComparison {
  return (
    isObject(value) &&
    typeof value.accountUsername === 'string' &&
    value.accountUsername.trim().length > 0 &&
    isOptionalPicture(value.accountPicture) &&
    isCount(value.checkedFollowing) &&
    isCount(value.totalFollowing) &&
    isCount(value.checkedFollowers) &&
    isCount(value.totalFollowers) &&
    isCount(value.mutualUsers) &&
    (value.nonMutualUsers === null || isCount(value.nonMutualUsers)) &&
    (value.nonMutualFollowing === null ||
      isProfileList(value.nonMutualFollowing, isFollowingUser)) &&
    (value.following === undefined || isProfileList(value.following, isComparedUser))
  );
}
