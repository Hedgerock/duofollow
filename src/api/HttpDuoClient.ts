import { duolingoEndpoints } from '../../extension/src/duolingoEndpoints';

export class HttpDuoClient {
  async getPublishProfile(username: string): Promise<unknown> {
    const endpoint = duolingoEndpoints.publicProfileLookup;
    const url = endpoint.url();

    url.searchParams.set('username', username);

    const response = await fetch(url, {
      method: endpoint.method,
      credentials: 'omit',
    });

    if (!response.ok) {
      throw new Error(`Duolingo API returned HTTP ${response.status}`);
    }

    return response.json();
  }

  async probeFollowing(userId: string): Promise<void> {
    const endpoint = duolingoEndpoints.following;
    const url = endpoint.url(userId);

    url.searchParams.set('pageSize', '500');
    url.searchParams.set('viewedId', userId);

    try {
      const response = await fetch(url, {
        method: endpoint.method,
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
    const endpoint = duolingoEndpoints.following;
    const url = endpoint.url(userId);

    url.searchParams.set('pageSize', '500');
    url.searchParams.set('viewedId', userId);

    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await fetch(url, {
      method: endpoint.method,
      credentials: 'omit',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch following: HTTP ${response.status}`);
    }

    return response.json();
  }
}
