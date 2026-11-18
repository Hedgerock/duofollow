import type { ConnectorFailure } from '@duofollow/extension/src/dto/ConnectorError';

export interface NonMutualFollowingUser {
  userId: number;
  username: string;
  displayName: string;
  picture?: string | null;
}

export type FollowingRelationship = 'mutual' | 'non-mutual' | 'unknown';

export type ComparedFollowingUser = NonMutualFollowingUser & {
  relationship: FollowingRelationship;
};

export const relationshipCoverageStatuses = [
  'complete',
  'cursor-present',
  'cursor-missing',
  'total-mismatch',
] as const;

export type RelationshipCoverageStatus = (typeof relationshipCoverageStatuses)[number];

export interface FollowingComparison {
  coverage?: { following: RelationshipCoverageStatus; followers: RelationshipCoverageStatus };
  checkedFollowing: number;
  totalFollowing: number;
  checkedFollowers: number;
  totalFollowers: number;
  mutualUsers: number;
  nonMutualUsers: number | null;
  nonMutualFollowing: NonMutualFollowingUser[] | null;
  following?: ComparedFollowingUser[];
  accountUsername: string;
  accountPicture?: string | null;
}

export type FollowingComparisonResult =
  { success: true; comparison: FollowingComparison } | ConnectorFailure;

export type UnfollowResult = { success: true; targetUserId: number } | ConnectorFailure;
