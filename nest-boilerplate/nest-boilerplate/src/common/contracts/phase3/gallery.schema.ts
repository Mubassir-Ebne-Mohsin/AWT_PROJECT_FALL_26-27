import { z } from "zod";
import { designSchema } from "@/common/contracts/phase2/api.schema";
import { sharedReportSchema } from "@/common/contracts/phase3/share.schema";

// Community gallery (docs/DESIGN-FEED-SCOPE.md, F1 and F3). A post is a frozen snapshot of one revision and one completed run,
// built by the same report code as the owner's report and the share links. It carries the owner's display name, never an email.

export const GALLERY_MAX_ACTIVE = 25;
export const GALLERY_MAX_PER_DAY = 5;

/** Plain text only: no markup is stored or rendered. */
const plain = (max: number) =>
  z.string().trim().max(max).refine((v) => !/[<>]/.test(v), "Plain text only");

export const publishRequestSchema = z.strictObject({
  title: plain(100).min(1),
  description: plain(1000).default(""),
  revision: z.number().int().positive().optional(),
  run: z.uuid().optional(),
  allowRemix: z.boolean().default(true),
  /** The owner states that the design is theirs to publish. */
  confirmOwnership: z.literal(true),
});

export const galleryVerdictSchema = z.enum(["pass", "strained", "fail"]);

export const galleryQuerySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  verdict: galleryVerdictSchema.optional(),
  tag: z.string().trim().max(24).optional(),
  mine: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(12),
});

export const galleryPostSchema = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  ownerName: z.string(),
  isMine: z.boolean(),
  publishedAt: z.iso.datetime(),
  revision: z.number().int().positive(),
  verdict: galleryVerdictSchema,
  p95: z.number().nonnegative(),
  p95Target: z.number().positive(),
  tags: z.array(z.string().max(24)).max(12),
  nodeCount: z.number().int().nonnegative(),
  remixCount: z.number().int().nonnegative(),
  allowRemix: z.boolean(),
});

export const galleryListSchema = z.strictObject({
  items: z.array(galleryPostSchema).max(24),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export const galleryDetailSchema = galleryPostSchema.extend({ report: sharedReportSchema });

export const galleryRemixSchema = z.strictObject({ design: designSchema, remixCount: z.number().int().nonnegative() });

export const galleryUnpublishedSchema = z.strictObject({ id: z.uuid(), unpublishedAt: z.iso.datetime() });
