import { memo } from 'react';

import { HighlightedSearchText } from '@duofollow/src/following/HighlightedSearchText';
import {
  getDuolingoProfileUrl,
  getProfileDisplayName,
  getProfileIdentifier,
} from '@duofollow/src/following/profiles';
import { RelationshipMarker } from '@duofollow/src/following/RelationshipMarker';
import { useFollowingPanelHeight } from '@duofollow/src/following/useFollowingPanelHeight';
import {
  FOLLOWING_ROW_HEIGHT,
  useFollowingRemovalAnimation,
  useFollowingViewport,
} from '@duofollow/src/following/useFollowingViewport';
import { ProfileAvatar } from '@duofollow/src/ProfileAvatar';
import { Tooltip } from '@duofollow/src/Tooltip';

import type {
  ComparedFollowingUser,
  NonMutualFollowingUser,
} from '@duofollow/extension/src/dto/DuolingoFollowingDto';
import type { Messages } from '@duofollow/src/i18n/messages';

interface ListProps {
  users: ComparedFollowingUser[];
  rowHeight?: number;
  highlightTerm?: string;
  highlighting?: boolean;
  /** Reset scroll when the visible view, search, or sort order changes. */
  viewKey: string;
  label: string;
  showRelationships: boolean;
  emptyMessage: string;
  unfollowingId: number | null;
  removingId: number | null;
  onUnfollow: (user: NonMutualFollowingUser) => void;
  onRemovalComplete: () => void;
  messages: Messages;
}

interface RowProps {
  user: ComparedFollowingUser;
  highlightTerm: string;
  highlighting: boolean;
  index: number;
  rowHeight: number;
  total: number;
  showRelationships: boolean;
  unfollowingId: number | null;
  onUnfollow: ListProps['onUnfollow'];
  onFocusedUserChange: (userId: number | null) => void;
  messages: Messages;
}

const FollowingRow = memo(function FollowingRow({
  user,
  highlightTerm,
  highlighting,
  index,
  rowHeight,
  total,
  showRelationships,
  unfollowingId,
  onUnfollow,
  onFocusedUserChange,
  messages,
}: RowProps) {
  const { userId, displayName, username, relationship } = user;
  const name = getProfileDisplayName(user, messages.user);
  const identifier = getProfileIdentifier(user);
  const isUnfollowing = unfollowingId === userId;

  return (
    <li
      className="user virtual-following-row"
      data-following-id={userId}
      data-relationship={showRelationships ? relationship : undefined}
      style={{ top: index * rowHeight, height: rowHeight }}
      aria-posinset={index + 1}
      aria-setsize={total}
      onFocus={() => onFocusedUserChange(userId)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onFocusedUserChange(null);
        }
      }}
    >
      {showRelationships && (
        <RelationshipMarker
          relationship={relationship}
          label={messages.relationships[relationship]}
        />
      )}
      {username && (
        <a
          className="profile-card-link"
          href={getDuolingoProfileUrl(username)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={messages.openProfile(`${name} (${identifier})`)}
        />
      )}
      <ProfileAvatar name={displayName || username} picture={user.picture} lazy />
      <Tooltip label={`${name}\n${identifier}`} onlyWhenTruncated>
        <div className="user-info profile-card-text" tabIndex={0}>
          <strong>
            <bdi>
              {highlightTerm && (displayName || username) ? (
                <HighlightedSearchText
                  key={highlightTerm}
                  text={name}
                  term={highlightTerm}
                  active={highlighting}
                />
              ) : (
                name
              )}
            </bdi>
          </strong>
          <span>
            <bdi>
              {highlightTerm && username ? (
                <HighlightedSearchText
                  key={highlightTerm}
                  text={identifier}
                  term={highlightTerm}
                  active={highlighting}
                />
              ) : (
                identifier
              )}
            </bdi>
          </span>
        </div>
      </Tooltip>
      {relationship === 'non-mutual' && (
        <Tooltip
          label={isUnfollowing ? messages.unfollowing : messages.unfollow}
          placement="inline-start"
        >
          <button
            type="button"
            className="profile-card-unfollow"
            aria-label={(isUnfollowing ? messages.unfollowingProfile : messages.unfollowProfile)(
              `${name} (${identifier})`,
            )}
            aria-busy={isUnfollowing || undefined}
            aria-disabled={unfollowingId !== null}
            onClick={() => {
              if (unfollowingId === null) onUnfollow(user);
            }}
          >
            {isUnfollowing ? (
              <span className="unfollow-spinner" aria-hidden="true" />
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="9" cy="8" r="3.25" />
                <path d="M2.5 20v-1a4.75 4.75 0 0 1 4.75-4.75h3.5A4.75 4.75 0 0 1 15.5 19v1M16.5 9H22" />
              </svg>
            )}
          </button>
        </Tooltip>
      )}
    </li>
  );
});

/**
 * Renders the visible rows, a small overscan, and the focused row when it scrolls off-screen.
 * Use a fixed row height for the current font size so the viewport can calculate row positions.
 */
export const VirtualFollowingList = memo(function VirtualFollowingList({
  users,
  rowHeight = FOLLOWING_ROW_HEIGHT,
  highlightTerm = '',
  highlighting = false,
  viewKey,
  label,
  showRelationships,
  emptyMessage,
  unfollowingId,
  removingId,
  onUnfollow,
  onRemovalComplete,
  messages,
}: ListProps) {
  const total = users.length;
  const { viewportRef, indices, updateRange, setFocusedUserId } = useFollowingViewport(
    users,
    viewKey,
    rowHeight,
  );
  useFollowingPanelHeight(viewportRef, rowHeight);
  useFollowingRemovalAnimation(viewportRef, removingId, onRemovalComplete);

  return (
    <ul
      ref={viewportRef}
      className="users live-following-list virtual-following"
      role="list"
      aria-label={label}
      tabIndex={0}
      onScroll={(event) => updateRange(event.currentTarget)}
    >
      {total === 0 ? (
        <li className="empty">{emptyMessage}</li>
      ) : (
        <>
          <li aria-hidden="true" style={{ height: total * rowHeight }} />
          {indices.map((index) => (
            <FollowingRow
              key={users[index].userId}
              user={users[index]}
              highlightTerm={highlightTerm}
              highlighting={highlighting}
              index={index}
              rowHeight={rowHeight}
              total={total}
              showRelationships={showRelationships}
              unfollowingId={unfollowingId}
              onUnfollow={onUnfollow}
              onFocusedUserChange={setFocusedUserId}
              messages={messages}
            />
          ))}
        </>
      )}
    </ul>
  );
});
