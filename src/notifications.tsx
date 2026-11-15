import { useCallback, useEffect, useRef, useState } from 'react';
import type { Messages } from './i18n/messages';

type NotificationKind = 'info' | 'success' | 'error';

export interface NotificationInput {
  kind: NotificationKind;
  title: string;
  message?: string;
  group?: string;
}

interface ToastNotification extends NotificationInput {
  id: number;
}

const VISIBLE_LIMIT = 3;

const appearance = {
  info: { icon: 'i', duration: 5500 },
  success: { icon: '✓', duration: 6500 },
  error: { icon: '!', duration: 9500 },
} satisfies Record<NotificationKind, { icon: string; duration: number }>;

export function useNotifications() {
  const [queue, setQueue] = useState<ToastNotification[]>([]);
  const nextId = useRef(0);

  const notify = useCallback((input: NotificationInput) => {
    const item: ToastNotification = { ...input, id: ++nextId.current };

    setQueue((previous) => {
      const matching = input.group
        ? previous.findIndex((entry) => entry.group === input.group)
        : -1;

      if (matching === -1) return [...previous, item];

      const updated = [...previous];
      updated[matching] = item;
      return updated;
    });
  }, []);

  const dismiss = useCallback((id: number) => {
    setQueue((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => setQueue([]), []);
  const dismissGroup = useCallback((group: string, kinds: readonly NotificationKind[]) => {
    setQueue((previous) =>
      previous.filter((item) => item.group !== group || !kinds.includes(item.kind)),
    );
  }, []);

  return { visible: queue.slice(0, VISIBLE_LIMIT), notify, dismiss, dismissGroup, clear };
}

interface ToastProps {
  notification: ToastNotification;
  dismiss: (id: number) => void;
  messages: Messages['notifications'];
}

function Toast({ notification, dismiss, messages }: ToastProps) {
  const { id, kind, title, message } = notification;
  const { duration, icon } = appearance[kind];
  const remaining = useRef(duration);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;

  useEffect(() => {
    if (paused) return;

    const startedAt = performance.now();
    const timeout = window.setTimeout(() => dismiss(id), remaining.current);

    return () => {
      window.clearTimeout(timeout);
      remaining.current = Math.max(0, remaining.current - (performance.now() - startedAt));
    };
  }, [dismiss, id, paused]);

  return (
    <li
      className={`toast toast--${kind}`}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <span className="toast-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="toast-copy">
        <strong>{title}</strong>
        {message && <p>{message}</p>}
      </div>
      <button
        type="button"
        className="toast-close"
        aria-label={messages.close(title)}
        onClick={() => dismiss(id)}
      >
        ×
      </button>
      <span className="toast-progress" aria-hidden="true">
        <span
          className="toast-progress-fill"
          style={{
            animationDuration: `${duration}ms`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        />
      </span>
    </li>
  );
}

interface NotificationViewportProps {
  notifications: ToastNotification[];
  dismiss: ToastProps['dismiss'];
  messages: Messages['notifications'];
}

export function NotificationViewport({
  notifications,
  dismiss,
  messages,
}: NotificationViewportProps) {
  return (
    <ol
      className="toast-stack"
      aria-label={messages.label}
      aria-live="polite"
      aria-relevant="additions"
      aria-atomic="false"
    >
      {notifications.map((notification) => (
        <Toast
          key={notification.id}
          notification={notification}
          dismiss={dismiss}
          messages={messages}
        />
      ))}
    </ol>
  );
}
