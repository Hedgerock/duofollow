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

export type FollowingPaginationResult =
  FollowingPaginationDiagnostics | { success: false; error: string };

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
>;

export interface FollowingComparison {
  checkedFollowing: number;
  totalFollowing: number;
  checkedFollowers: number;
  totalFollowers: number;
  mutualUsers: number;
  nonMutualUsers: number | null;
  nonMutualFollowing: NonMutualFollowingUser[] | null;
  accountUsername: string;
}

export type FollowingComparisonResult =
  | (FollowingPaginationDiagnostics & { comparison: FollowingComparison })
  | { success: false; error: string };
