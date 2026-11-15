import { DuolingoUser } from '../domain/models/DuolingoUser.ts';

export interface DuolingoClient {
  getFollowers(userId: string): Promise<DuolingoUser[]>;
  getFollowing(userId: string): Promise<DuolingoUser[]>;
  unfollow(userId: string): Promise<void>;
}
