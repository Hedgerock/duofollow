import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { NonMutualFollowingUser } from '../extension/src/dto/DuolingoFollowingDto';

const ROW_HEIGHT = 68;
const OVERSCAN = 4;

interface ListProps {
  users: NonMutualFollowingUser[];
  filterKey: string;
  emptyMessage: string;
}

interface RowProps {
  user: NonMutualFollowingUser;
  index: number;
  total: number;
  onFocusedIndexChange: (index: number | null) => void;
}

const FollowingRow = memo(function FollowingRow({
  user: { userId, displayName, username },
  index,
  total,
  onFocusedIndexChange,
}: RowProps) {
  const name = displayName || username || `Пользователь ${userId}`;
  const identifier = username ? `@${username}` : `ID ${userId}`;

  return (
    <li
      className="user virtual-following-row"
      style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
      aria-posinset={index + 1}
      aria-setsize={total}
      onFocus={() => onFocusedIndexChange(index)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onFocusedIndexChange(null);
        }
      }}
    >
      {username && (
        <a
          className="profile-card-link"
          href={`https://www.duolingo.com/profile/${encodeURIComponent(username)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Открыть профиль ${name} (${identifier}) в новой вкладке`}
        />
      )}
      <div className="user-info profile-card-text">
        <strong title={name}>{name}</strong>
        <span title={identifier}>{identifier}</span>
      </div>
    </li>
  );
});

export function VirtualFollowingList({ users, filterKey, emptyMessage }: ListProps) {
  const viewportRef = useRef<HTMLUListElement>(null);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const total = users.length;

  const updateRange = useCallback(
    (viewport: HTMLUListElement) => {
      const height = viewport.clientHeight;
      const maxScrollTop = Math.max(0, total * ROW_HEIGHT - height);
      const top = Math.max(0, Math.min(viewport.scrollTop, maxScrollTop));
      const start = Math.max(0, Math.floor(top / ROW_HEIGHT) - OVERSCAN);
      const end = Math.min(total, Math.ceil((top + height) / ROW_HEIGHT) + OVERSCAN);

      setRange((previous) =>
        previous.start === start && previous.end === end ? previous : { start, end },
      );
    },
    [total],
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    viewport.scrollTop = 0;
    updateRange(viewport);

    const observer = new ResizeObserver(() => updateRange(viewport));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [filterKey, updateRange]);

  const end = Math.min(range.end, total);
  const indices = Array.from(
    { length: Math.max(0, end - range.start) },
    (_, offset) => range.start + offset,
  );

  if (
    focusedIndex !== null &&
    focusedIndex < total &&
    (focusedIndex < range.start || focusedIndex >= end)
  ) {
    indices.push(focusedIndex);
    indices.sort((left, right) => left - right);
  }

  return (
    <ul
      ref={viewportRef}
      className="users live-following-list virtual-following"
      role="list"
      aria-label="Невзаимные подписки"
      tabIndex={0}
      onScroll={(event) => updateRange(event.currentTarget)}
    >
      {total === 0 ? (
        <li className="empty">{emptyMessage}</li>
      ) : (
        <>
          <li aria-hidden="true" style={{ height: total * ROW_HEIGHT }} />
          {indices.map((index) => (
            <FollowingRow
              key={users[index].userId}
              user={users[index]}
              index={index}
              total={total}
              onFocusedIndexChange={setFocusedIndex}
            />
          ))}
        </>
      )}
    </ul>
  );
}
