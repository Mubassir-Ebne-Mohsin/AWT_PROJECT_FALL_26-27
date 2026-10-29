import { z } from "zod";

// M15.5 Designs list. The phase 2 list contract stays frozen; this richer, filterable list lives beside it.
// Core product contracts: independent of the optional AI contracts.

export const LIBRARY_SORTS = ["updated", "name", "lastRun"] as const;

/**
 * `archived` defaults to "active": archived designs are hidden from the default list but never deleted, and
 * all their versions, runs and notes are kept. `verdict: "none"` means the design has no completed result yet.
 */
export const libraryQuerySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  sort: z.enum(LIBRARY_SORTS).default("updated"),
  verdict: z.enum(["pass", "strained", "fail", "none"]).optional(),
  archived: z.enum(["active", "archived", "all"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const latestRunSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(["simulation", "limits"]),
  status: z.enum(["pending", "completed", "failed"]),
  designRevision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  verdict: z.enum(["pass", "strained", "fail"]).nullable(),
  p95: z.number().nonnegative().nullable(),
});

export const libraryItemSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
  nodeCount: z.number().int().min(0),
  edgeCount: z.number().int().min(0),
  latestRun: latestRunSchema.nullable(),
});

export const libraryListSchema = z.strictObject({
  data: z.array(libraryItemSchema).max(50),
  meta: z.strictObject({
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(50),
    total: z.number().int().nonnegative(),
  }),
});

/** Archive changes visibility only: no revision, version, run or note is touched. */
export const archiveStateSchema = z.strictObject({
  designId: z.uuid(),
  archived: z.boolean(),
  archivedAt: z.iso.datetime().nullable(),
});
