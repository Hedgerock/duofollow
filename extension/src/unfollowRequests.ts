import {
  ConnectorError,
  describeConnectorError,
} from '@duofollow/extension/src/dto/ConnectorError';
import {
  unfollowConfirmationMs,
  unfollowConfirmationPage,
} from '@duofollow/extension/src/dto/UnfollowConfirmation';
import {
  performUnfollow,
  prepareUnfollow,
  UNCONFIRMED_UNFOLLOW,
  verifyUnfollowOutcome,
} from '@duofollow/extension/src/duolingo';
import { ACCESS_REQUIRED, hasDuolingoAccess } from '@duofollow/extension/src/duolingoAccess';

import type { ConnectorFailure } from '@duofollow/extension/src/dto/ConnectorError';
import type { UnfollowResult } from '@duofollow/extension/src/dto/DuolingoFollowingDto';
import type {
  UnfollowPreview,
  UnfollowRequestResult,
  UnfollowStatusResult,
} from '@duofollow/extension/src/dto/UnfollowConfirmation';
import type { UnfollowTarget } from '@duofollow/extension/src/duolingo';

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

function failure(error: unknown): ConnectorFailure {
  return { success: false, ...describeConnectorError(error) };
}

/** Keeps confirmation in worker memory and uses the journal only to read a lost outcome. */
export function createUnfollowRequests(withAccess: WithAccess) {
  let accessRevision = 0;
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
    void chrome.storage.session.remove(journalKey).catch(() => {
      // Recovery still checks Chrome permissions, consent and the original session.
    });
  }

  async function request(
    documentId: string,
    username: unknown,
    targetUserId: unknown,
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
    };
    confirmation = action;
    try {
      action.prepared = await withAccess((signal) =>
        prepareUnfollow(action.requestId, username, targetUserId, signal),
      );
      if (!pending(action.requestId)) return confirmationUnavailable;
      action.expiresAt = Date.now() + unfollowConfirmationMs;
      const url = chrome.runtime.getURL(unfollowConfirmationPage) + '#' + action.requestId;
      const popup = await chrome.windows.create({
        url,
        type: 'popup',
        focused: true,
        width: 440,
        height: 480,
      });
      if (popup?.id === undefined) throw new Error('Не удалось открыть окно Connector.');
      action.windowId = popup.id;
      return { success: true, requestId: action.requestId };
    } catch (error) {
      if (confirmation === action) confirmation = undefined;
      throw error;
    }
  }

  function preview(requestId: string) {
    const data = pending(requestId)?.prepared?.preview;
    return data ? { success: true, preview: data } : confirmationUnavailable;
  }

  function cancel(requestId: string) {
    const action = pending(requestId);
    if (action) action.result = confirmationUnavailable;
    return { success: true };
  }

  async function confirm(requestId: string): Promise<UnfollowResult> {
    const action = pending(requestId);
    if (!action?.prepared) return confirmationUnavailable;

    // Claim synchronously. No second message can authorize the same write.
    action.claimed = true;
    const { target } = action.prepared;
    const receipt: AttemptReceipt = {
      requestId,
      documentId: action.documentId,
      expiresAt: action.expiresAt + statusGraceMs,
    };
    let recorded = false;
    let writeStarted = false;
    let result: UnfollowResult;
    try {
      result = await withAccess((signal) =>
        performUnfollow(
          target,
          signal,
          async () => {
            await chrome.storage.session.set({ [journalKey]: { ...receipt, target } });
            recorded = true;
            if (!(await hasDuolingoAccess())) {
              throw new ConnectorError('ACCESS_REQUIRED', ACCESS_REQUIRED);
            }
            signal.throwIfAborted();
          },
          () => {
            writeStarted = true;
          },
        ),
      );
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
      await chrome.storage.session.set({ [journalKey]: { ...receipt, result } }).catch(() => {
        // The journal still enables read-only recovery if the worker is restarted.
      });
    }
    action.result = result;
    action.prepared = undefined;
    return result;
  }

  async function recover(requestId: string, documentId: string): Promise<UnfollowResult> {
    const stored = await chrome.storage.session.get(journalKey);
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
      await chrome.storage.session
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

  return { request, preview, cancel, confirm, status, revoke, windowClosed };
}
