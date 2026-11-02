import { z } from "zod";
import { graphSchema } from "@/common/contracts/phase2/graph.schema";

/** Verified fix suggestions: every figure comes from running the engine on the edited graph; no model is involved. */
export const fixMeasureSchema = z.strictObject({
  verdict: z.enum(["pass", "strained", "fail"]),
  p95: z.number().nonnegative(),
  errorRate: z.number().min(0).max(1),
  maxRho: z.number().nonnegative(),
});

export const fixSuggestionSchema = z.strictObject({
  /** Stable for the same design and limiting component. */
  id: z.string().min(1).max(80),
  kind: z.enum(["replicas", "capacity", "cache", "readReplica"]),
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(300),
  /** What the fix takes for granted, or null when nothing. */
  assumption: z.string().max(200).nullable(),
  /** The engine's result for the design with this fix, at the same traffic as the run. */
  after: fixMeasureSchema,
  /** The whole design graph with the fix applied, ready to load into the editor. */
  graph: graphSchema,
});

export const fixesRequestSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  /** A completed simulation run of the current saved revision. */
  runId: z.uuid(),
});

export const fixesSchema = z.strictObject({
  designId: z.uuid(),
  runId: z.uuid(),
  revision: z.number().int().positive(),
  /** SUGGESTIONS: one or more fixes help. NOTHING_TO_FIX: the run already passes. NO_IMPROVEMENT_FOUND: none of the fixes tried helped.
   * INCOMPLETE: the calculation service was busy for every fix, so nothing is known. */
  status: z.enum(["SUGGESTIONS", "NOTHING_TO_FIX", "NO_IMPROVEMENT_FOUND", "INCOMPLETE"]),
  /** What the run reported, in the same measures as each fix. */
  baseline: fixMeasureSchema,
  /** The component the fixes are aimed at, or null when there was nothing to aim at. */
  limiter: z.strictObject({ id: z.string(), label: z.string(), type: z.string() }).nullable(),
  suggestions: z.array(fixSuggestionSchema).max(3),
  /** Fixes simulated, and fixes that could not be (busy, over budget). */
  tried: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

export type FixSuggestion = z.infer<typeof fixSuggestionSchema>;
export type Fixes = z.infer<typeof fixesSchema>;
