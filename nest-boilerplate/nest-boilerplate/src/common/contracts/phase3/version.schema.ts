import { z } from "zod";
import { designSchema } from "@/common/contracts/phase2/api.schema";

// Design versions are core product data (History, Restore, Compare). They deliberately live apart from the
// optional AI contracts so non-AI features never depend on an AI-named file.
export const designVersionSchema = z.strictObject({
  id: z.uuid(),
  designId: z.uuid(),
  revision: z.number().int().positive(),
  origin: z.enum(["baseline", "create", "edit", "restore"]),
  /** Set only for origin "restore": the revision whose content was saved again as this new revision. */
  restoredFromRevision: z.number().int().positive().nullable().default(null),
  createdAt: z.iso.datetime(),
  snapshot: designSchema,
});
export const versionListQuerySchema = z.strictObject({
  beforeRevision: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
