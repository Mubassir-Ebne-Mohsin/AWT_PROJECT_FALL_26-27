import { z } from "zod";

// P4 account self-service. Every operation is about the signed-in person's OWN account; nothing here takes another
// account's id. Plain text only; the server never interprets display names as markup.

const noControlChars = (t: string) => !/[\u0000-\u001f\u007f]/.test(t);

export const DISPLAY_NAME_MAX = 60;
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a display name")
  .max(DISPLAY_NAME_MAX, `Use at most ${DISPLAY_NAME_MAX} characters`)
  .refine(noControlChars, "Use plain text only");

export const profileUpdateSchema = z.strictObject({ displayName: displayNameSchema });

// The same rule as registration, so a new password is never weaker than a first one.
export const newPasswordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Use at most 128 characters")
  .regex(/^(?=.*[A-Za-z])(?=.*\d)/, "Include at least one letter and one number");

export const passwordChangeSchema = z.strictObject({
  currentPassword: z.string().min(1, "Enter your current password").max(128),
  newPassword: newPasswordSchema,
});

/** The words a person types to confirm deleting their account. */
export const DELETE_PHRASE = "delete my account";
export const deleteAccountSchema = z.strictObject({
  password: z.string().min(1, "Enter your password").max(128),
  confirmation: z.string().refine((t) => t.trim().toLowerCase() === DELETE_PHRASE, `Type "${DELETE_PHRASE}" to confirm`),
});

/** Runs kept in full per design in an export; older runs are listed without their large result payload. */
export const EXPORT_RUNS_IN_FULL = 20;

const when = z.iso.datetime();
import { notificationSchema, notificationPreferencesSchema } from "@/common/contracts/phase3/notifications.schema";
export const accountExportSchema = z.strictObject({
  notifications: z.array(notificationSchema),
  notificationPreferences: notificationPreferencesSchema,
  format: z.literal("stressforge-export-v1"),
  exportedAt: when,
  note: z.string(),
  account: z.strictObject({ id: z.uuid(), email: z.string(), displayName: z.string(), createdAt: when, roles: z.array(z.string()) }),
  designs: z.array(
    z.strictObject({
      id: z.uuid(),
      name: z.string(),
      description: z.string(),
      source: z.string(),
      templateId: z.string().nullable(),
      revision: z.number().int(),
      archivedAt: when.nullable(),
      createdAt: when,
      updatedAt: when,
      graph: z.unknown(),
      traffic: z.unknown(),
      versions: z.array(z.strictObject({ revision: z.number().int(), origin: z.string(), createdAt: when, snapshot: z.unknown() })),
      notes: z.array(z.strictObject({ revision: z.number().int(), kind: z.string(), text: z.string(), createdAt: when })),
      runs: z.array(z.strictObject({ id: z.uuid(), status: z.string(), createdAt: when, completedAt: when.nullable(), result: z.unknown().optional() })),
      shareLinks: z.array(z.strictObject({ scope: z.string(), revision: z.number().int(), createdAt: when, expiresAt: when.nullable(), revokedAt: when.nullable(), openCount: z.number().int() })),
    }),
  ),
  reviewsOfMyDesigns: z.array(
    z.strictObject({
      designId: z.uuid(),
      revision: z.number().int(),
      reviewer: z.string(),
      createdAt: when,
      revokedAt: when.nullable(),
      comments: z.array(z.strictObject({ author: z.string(), text: z.string().nullable(), createdAt: when })),
    }),
  ),
  commentsIWrote: z.array(z.strictObject({ text: z.string().nullable(), createdAt: when })),
  challengesIManage: z.array(
    z.strictObject({ id: z.uuid(), title: z.string(), summary: z.string(), status: z.string(), goal: z.unknown(), traffic: z.unknown(), createdAt: when, publishedAt: when.nullable(), archivedAt: when.nullable() }),
  ),
  challengeAttempts: z.array(
    z.strictObject({
      challengeTitle: z.string(),
      startedAt: when,
      submissions: z.array(z.strictObject({ designRevision: z.number().int(), status: z.string(), result: z.unknown(), createdAt: when })),
      feedbackReceived: z.array(z.strictObject({ from: z.string(), text: z.string(), createdAt: when })),
    }),
  ),
  roleHistory: z.array(z.strictObject({ at: when, action: z.string(), role: z.string().nullable() })),
  /** Problem reports this account wrote. Support's public replies are included; internal notes never are. */
  problemReports: z.array(
    z.strictObject({
      code: z.string(),
      category: z.string(),
      title: z.string(),
      status: z.string(),
      createdAt: when,
      body: z.string(),
      expected: z.string().nullable(),
      messages: z.array(z.strictObject({ from: z.enum(["you", "support"]), text: z.string(), createdAt: when })),
    }),
  ),
});
