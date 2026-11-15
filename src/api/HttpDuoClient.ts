import { DuolingoUser } from '../domain/models/DuolingoUser.ts';
import { toDuolingoUser } from './mappers/toDuolingoUser.ts';
import { DuolingoUsersResponseDto } from './dto/DuolingoProfileDto.ts';

export class HttpDuoClient {
  private readonly baseUrl = 'https://www.duolingo.com/2017-06-30';

  async getPublishProfile(username: string): Promise<unknown> {
    const url = new URL(`${this.baseUrl}/users`);

    url.searchParams.set('username', username);

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
    });

    if (!response.ok) {
      throw new Error(`Duolingo API returned HTTP ${response.status}`);
    }

    return response.json();
  }

  async probeFollowing(userId: string): Promise<void> {
    const url = new URL(
      `https://www.duolingo.com/2017-06-30/friends/users/${encodeURIComponent(userId)}/following`,
    );

    url.searchParams.set('pageSize', '500');
    url.searchParams.set('viewedId', userId);

    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      console.log('Following status:', response.status);

      if (!response.ok) {
        return;
      }

      const data: unknown = await response.json();

      console.log('Following response:', data);
    } catch (error) {
      console.error('Following request failed:', error);
    }
  }

  async getFollowingPage(userId: string, cursor?: string): Promise<unknown> {
    const url = new URL(
      `https://www.duolingo.com/2017-06-30/friends/users/${encodeURIComponent(userId)}/following`,
    );

    url.searchParams.set('pageSize', '500');
    url.searchParams.set('viewedId', userId);

    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch following: HTTP ${response.status}`);
    }

    return response.json();
  }
}
