import { describe, expect, it } from 'vitest';
import { findNonMutualFollowing, type DuoUser } from './users';
const user = (id: string): DuoUser => ({ id, username: id, displayName: id });
describe('findNonMutualFollowing', () => {
  it('returns only users who do not follow back', () => {
    expect(
      findNonMutualFollowing([user('1'), user('2'), user('3')], [user('1'), user('3')]),
    ).toEqual([user('2')]);
  });
  it('handles empty lists', () => {
    expect(findNonMutualFollowing([], [user('1')])).toEqual([]);
    expect(findNonMutualFollowing([user('2')], [])).toEqual([user('2')]);
  });
});
