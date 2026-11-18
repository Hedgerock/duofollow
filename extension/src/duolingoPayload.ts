import { ConnectorError } from '@duofollow/extension/src/dto/ConnectorError';
import { isCount, isRecord, isUserId } from '@duofollow/extension/src/dto/validation';

export type RelationshipList = 'following' | 'followers';

interface RelationshipUser {
  userId: number;
  username: unknown;
  displayName: unknown;
  picture: unknown;
}

export interface RelationshipPage {
  cursor: string | null | undefined;
  totalUsers: number;
  users: RelationshipUser[];
}

interface AccountProfile {
  id: number;
  username: string;
  picture: unknown;
}

export function parseRelationshipPage(value: unknown, list: RelationshipList): RelationshipPage {
  const invalid = () =>
    new ConnectorError('INVALID_RESPONSE', `Duolingo returned an invalid ${list} page`);
  const page = isRecord(value) ? value[list] : undefined;
  if (!isRecord(page) || !Array.isArray(page.users) || !isCount(page.totalUsers)) throw invalid();

  const { cursor } = page;
  if (cursor !== undefined && cursor !== null && typeof cursor !== 'string') throw invalid();

  const users: RelationshipUser[] = [];
  for (const user of page.users as unknown[]) {
    if (!isRecord(user) || !isUserId(user.userId)) throw invalid();
    users.push({
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      picture: user.picture,
    });
  }

  return { cursor, totalUsers: page.totalUsers, users };
}

export function findAccountProfile(value: unknown, username: string): AccountProfile | undefined {
  const invalid = () =>
    new ConnectorError('INVALID_RESPONSE', 'Duolingo вернул неожиданный ответ при поиске профиля.');
  if (!isRecord(value) || !Array.isArray(value.users)) throw invalid();

  const lookupName = username.toLowerCase();
  let account: AccountProfile | undefined;
  for (const user of value.users as unknown[]) {
    if (!isRecord(user) || typeof user.username !== 'string' || !user.username.trim()) {
      throw invalid();
    }
    if (!isUserId(user.id)) {
      throw new ConnectorError('INVALID_RESPONSE', 'Duolingo вернул некорректный ID профиля.');
    }
    if (!account && user.username.toLowerCase() === lookupName) {
      account = { id: user.id, username: user.username, picture: user.picture };
    }
  }
  return account;
}
