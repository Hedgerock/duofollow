import { UNCONFIRMED_UNFOLLOW } from '@duofollow/extension/src/core/duolingo';
import {
  ConnectorError,
  describeConnectorError,
} from '@duofollow/extension/src/dto/ConnectorError';
import { unfollowConfirmationMs } from '@duofollow/extension/src/dto/UnfollowConfirmation';
import { ACCESS_REQUIRED, hasDuolingoAccess } from '@duofollow/extension/src/duolingoAccess';
import { isQuickUnfollowEnabled } from '@duofollow/extension/src/quickUnfollow';

import type { Duolingo, UnfollowTarget } from '@duofollow/extension/src/core/duolingo';
import type { ConnectorFailure } from '@duofollow/extension/src/dto/ConnectorError';
import type { UnfollowResult } from '@duofollow/extension/src/dto/DuolingoFollowingDto';
import type {
  UnfollowPreview,
  UnfollowRequestResult,
  UnfollowStatusResult,
} from '@duofollow/extension/src/dto/UnfollowConfirmation';
import type { ExtensionPlatform } from '@duofollow/extension/src/platform/ExtensionPlatform';

const journalKey = 'unfollowAttempt';
const statusGraceMs = 60_000;
const confirmationUnavailable: ConnectorFailure = {
  success: false,
  errorCode: 'UNFOLLOW_CANCELLED',
  error: 'Подтверждение отменено или истекло.',
};
const unconfirmed: ConnectorFailure = {
  success: false,
  errorCode: 'UNFOLLOW_UNCONFIRMED',
  error: UNCONFIRMED_UNFOLLOW,
};

interface Confirmation {
  requestId: string;
  documentId: string;
  expiresAt: number;
  prepared?: { target: UnfollowTarget; preview: UnfollowPreview };
  windowId?: number;
  claimed: boolean;
  quickSignal?: AbortSignal;
  revoked?: true;
  result?: UnfollowResult;
}

interface AttemptReceipt {
  requestId: string;
  documentId: string;
  expiresAt: number;
}

type Attempt = AttemptReceipt & ({ target: UnfollowTarget } | { result: UnfollowResult });

type WithAccess = <T>(run: (signal: AbortSignal) => Promise<T>) => Promise<T>;

function quickUnfollowDisabled() {
  return new ConnectorError('QUICK_UNFOLLOW_DISABLED', 'Быстрая отписка выключена.');
}

function failure(error: unknown): ConnectorFailure {
  return { success: false, ...describeConnectorError(error) };
}

