export interface DuoUser {
  id: string;
  username: string;
  displayName: string;
}

export interface DuolingoClient {
  getFollowers(): Promise<DuoUser[]>;
  getFollowing(): Promise<DuoUser[]>;
  unfollow(userId: string): Promise<void>;
}

export function findNonMutualFollowing(following: DuoUser[], followers: DuoUser[]): DuoUser[] {
  const followerIds = new Set(followers.map((user) => user.id));
  return following.filter((user) => !followerIds.has(user.id));
}
