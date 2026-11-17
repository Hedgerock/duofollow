import type { ConnectorFailure } from '@duofollow/extension/src/dto/ConnectorError';
import type { UnfollowResult } from '@duofollow/extension/src/dto/DuolingoFollowingDto';

export const unfollowConfirmationPage = 'unfollow-confirmation.html';
export const unfollowConfirmationMs = 90_000;

export interface UnfollowPreview {
  username: string;
  targetUserId: number;
  targetLabel: string;
}

export type UnfollowRequestResult = { success: true; requestId: string } | ConnectorFailure;
export type UnfollowStatusResult = { success: true; pending: true } | UnfollowResult;
