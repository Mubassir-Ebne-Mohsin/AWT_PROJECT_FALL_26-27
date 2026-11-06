import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/phase3-schema";
type S = components["schemas"];
export type NotificationPage = S["NotificationsPage"];
export type NotificationItem = NotificationPage["items"][number];
export type NotificationKind = NotificationItem["kind"];
export type NotificationPreferences = S["NotificationPreferences"];
const local = { scope: "local" } as const;
export function fetchNotifications(
  cursor?: NonNullable<NotificationPage["next"]>,
  signal?: AbortSignal,
) {
  const q = cursor
    ? `?${new URLSearchParams({ before: cursor.at, beforeId: cursor.id })}`
    : "";
  return api<NotificationPage>("/notifications" + q, { ...local, signal });
}
export const readNotification = (
  id: string | undefined,
  signal?: AbortSignal,
) =>
  api<S["NotificationRead"]>(
    id ? `/notifications/${id}/read` : "/notifications/read-all",
    { ...local, method: "POST", signal },
  );
export const openNotification = (id: string, signal?: AbortSignal) =>
  api<S["NotificationTarget"]>(`/notifications/${id}/open`, {
    ...local,
    method: "POST",
    signal,
  });
export const getNotificationPreferences = (signal?: AbortSignal) =>
  api<NotificationPreferences>("/notifications/preferences", {
    ...local,
    signal,
  });
export const setNotificationPreference = (
  kind: NotificationKind,
  muted: boolean,
  signal?: AbortSignal,
) =>
  api<NotificationPreferences>("/notifications/preferences", {
    ...local,
    method: "PATCH",
    body: { kind, muted },
    signal,
  });
