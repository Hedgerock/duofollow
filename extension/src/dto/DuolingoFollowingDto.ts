import type { ConnectorFailure } from '@duofollow/extension/src/dto/ConnectorError';

export interface DuolingoFollowingUserDto {
  userId: number;
  username: string;
  displayName: string;
  picture: string | null;
  isFollowing?: unknown;
  isFollowedBy?: unknown;
}

export interface FollowingPageSummary {
  received: number;
  cursor: string | null;
  totalUsers: number;
  isFollowingTrue: number;
  isFollowingFalse: number;
  isFollowedByTrue: number;
  isFollowedByFalse: number;
  isFollowedByMissingOrInvalid: number;
}

export interface FollowingPaginationDiagnostics {
  success: true;
  firstPage: FollowingPageSummary;
  secondPage: FollowingPageSummary | null;
  duplicatedUsers: number;
  uniqueUsers: number;
}

export type FollowingPaginationResult = FollowingPaginationDiagnostics | ConnectorFailure;

export interface DuolingoFollowingPageDto {
  following: {
    cursor?: string | null;
    totalUsers: number;
    users: DuolingoFollowingUserDto[];
  };
}

export type NonMutualFollowingUser = Pick<
  DuolingoFollowingUserDto,
  'userId' | 'username' | 'displayName'
> & { picture?: string | null };

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
  (FollowingPaginationDiagnostics & { comparison: FollowingComparison }) | ConnectorFailure;

export type UnfollowResult = { success: true; targetUserId: number } | ConnectorFailure;
