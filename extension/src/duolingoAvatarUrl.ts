import avatarOrigins from '@duofollow/extension/src/duolingoAvatarOrigins.json';

export function parseDuolingoAvatarUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  try {
    const picture = value.trim();
    const url = new URL(picture.startsWith('//') ? `https:${picture}` : picture);
    return url.protocol === 'https:' &&
      avatarOrigins.includes(url.origin) &&
      !url.username &&
      !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}
