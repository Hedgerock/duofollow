import { useCallback, useEffect, useRef, useState } from 'react';

type NotificationKind = 'info' | 'success' | 'error';

interface NotificationInput {
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

  return { visible: queue.slice(0, VISIBLE_LIMIT), notify, dismiss };
}

interface ToastProps {
  notification: ToastNotification;
  dismiss: (id: number) => void;
}

function Toast({ notification, dismiss }: ToastProps) {
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
        aria-label={`Закрыть уведомление «${title}»`}
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
}

export function NotificationViewport({ notifications, dismiss }: NotificationViewportProps) {
  return (
    <ol
      className="toast-stack"
      aria-label="Уведомления"
      aria-live="polite"
      aria-relevant="additions"
      aria-atomic="false"
    >
      {notifications.map((notification) => (
        <Toast key={notification.id} notification={notification} dismiss={dismiss} />
      ))}
    </ol>
  );
}
