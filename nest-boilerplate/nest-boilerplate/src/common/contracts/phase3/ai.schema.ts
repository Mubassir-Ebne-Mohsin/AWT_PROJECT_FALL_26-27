import { z } from "zod";
import { designSchema } from "@/common/contracts/phase2/api.schema";
// New jobs use the M12 explanation versions. M11 artifacts keep their stored versions and stay readable.
export const AI_SCHEMA_VERSION = "m12-explanation-v1";
export const AI_PROMPT_VERSION = "m12-explain-v1";
export const LEGACY_AI_PROMPT_VERSION = "m11-foundation-v1";
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
/**
 * Server-owned facts behind an explanation. Units are explicit in every name:
 * latency in milliseconds, error and utilization as fractions (0.01 = 1%).
 * A missing bottleneck is JSON null, never a string or an invented target.
 */
export const aiFactsSchema = z.strictObject({
  verdict: z.enum(["pass", "strained", "fail"]),
  p95Ms: z.number().nonnegative(),
  p95TargetMs: z.number().positive(),
  errorRateFraction: z.number().min(0).max(1),
  errorBudgetFraction: z.number().min(0).max(1),
  bottleneck: z
    .strictObject({
      id: z.string().min(1).max(64),
      label: z.string().min(1).max(40),
      utilizationFraction: z.number().nonnegative(),
    })
    .nullable(),
});
export type AiFacts = z.infer<typeof aiFactsSchema>;
export const aiEvidenceSchema = z.strictObject({
  jobId: z.uuid(),
  designId: z.uuid(),
  runId: z.uuid(),
  designRevision: z.number().int().positive(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  engineVersion: z.string(),
  /** False for M11 artifacts: they predate the verified-facts contract and carry none. */
  structured: z.boolean(),
  facts: aiFactsSchema.nullable(),
  /** The only evidence ids a generated explanation may cite for this job. */
  evidenceIds: z.array(z.string().min(1).max(64)).max(8),
  limitations: z.array(z.string().max(200)).max(4),
});
export type AiEvidence = z.infer<typeof aiEvidenceSchema>;
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
