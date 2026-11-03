import { z } from "zod";
import { fixMeasureSchema } from "@/common/contracts/phase3/fixes.schema";

/**
 * "What if the traffic changed?": the saved design under a different load, calculated by the same model as a test run. Every figure is
 * the model's; nothing is saved and nothing here needs a language model. The same closed form is what the optional AI box fills.
 */
export const WHATIF_BOUNDS = { multiply: { min: 0.1, max: 20 }, set: { min: 1, max: 10_000_000 } } as const;
/** What each read-share word means as a share of reads. Fixed here, never chosen by a model. */
export const WHATIF_READ_SHARES = { mostly_reads: 0.9, balanced: 0.5, mostly_writes: 0.1 } as const;

export const whatIfChangeSchema = z.strictObject({
  /** keep: leave the rate. multiply: the saved rate times `value`. set: the rate becomes `value` requests per second. */
  trafficMode: z.enum(["keep", "multiply", "set"]),
  /** Ignored (give 0) when `trafficMode` is keep. Outside WHATIF_BOUNDS it is refused, never clamped or repaired. */
  value: z.number().finite(),
  shape: z.enum(["keep", "steady", "ramp", "spike"]),
  readShare: z.enum(["keep", "mostly_reads", "balanced", "mostly_writes"]),
});

export const whatIfRequestSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  /** A completed simulation run of the current saved revision. */
  runId: z.uuid(),
  change: whatIfChangeSchema,
});

const limiterSchema = z.strictObject({ id: z.string(), label: z.string(), type: z.string() }).nullable();

const sideSchema = z.strictObject({
  rps: z.number().nonnegative(),
  shape: z.enum(["steady", "ramp", "spike"]),
  readRatio: z.number().min(0).max(1),
  /** OK: calculated. TOO_LARGE: beyond what the model accepts. UNAVAILABLE: the calculation service was busy or could not calculate it. */
  status: z.enum(["OK", "TOO_LARGE", "UNAVAILABLE"]),
  measure: fixMeasureSchema.nullable(),
  limiter: limiterSchema,
});

export const whatIfSchema = z.strictObject({
  designId: z.uuid(),
  runId: z.uuid(),
  revision: z.number().int().positive(),
  change: whatIfChangeSchema,
  /** The recorded run, as it was. */
  before: sideSchema,
  /** The same design under the changed load. */
  after: sideSchema,
});

export type WhatIfChange = z.infer<typeof whatIfChangeSchema>;
export type WhatIf = z.infer<typeof whatIfSchema>;
