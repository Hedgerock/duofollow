import { expect, type Page } from 'playwright/test';

import type {
  ComparedFollowingUser,
  FollowingComparison,
  FollowingComparisonResult,
} from '@duofollow/extension/src/dto/DuolingoFollowingDto';

type ComparisonIdentity = {
  accountUsername: string;
  profile: Pick<ComparedFollowingUser, 'displayName' | 'username'>;
};

function comparison(
  incomplete: boolean,
  profileCount: number,
  identity?: ComparisonIdentity,
): Extract<FollowingComparisonResult, { success: true }> {
  const profiles: ComparedFollowingUser[] = [
    { userId: 2, displayName: 'セリーナ', username: 'selina', relationship: 'mutual' },
    {
      userId: 3,
      displayName: 'صديقات ملخصات',
      username: 'words_ar',
      relationship: incomplete ? 'unknown' : 'non-mutual',
    },
    {
      userId: 4,
      displayName: 'Anna Rivers',
      username: 'anna_r',
      ...identity?.profile,
      relationship: incomplete ? 'unknown' : 'non-mutual',
    },
  ];
  for (let userId = 5; profiles.length < profileCount; userId += 1) {
    const suffix = String(userId).padStart(5, '0');
    profiles.push({
      userId,
      displayName: 'Profile ' + suffix,
      username: 'profile_' + suffix,
      relationship: userId % 3 === 0 ? 'mutual' : incomplete ? 'unknown' : 'non-mutual',
    });
  }
  const mutual = profiles.filter(({ relationship }) => relationship === 'mutual').length;
  const totalFollowing = Math.max(8, profiles.length);
  const checkedFollowers = mutual + 1;
  const nonMutual = incomplete
    ? null
    : profiles.filter(({ relationship }) => relationship === 'non-mutual');
  return {
    success: true,
    firstPage: {
      received: profiles.length,
      cursor: 'v1:500',
      totalUsers: totalFollowing,
      isFollowingTrue: profiles.length,
      isFollowingFalse: 0,
      isFollowedByTrue: 0,
      isFollowedByFalse: 0,
      isFollowedByMissingOrInvalid: profiles.length,
    },
    secondPage: null,
    duplicatedUsers: 0,
    uniqueUsers: profiles.length,
    comparison: {
      accountUsername: identity?.accountUsername ?? 'lingua_demo',
      accountPicture: null,
      checkedFollowing: profiles.length,
      totalFollowing,
      checkedFollowers,
      totalFollowers: incomplete ? checkedFollowers + 3 : checkedFollowers,
      mutualUsers: mutual,
      nonMutualUsers: nonMutual?.length ?? null,
      nonMutualFollowing: nonMutual,
      following: profiles,
    },
  };
}

export async function openComparison(
  page: Page,
  {
    incomplete = false,
    theme = 'dark',
    profileCount = 3,
    identity,
    refreshFields,
    holdRefresh = false,
    quickUnfollow = false,
  }: {
    incomplete?: boolean;
    theme?: 'dark' | 'light';
    profileCount?: number;
    identity?: ComparisonIdentity;
    refreshFields?: Partial<Record<keyof FollowingComparison, unknown>>;
    holdRefresh?: boolean;
    quickUnfollow?: boolean;
  } = {},
) {
  const summary = comparison(incomplete, profileCount, identity);
  const refreshSummary = refreshFields
    ? { ...summary, comparison: { ...summary.comparison, ...refreshFields } }
    : undefined;
  await page.addInitScript(
    ({ summary, refreshSummary, theme, holdRefresh, quickUnfollow }) => {
      let response: unknown = summary;
      let hasCompared = false;
      const refreshGate = holdRefresh
        ? new Promise<void>((resolve) => {
            window.addEventListener('duofollow-test:release-refresh', () => resolve(), {
              once: true,
            });
          })
        : null;
      localStorage.setItem('duofollow.language', 'en');
      localStorage.setItem('duofollow.theme', theme);
      const commands: string[] = [];
      let unfollowTarget: number | undefined;
      Object.defineProperty(window, '__duofollowTestCommands', { value: commands });
      const chrome = Reflect.get(window, 'chrome') ?? {};
      Object.defineProperty(chrome, 'runtime', {
        configurable: true,
        value: {
          connect() {
            let listener: ((message: unknown) => void) | undefined;
            const onPreference = (event: Event) => {
              quickUnfollow = (event as CustomEvent<boolean>).detail;
              listener?.({ quickUnfollow });
            };
            window.addEventListener('duofollow-test:quick-unfollow', onPreference);
            return {
              onMessage: {
                addListener(callback: (message: unknown) => void) {
                  listener = callback;
                },
              },
              onDisconnect: { addListener() {} },
              disconnect() {
                window.removeEventListener('duofollow-test:quick-unfollow', onPreference);
              },
            };
          },
          sendMessage(
            _id: string,
            message: { type: string; targetUserId?: number },
            reply: (response: unknown) => void,
          ) {
            commands.push(message.type);
            queueMicrotask(() => {
              switch (message.type) {
                case 'GET_DUOLINGO_ACCESS':
                  reply({ session: 'ready' });
                  return;
                case 'GET_FOLLOWING_SUMMARY': {
                  const result = response;
                  if (hasCompared && refreshGate) void refreshGate.then(() => reply(result));
                  else reply(result);
                  hasCompared = true;
                  if (refreshSummary) response = refreshSummary;
                  return;
                }
                case 'GET_QUICK_UNFOLLOW':
                  reply({ success: true, enabled: quickUnfollow, confirmation: 'website' });
                  return;
                case 'REQUEST_UNFOLLOW':
                case 'REQUEST_QUICK_UNFOLLOW':
                  unfollowTarget = message.targetUserId;
                  reply({ success: true, requestId: 'fixture-unfollow' });
                  return;
                case 'CONFIRM_QUICK_UNFOLLOW':
                case 'GET_UNFOLLOW_STATUS':
                  reply({ success: true, targetUserId: unfollowTarget });
                  return;
                default:
                  reply({ success: false });
              }
            });
          },
        },
      });
      if (!Reflect.get(window, 'chrome')) Reflect.set(window, 'chrome', chrome);
    },
    { summary, refreshSummary, theme, holdRefresh, quickUnfollow },
  );
  await page.goto('/duofollow/');
  await page.locator('#duolingo-username').fill(identity?.accountUsername ?? 'lingua_demo');
  await page.getByRole('button', { name: 'Compare my follows' }).click();
  await expect(page.getByRole('group', { name: 'Show follows' })).toBeVisible();
  await page.getByRole('button', { name: /Dismiss notification “Comparison complete”/ }).click();
  await page.getByRole('button', { name: 'All received', exact: true }).click();
  return page.locator('.live-following');
}

export async function connectorCommands(page: Page): Promise<string[]> {
  return page.evaluate(() => Reflect.get(window, '__duofollowTestCommands'));
}
