import { afterEach, expect, it, vi } from 'vitest';

import { ProfileAvatar } from '@duofollow/src/ProfileAvatar';
import {
  createRenderer,
  findElement,
  findElements,
  runEvent,
} from '@duofollow/src/test/reactHarness';

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  ...(await import('@duofollow/src/test/reactHarness')).mockHooks,
}));

afterEach(() => vi.useRealTimers());

it('suppresses requests for a failed avatar across remounts, then allows a retry', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

  const picture = 'https://simg-ssl.duolingo.com/failed.png';
  const renderAvatar = (url = picture) =>
    ProfileAvatar({ name: 'Test Account', picture: url, lazy: true });
  const getImages = (tree: unknown) => findElements(tree, (node) => node.type === 'img');
  const first = createRenderer();
  const [image] = getImages(first.render(() => renderAvatar()));
  expect(image.props.loading).toBe('lazy');
  runEvent(image, 'onError');
  expect(getImages(first.render(() => renderAvatar()))).toHaveLength(0);
  first.unmount();

  const remounted = createRenderer();
  const recent = remounted.render(() => renderAvatar());
  expect(getImages(recent)).toHaveLength(0);
  expect(
    findElement(recent, (node) => node.props.className === 'profile-avatar').props.children,
  ).toBe('TA');
  expect(
    getImages(remounted.render(() => renderAvatar('https://simg-ssl.duolingo.com/new.png'))),
  ).toHaveLength(1);

  vi.advanceTimersByTime(60_000);
  const retry = createRenderer();
  expect(getImages(retry.render(() => renderAvatar()))[0].props.src).toBe(picture);
});
