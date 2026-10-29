import { z } from "zod";

// M15 History and Restore. Core product contracts: they do not depend on the optional AI contracts.

/** Restore saves an old version's content as a NEW revision. expectedRevision guards against a stale view. */
export const restoreVersionRequestSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
});

/** Light row for the History timeline. Full results stay behind GET /designs/:id/runs/:runId. */
export const runSummarySchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(["simulation", "limits"]),
  status: z.enum(["pending", "completed", "failed"]),
  designRevision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  verdict: z.enum(["pass", "strained", "fail"]).nullable(),
  p95: z.number().nonnegative().nullable(),
});

/** Newest first. `before` is the createdAt of the last row already received. */
export const runListQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.iso.datetime().optional(),
});
