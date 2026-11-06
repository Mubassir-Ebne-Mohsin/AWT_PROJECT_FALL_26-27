import type { NotificationKind } from "@/lib/api/notifications";
export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  support_reply: "Support replied to your report",
  report_status: "Your report's status changed",
  support_new_report: "A new report arrived",
  support_assigned: "A report was assigned to you",
  reporter_reply: "A reporter replied",
};
export const NOTIFICATION_PREFERENCE_LABELS: Record<NotificationKind, string> =
  {
    support_reply: "Support replies",
    report_status: "Report status changes",
    support_new_report: "New reports (Support staff)",
    support_assigned: "Assignments (Support staff)",
    reporter_reply: "Reporter replies (Support staff)",
  };
export function notificationDelay(failures: number) {
  return 30000 * 2 ** Math.min(3, Math.max(0, failures));
}
export function unreadLabel(n: number) {
  return n > 99 ? "99+" : String(Math.max(0, n));
}
