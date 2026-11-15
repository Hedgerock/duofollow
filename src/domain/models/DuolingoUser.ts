export interface DuolingoUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  isFollowing: boolean;
  isFollowedBy: boolean;
}
