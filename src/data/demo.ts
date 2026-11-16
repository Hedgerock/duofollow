import type { DuolingoClient, DuoUser } from '@duofollow/src/domain/users';

const people: DuoUser[] = [
  { id: '1', username: 'linguaexplorer', displayName: 'Lingua Explorer' },
  { id: '2', username: 'polyglotmax', displayName: 'Polyglot Max' },
  { id: '3', username: 'wordmaster', displayName: 'Word Master' },
  { id: '4', username: 'studybuddy', displayName: 'Study Buddy' },
  { id: '5', username: 'grammarfox', displayName: 'Grammar Fox' },
  { id: '6', username: 'dailywords', displayName: 'Daily Words' },
];

export const demoClient: DuolingoClient = {
  async getFollowing() {
    return [...people];
  },
  async getFollowers() {
    return [people[0], people[3], people[5]];
  },
  async unfollow() {
    throw new Error('Demo mode: unfollow is disabled');
  },
};
