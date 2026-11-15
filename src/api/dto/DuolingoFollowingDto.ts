export interface DuolingoFollowingUserDto {
  userId: number;
  username: string;
  displayName: string;
  picture: string | null;
  isFollowing: boolean;
  isFollowedBy: boolean;
  canFollow: boolean;
}

export interface DuolingoFollowingPageDto {
  following: {
    cursor: string | null;
    totalUsers: number;
    users: DuolingoFollowingUserDto[];
  };
}
