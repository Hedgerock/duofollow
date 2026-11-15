import { expect, type Page } from 'playwright/test';
import type {
  ComparedFollowingUser,
  FollowingComparisonResult,
} from '../extension/src/dto/DuolingoFollowingDto';

function comparison(incomplete: boolean): FollowingComparisonResult {
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
      relationship: incomplete ? 'unknown' : 'non-mutual',
    },
  ];
  const nonMutual = incomplete
    ? null
    : profiles.filter(({ relationship }) => relationship === 'non-mutual');
  return {
    success: true,
    firstPage: {
      received: profiles.length,
      cursor: 'v1:500',
      totalUsers: 8,
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
      accountUsername: 'lingua_demo',
      accountPicture: null,
      checkedFollowing: profiles.length,
      totalFollowing: 8,
      checkedFollowers: 2,
      totalFollowers: incomplete ? 5 : 2,
      mutualUsers: 1,
      nonMutualUsers: nonMutual?.length ?? null,
      nonMutualFollowing: nonMutual,
      following: profiles,
    },
  };
}

export async function openComparison(
  page: Page,
  { incomplete = false, theme = 'dark' }: { incomplete?: boolean; theme?: 'dark' | 'light' } = {},
) {
  await page.addInitScript(
    ({ summary, theme }) => {
      localStorage.setItem('duofollow.language', 'en');
      localStorage.setItem('duofollow.theme', theme);
      const commands: string[] = [];
      Object.defineProperty(window, '__duofollowTestCommands', { value: commands });
      const chrome = Reflect.get(window, 'chrome') ?? {};
      Object.defineProperty(chrome, 'runtime', {
        configurable: true,
        value: {
          connect() {
            const event = { addListener() {} };
            return { onMessage: event, onDisconnect: event, disconnect() {} };
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
                case 'GET_FOLLOWING_SUMMARY':
                  reply(summary);
                  return;
                case 'UNFOLLOW':
                  reply({ success: true, targetUserId: message.targetUserId });
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
    { summary: comparison(incomplete), theme },
  );
  await page.goto('/duofollow/');
  await page.locator('#duolingo-username').fill('lingua_demo');
  await page.getByRole('button', { name: 'Compare my follows' }).click();
  await expect(page.getByRole('group', { name: 'Show follows' })).toBeVisible();
  await page.getByRole('button', { name: /Dismiss notification “Comparison complete”/ }).click();
  await page.getByRole('button', { name: 'All received', exact: true }).click();
  return page.locator('.live-following');
}

export async function connectorCommands(page: Page): Promise<string[]> {
  return page.evaluate(() => Reflect.get(window, '__duofollowTestCommands'));
}
