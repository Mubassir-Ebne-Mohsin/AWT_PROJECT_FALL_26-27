"use client";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { Modal } from "@/components/ui/modal";
import { useNotifications } from "@/components/notifications/use-notifications";
import { NOTIFICATION_LABELS, unreadLabel } from "@/lib/notifications";
import { confirmDraftNavigation } from "@/lib/draft-navigation";
export function NotificationBell({ pathname }: { pathname: string }) {
  const { user } = useAuth();
  return user ? <Bell key={user.id + pathname} /> : null;
}
function Bell() {
  const n = useNotifications(),
    router = useRouter();
  const [expanded, setExpanded] = useState(false),
    [notice, setNotice] = useState("");
  const count = n.data?.unreadCount ?? 0;
  const closeRef = useRef<HTMLButtonElement>(null);
  const run = (action: () => void) => {
    closeRef.current?.focus();
    action();
  };
  const close = () => {
    n.cancel();
    setExpanded(false);
  };
  async function open(id: string) {
    const target = await n.open(id);
    if (!target) return;
    if (!target.href) {
      setNotice("This report is no longer available to you.");
      return;
    }
    if (confirmDraftNavigation(target.href)) {
      setExpanded(false);
      router.push(target.href);
    }
  }
  return (
    <>
      <button
        className="btn btn-ghost icon notification-trigger"
        aria-label={
          n.data
            ? `Notifications, ${unreadLabel(count)} unread${n.paused ? ", updates paused" : ""}${n.error ? ", updates unavailable" : ""}`
            : n.error
              ? "Notifications, updates unavailable"
              : "Notifications, loading"
        }
        aria-haspopup="dialog"
        aria-controls="notifications-panel"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(!expanded);
          setNotice("");
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {count > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {unreadLabel(count)}
          </span>
        )}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {!n.data
          ? n.error
            ? "Notifications unavailable"
            : "Loading notifications"
          : count
            ? `${unreadLabel(count)} unread notifications`
            : "No unread notifications"}
      </span>
      {expanded &&
        createPortal(
          <Modal label="Notifications" onClose={close} center>
            <div
              id="notifications-panel"
              className="notification-panel"
              onKeyDown={(e) => {
                if (
                  ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") ||
                  e.key === "?"
                ) {
                  close();
                  return;
                }
                if (e.key !== "Tab" && e.key !== "Escape") e.stopPropagation();
              }}
            >
              <div className="panel-h">
                <h2 className="h3">Notifications</h2>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={close}
                  ref={closeRef}
                  aria-label="Close notifications"
                >
                  Close
                </button>
              </div>
              <div className="r2-pad stack">
                <div className="row">
                  <button
                    className="btn btn-sm"
                    disabled={n.busy || !count}
                    onClick={() => run(() => void n.read())}
                  >
                    Mark all as read
                  </button>
                  <button
                    className="btn btn-sm"
                    aria-pressed={n.paused}
                    onClick={n.pause}
                  >
                    {n.paused ? "Resume updates" : "Pause updates"}
                  </button>
                  <button
                    className="btn btn-sm"
                    disabled={n.busy}
                    onClick={() => run(n.refresh)}
                  >
                    Refresh notifications
                  </button>
                </div>
                <p className="hint">
                  Last 90 days. Updates every 30 seconds while visible. Pause to
                  browse older items; updates return to the latest page.
                </p>
                {n.paused && <p role="status">Notification updates paused.</p>}
                {n.error && (
                  <p role="alert">
                    {n.error} Use Refresh notifications to try again.
                  </p>
                )}
                {notice && <p role="status">{notice}</p>}
                {n.busy && !n.data && (
                  <p role="status">Loading notifications…</p>
                )}
                {n.data && !n.data.items.length && <p>No notifications yet.</p>}
                <ul
                  className="notification-list"
                  aria-label="Recent notifications"
                >
                  {n.data?.items.map((item) => (
                    <li
                      key={item.id}
                      className={item.readAt ? "" : "is-unread"}
                      data-testid="notification-item"
                    >
                      <button
                        className="notification-open"
                        aria-label={`${NOTIFICATION_LABELS[item.kind]}, ${item.readAt ? "read" : "unread"}`}
                        aria-describedby={`notification-time-${item.id}`}
                        disabled={n.busy}
                        onClick={() => run(() => void open(item.id))}
                      >
                        {!item.readAt && (
                          <span className="dot" aria-label="Unread" />
                        )}
                        {NOTIFICATION_LABELS[item.kind]}
                        <time
                          id={`notification-time-${item.id}`}
                          className="hint"
                          dateTime={item.createdAt}
                        >
                          {new Date(item.createdAt).toLocaleString()}
                        </time>
                      </button>
                      {!item.readAt && (
                        <button
                          className="btn btn-sm"
                          disabled={n.busy}
                          onClick={() => run(() => void n.read(item.id))}
                          aria-label={`Mark as read: ${NOTIFICATION_LABELS[item.kind]}`}
                        >
                          Mark read
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {n.data?.next && (
                  <button
                    className="btn btn-sm"
                    disabled={n.busy}
                    onClick={() => run(n.more)}
                  >
                    Load earlier notifications
                  </button>
                )}
                <Link
                  href="/settings/preferences"
                  onClick={() => setExpanded(false)}
                >
                  Notification preferences
                </Link>
              </div>
            </div>
          </Modal>,
          document.body,
        )}
    </>
  );
}
