import type { DuolingoUser } from '@duofollow/src/domain/models/DuolingoUser';

export interface DuolingoClient {
  getFollowers(userId: string): Promise<DuolingoUser[]>;
  getFollowing(userId: string): Promise<DuolingoUser[]>;
  unfollow(userId: string): Promise<void>;
}
