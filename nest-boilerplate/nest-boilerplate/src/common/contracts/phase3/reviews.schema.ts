import { z } from "zod";
import { sharedReportSchema } from "@/common/contracts/phase3/share.schema";

// R3 Review grants. An owner shares ONE frozen revision (and the result recorded for it) with ONE named Reviewer
// account. The Reviewer sees the owner's display name only, never their email, and never anything but the frozen
// document. Core product contract, independent of the optional AI contracts and of the frozen phase 2 contract.

export const REVIEW_MAX_ACTIVE = 10;

export const reviewStatusSchema = z.enum(["active", "revoked"]);

/** `revision` defaults to the current one; `run` picks a recorded result of that design (else the latest for the revision). */
export const createReviewRequestSchema = z.strictObject({
  email: z.string().trim().min(3).max(254),
  revision: z.number().int().positive().optional(),
  run: z.uuid().optional(),
});

/** What the owner sees. The owner chose this person, so their email and name are shown back. */
export const reviewGrantSchema = z.strictObject({
  id: z.uuid(),
  designId: z.uuid(),
  reviewer: z.strictObject({ displayName: z.string(), email: z.string() }),
  revision: z.number().int().positive(),
  runId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
  status: reviewStatusSchema,
});

/** One row of the Reviewer's "Shared with me" list. Display name only; no email, no internal design id. */
export const reviewItemSchema = z.strictObject({
  id: z.uuid(),
  designName: z.string(),
  ownerDisplayName: z.string(),
  revision: z.number().int().positive(),
  sharedAt: z.iso.datetime(),
  verdict: z.enum(["pass", "strained", "fail"]).nullable(),
});

export const reviewViewSchema = z.strictObject({
  id: z.uuid(),
  ownerDisplayName: z.string(),
  sharedAt: z.iso.datetime(),
  report: sharedReportSchema,
});

export type ReviewView = z.infer<typeof reviewViewSchema>;
