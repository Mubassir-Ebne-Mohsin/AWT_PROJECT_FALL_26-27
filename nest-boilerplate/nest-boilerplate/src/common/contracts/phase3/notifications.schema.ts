import { z } from "zod";
export const NOTIFICATION_KINDS = [
  "support_reply",
  "report_status",
  "support_new_report",
  "support_assigned",
  "reporter_reply",
] as const;
export const notificationKindSchema = z.enum(NOTIFICATION_KINDS);
export const notificationSchema = z.strictObject({
  id: z.uuid(),
  kind: notificationKindSchema,
  refId: z.uuid(),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});
export const notificationCursorSchema = z.strictObject({
  at: z.iso.datetime(),
  id: z.uuid(),
});
export const notificationsPageSchema = z.strictObject({
  generatedAt: z.iso.datetime(),
  items: z.array(notificationSchema).max(50),
  next: notificationCursorSchema.nullable(),
  unreadCount: z.number().int().nonnegative(),
});
export const notificationQuerySchema = z
  .strictObject({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    before: z.iso.datetime().optional(),
    beforeId: z.uuid().optional(),
  })
  .refine(
    (q) => Boolean(q.before) === Boolean(q.beforeId),
    "Use the full cursor",
  );
export const notificationPreferenceSchema = z.strictObject({
  kind: notificationKindSchema,
  muted: z.boolean(),
});
export const notificationPreferencesSchema = z
  .array(notificationPreferenceSchema)
  .length(5);
export const notificationReadSchema = z.strictObject({
  updated: z.number().int().nonnegative(),
});
export const notificationTargetSchema = z.strictObject({
  href: z
    .string()
    .regex(/^\/(reports|support)\/[a-f0-9-]{36}$/)
    .nullable(),
});
