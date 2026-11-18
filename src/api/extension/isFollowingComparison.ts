import { relationshipCoverageStatuses } from '@duofollow/extension/src/dto/DuolingoFollowingDto';
import { isCount, isRecord, isUserId } from '@duofollow/extension/src/dto/validation';

import type {
  ComparedFollowingUser,
  FollowingComparison,
  NonMutualFollowingUser,
  RelationshipCoverageStatus,
} from '@duofollow/extension/src/dto/DuolingoFollowingDto';

function isCoverageStatus(value: unknown): boolean {
  return relationshipCoverageStatuses.some((status) => status === value);
}

function hasCoverageStatuses(value: unknown): boolean {
  return isRecord(value) && isCoverageStatus(value.following) && isCoverageStatus(value.followers);
}

function isOptionalPicture(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function isFollowingUser(value: unknown): value is NonMutualFollowingUser {
  return (
    isRecord(value) &&
    isUserId(value.userId) &&
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

function hasComparisonFields(value: unknown): value is FollowingComparison {
  return (
    isRecord(value) &&
    typeof value.accountUsername === 'string' &&
    value.accountUsername.trim().length > 0 &&
    isOptionalPicture(value.accountPicture) &&
    (value.coverage === undefined || hasCoverageStatuses(value.coverage)) &&
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

function coverageMatchesCount(
  status: RelationshipCoverageStatus,
  checked: number,
  total: number,
): boolean {
  if (status === 'complete') return checked === total;
  if (status === 'total-mismatch') return checked !== total;
  return true;
}

function listMatchesComparison(
  following: ComparedFollowingUser[],
  checked: number,
  mutual: number,
  nonMutualIds: ReadonlySet<number> | null,
): boolean {
  if (following.length !== checked) return false;

  const seen = new Set<number>();
  let observedMutual = 0;
  for (const { userId, relationship } of following) {
    if (seen.has(userId)) return false;
    seen.add(userId);

    if (relationship === 'mutual') {
      observedMutual++;
    } else if (nonMutualIds === null) {
      if (relationship !== 'unknown') return false;
    } else if (relationship !== 'non-mutual' || !nonMutualIds.has(userId)) {
      return false;
    }
  }
  return observedMutual === mutual;
}

/** Checks shape and consistency with the coverage and profile lists available in the reply. */
export function isFollowingComparison(value: unknown): value is FollowingComparison {
  if (!hasComparisonFields(value)) return false;
  const {
    checkedFollowing,
    totalFollowing,
    checkedFollowers,
    totalFollowers,
    mutualUsers,
    nonMutualUsers,
    nonMutualFollowing,
    following,
    coverage,
  } = value;

  if (mutualUsers > Math.min(checkedFollowing, checkedFollowers)) return false;
  if ((nonMutualUsers === null) !== (nonMutualFollowing === null)) return false;
  if (nonMutualUsers !== null && nonMutualUsers !== checkedFollowing - mutualUsers) return false;
  if (
    coverage &&
    (!coverageMatchesCount(coverage.following, checkedFollowing, totalFollowing) ||
      !coverageMatchesCount(coverage.followers, checkedFollowers, totalFollowers) ||
      (coverage.followers === 'complete') !== (nonMutualUsers !== null))
  ) {
    return false;
  }

  let nonMutualIds: Set<number> | null = null;
  if (nonMutualFollowing !== null) {
    if (nonMutualFollowing.length !== nonMutualUsers) return false;
    nonMutualIds = new Set(nonMutualFollowing.map(({ userId }) => userId));
    if (nonMutualIds.size !== nonMutualFollowing.length) return false;
  }

  return (
    !following || listMatchesComparison(following, checkedFollowing, mutualUsers, nonMutualIds)
  );
}