/** Keeps confirmation in worker memory and uses the journal only to read a lost outcome. */
export function createUnfollowRequests(
  withAccess: WithAccess,
  platform: Pick<ExtensionPlatform, 'storage' | 'permissions' | 'openConfirmation'>,
  duolingo: Duolingo,
) {
  const { performUnfollow, prepareUnfollow, verifyUnfollowOutcome } = duolingo;
  async function requireQuickUnfollow(signal: AbortSignal) {
    signal.throwIfAborted();
    if (!(await isQuickUnfollowEnabled(platform))) throw quickUnfollowDisabled();
    signal.throwIfAborted();
  }
  let accessRevision = 0;
  let quickController = new AbortController();
  let confirmation: Confirmation | undefined;
  let recovery:
    { requestId: string; documentId: string; result: Promise<UnfollowResult> } | undefined;

  function pending(requestId: string): Confirmation | undefined {
    if (
      confirmation?.requestId === requestId &&
      !confirmation.claimed &&
      !confirmation.result &&
      confirmation.expiresAt > Date.now()
    )
      return confirmation;
  }

  function windowClosed(windowId: number) {
    if (confirmation?.windowId === windowId && pending(confirmation.requestId)) {
      confirmation.result = confirmationUnavailable;
    }
  }

  function revoke() {
    accessRevision++;
    if (confirmation) {
      confirmation.revoked = true;
      if (pending(confirmation.requestId))
        confirmation.result = failure(new ConnectorError('ACCESS_REQUIRED', ACCESS_REQUIRED));
    }
    void platform.storage.session.remove(journalKey).catch(() => {
      // Recovery still checks browser permissions, consent and the original session.
    });
  }

  function revokeQuickUnfollow() {
    quickController.abort(quickUnfollowDisabled());
    quickController = new AbortController();
    if (confirmation?.quickSignal && pending(confirmation.requestId)) {
      confirmation.result = failure(quickUnfollowDisabled());
    }
  }

  async function request(
    documentId: string,
    username: unknown,
    targetUserId: unknown,
    quick: boolean,
  ): Promise<UnfollowRequestResult> {
    if (
      recovery ||
      (confirmation &&
        !confirmation.result &&
        (confirmation.claimed || confirmation.expiresAt > Date.now()))
    ) {
      throw new Error('Этот запрос на отписку уже выполняется.');
    }

    const action: Confirmation = {
      requestId: crypto.randomUUID(),
      documentId,
      expiresAt: Date.now() + unfollowConfirmationMs,
      claimed: false,
      quickSignal: quick ? quickController.signal : undefined,
    };
    confirmation = action;
    try {
      action.prepared = await withAccess(async (accessSignal) => {
        const signal = action.quickSignal
          ? AbortSignal.any([accessSignal, action.quickSignal])
          : accessSignal;
        if (action.quickSignal) await requireQuickUnfollow(signal);
        return prepareUnfollow(action.requestId, username, targetUserId, signal);
      });
      if (!pending(action.requestId))
        return action.result?.success === false ? action.result : confirmationUnavailable;
      action.expiresAt = Date.now() + unfollowConfirmationMs;
      if (action.quickSignal) return { success: true, requestId: action.requestId };
      const windowId = await platform.openConfirmation(action.requestId);
      if (windowId === undefined) throw new Error('Не удалось открыть окно Connector.');
      action.windowId = windowId;
      return { success: true, requestId: action.requestId };
    } catch (error) {
      if (confirmation === action) confirmation = undefined;
      throw error;
    }
  }

  function preview(requestId: string) {
    const action = pending(requestId);
    const data = action?.quickSignal ? undefined : action?.prepared?.preview;
    return data ? { success: true, preview: data } : confirmationUnavailable;
  }

  function cancel(requestId: string) {
    const action = pending(requestId);
    if (action && !action.quickSignal) action.result = confirmationUnavailable;
    return { success: true };
  }

  async function confirm(requestId: string): Promise<UnfollowResult> {
    const action = pending(requestId);
    return action?.prepared && !action.quickSignal
      ? execute(action, action.prepared.target)
      : confirmationUnavailable;
  }

  async function confirmQuick(requestId: string, documentId: string): Promise<UnfollowResult> {
    const action = pending(requestId);
    if (action?.documentId === documentId && action.quickSignal && action.prepared) {
      return execute(action, action.prepared.target);
    }
    if (
      confirmation?.requestId === requestId &&
      confirmation.documentId === documentId &&
      confirmation.quickSignal?.aborted
    ) {
      return failure(quickUnfollowDisabled());
    }
    return confirmationUnavailable;
  }

  async function execute(action: Confirmation, target: UnfollowTarget): Promise<UnfollowResult> {
    // Claim synchronously. No second message can authorize the same write.
    action.claimed = true;
    const receipt: AttemptReceipt = {
      requestId: action.requestId,
      documentId: action.documentId,
      expiresAt: action.expiresAt + statusGraceMs,
    };
    let recorded = false;
    let writeStarted = false;
    let result: UnfollowResult;
    try {
      result = await withAccess(async (accessSignal) => {
        const signal = action.quickSignal
          ? AbortSignal.any([accessSignal, action.quickSignal])
          : accessSignal;
        if (action.quickSignal) await requireQuickUnfollow(signal);
        return performUnfollow(
          target,
          signal,
          async () => {
            await platform.storage.session.set({ [journalKey]: { ...receipt, target } });
            recorded = true;
            if (!(await hasDuolingoAccess(platform))) {
              throw new ConnectorError('ACCESS_REQUIRED', ACCESS_REQUIRED);
            }
            if (action.quickSignal) await requireQuickUnfollow(signal);
            signal.throwIfAborted();
          },
          () => {
            writeStarted = true;
          },
        );
      });
    } catch (error) {
      const details = failure(error);
      result =
        details.errorCode === 'UNFOLLOW_UNCONFIRMED'
          ? await withAccess((signal) => verifyUnfollowOutcome(target, signal)).catch(
              () => unconfirmed,
            )
          : writeStarted && details.errorCode === 'ACCESS_REQUIRED'
            ? unconfirmed
            : details;
    }
    if (recorded && !action.revoked) {
      await platform.storage.session.set({ [journalKey]: { ...receipt, result } }).catch(() => {
        // The journal still enables read-only recovery if the worker is restarted.
      });
    }
    action.result = result;
    action.prepared = undefined;
    return result;
  }

  async function recover(requestId: string, documentId: string): Promise<UnfollowResult> {
    const stored = await platform.storage.session.get(journalKey);
    const attempt = stored[journalKey] as Attempt | undefined;
    if (
      attempt?.requestId !== requestId ||
      attempt.documentId !== documentId ||
      attempt.expiresAt <= Date.now()
    )
      return unconfirmed;

    if ('result' in attempt) return attempt.result;
    if (confirmation && !confirmation.result) return unconfirmed;
    const revision = accessRevision;
    const result = await withAccess((signal) =>
      verifyUnfollowOutcome(attempt.target, signal),
    ).catch(() => unconfirmed);
    if (revision === accessRevision) {
      await platform.storage.session
        .set({
          [journalKey]: {
            requestId: attempt.requestId,
            documentId: attempt.documentId,
            expiresAt: attempt.expiresAt,
            result,
          },
        })
        .catch(() => {
          // A failed cache write leaves the read-only result valid for this caller.
        });
    }
    return result;
  }

  async function status(requestId: string, documentId: string): Promise<UnfollowStatusResult> {
    if (confirmation?.requestId === requestId && confirmation.documentId === documentId) {
      if (confirmation.result) return confirmation.result;
      if (!confirmation.claimed && confirmation.expiresAt <= Date.now()) {
        confirmation.result = confirmationUnavailable;
        return confirmation.result;
      }
      return { success: true, pending: true };
    }
    if (recovery) {
      return recovery.requestId === requestId && recovery.documentId === documentId
        ? recovery.result
        : unconfirmed;
    }
    const result = recover(requestId, documentId).finally(() => {
      recovery = undefined;
    });
    recovery = { requestId, documentId, result };
    return result;
  }

  return {
    request,
    preview,
    cancel,
    confirm,
    confirmQuick,
    status,
    revoke,
    revokeQuickUnfollow,
    windowClosed,
  };
}
