import { z } from "zod";
import { designSchema } from "@/common/contracts/phase2/api.schema";
export const AI_SCHEMA_VERSION = "m11-summary-v1";
export const AI_PROMPT_VERSION = "m11-foundation-v1";
export const aiRequestSchema = z.strictObject({
  requestId: z.uuid(),
  designId: z.uuid(),
  expectedRevision: z.number().int().positive(),
  runId: z.uuid(),
});
export type AiRequest = z.infer<typeof aiRequestSchema>;
export const aiResultSchema = z.strictObject({
  summary: z.string().trim().min(1).max(500),
  evidenceIds: z.array(z.string().min(1).max(64)).min(1).max(3),
});
export type AiResult = z.infer<typeof aiResultSchema>;
export const aiFailureSchema = z.strictObject({
  reason: z.enum([
    "INTERRUPTED",
    "CANCELLED",
    "DEADLINE",
    "MEMORY_PRESSURE",
    "PROVIDER_UNAVAILABLE",
    "INVALID_OUTPUT",
    "MODEL_CHANGED",
  ]),
  message: z.string().max(200),
});
export const aiJobSchema = z.strictObject({
  id: z.uuid(),
  designId: z.uuid(),
  requestId: z.uuid(),
  designRevision: z.number().int().positive(),
  versionId: z.uuid(),
  runId: z.uuid(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  model: z.string(),
  modelDigest: z.string(),
  promptVersion: z.string(),
  schemaVersion: z.string(),
  status: z.enum([
    "pending",
    "completed",
    "failed",
    "cancelled",
    "interrupted",
  ]),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime(),
  result: aiResultSchema.nullable(),
  failure: aiFailureSchema.nullable(),
  experimental: z.literal(true),
});
export type AiJob = z.infer<typeof aiJobSchema>;
export const aiAcceptedSchema = z.strictObject({
  job: aiJobSchema,
  statusUrl: z.string(),
});
export const aiReadinessSchema = z.strictObject({
  enabled: z.boolean(),
  ready: z.boolean(),
  model: z.string(),
  reason: z.enum([
    "DISABLED",
    "AVAILABLE",
    "BUSY",
    "MODEL_MISSING",
    "PROVIDER_UNAVAILABLE",
    "MEMORY_PRESSURE",
    "INSTANCE_BUSY",
  ]),
});
export const designVersionSchema = z.strictObject({
  id: z.uuid(),
  designId: z.uuid(),
  revision: z.number().int().positive(),
  origin: z.enum(["baseline", "create", "edit"]),
  createdAt: z.iso.datetime(),
  snapshot: designSchema,
});
export const versionListQuerySchema = z.strictObject({
  beforeRevision: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
