import { z } from "zod";
import { reportSchema } from "@/common/contracts/phase3/report.schema";

// M16.2 Read-only share links. A link freezes one revision (and, for "design_report", one recorded result) at
// creation. The public view is a purpose-built allow-list: no owner details, no internal design id, no private
// notes. Core product contract, independent of the optional AI contracts.

export const SHARE_MAX_ACTIVE = 5;
export const SHARE_EXPIRY_DAYS = [7, 30, 90] as const;

export const shareScopeSchema = z.enum(["design", "design_report"]);
export const shareStatusSchema = z.enum(["active", "expired", "revoked"]);

/**
 * `design` shares the graph and traffic only: no result, no Limits, no notes. `design_report` also shares the
 * chosen result and Limits disclosure; `includeDecisions` then adds Decision notes (assumptions stay private).
 * `expiresInDays: null` means the link does not expire until revoked.
 */
export const createShareRequestSchema = z
  .strictObject({
    scope: shareScopeSchema,
    revision: z.number().int().positive().optional(),
    run: z.uuid().optional(),
    includeDecisions: z.boolean().default(false),
    expiresInDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.null()]).default(30),
  })
  .refine((v) => v.scope === "design_report" || (!v.includeDecisions && v.run === undefined), "A design-only link carries no result or notes");

/** What the owner sees about a link. The secret is never part of it after creation. */
export const shareSchema = z.strictObject({
  id: z.uuid(),
  designId: z.uuid(),
  scope: shareScopeSchema,
  revision: z.number().int().positive(),
  runId: z.uuid().nullable(),
  includeDecisions: z.boolean(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  lastOpenedAt: z.iso.datetime().nullable(),
  openCount: z.number().int().nonnegative(),
  status: shareStatusSchema,
});

/** Returned once, at creation. Only a hash of the token is stored, so it cannot be shown again. */
export const shareCreatedSchema = shareSchema.extend({ token: z.string().min(40) });

/** The token travels in a POST body, never in a URL, so access logs never record it. */
export const openShareRequestSchema = z.strictObject({
  token: z.string().min(20).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

const sharedReportSchema = reportSchema.omit({ designId: true });

export const sharedViewSchema = z.strictObject({
  scope: shareScopeSchema,
  sharedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  report: sharedReportSchema,
});

export type SharedView = z.infer<typeof sharedViewSchema>;
