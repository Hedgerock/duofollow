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

export function normalizeDuolingoPicture(value: unknown): string | null {
  const url = parseDuolingoAvatarUrl(value);
  if (!url) return null;

  const path = url.pathname.replace(/\/$/, '');
  const isAvatarRenderBase =
    url.hostname === 'd3gq3s1iyyx31w.cloudfront.net' &&
    path.startsWith('/static/render/bg/') &&
    /-\d+$/.test(path);
  const isProfilePhotoBase =
    url.hostname === 'simg-ssl.duolingo.com' && /^\/avatar\/[^/]+$/.test(path);

  if (isAvatarRenderBase || isProfilePhotoBase) {
    url.pathname = `${path}/medium`;
  }

  return url.href;
}
