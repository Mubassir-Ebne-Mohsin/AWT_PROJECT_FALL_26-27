import { z } from "zod";

// M15.4 Compare: two saved versions of the SAME design. The server decides whether their recorded results
// can honestly be compared. Core product contract; independent of the optional AI contracts.

const revision = z.number().int().positive();

/** `a` and `b` are saved revisions of the design. `runA` / `runB` optionally pick the recorded run for each side. */
export const compareQuerySchema = z
  .strictObject({
    a: z.coerce.number().int().positive(),
    b: z.coerce.number().int().positive(),
    runA: z.uuid().optional(),
    runB: z.uuid().optional(),
  })
  .refine((q) => q.a !== q.b, "Choose two different versions");

/** Why two results cannot be compared. None of these is an error: the response still describes both sides. */
export const comparabilityReasonSchema = z.enum([
  "RUN_MISSING_A",
  "RUN_MISSING_B",
  "RUN_NOT_FOR_VERSION_A",
  "RUN_NOT_FOR_VERSION_B",
  "RUN_NOT_COMPLETED_A",
  "RUN_NOT_COMPLETED_B",
  "RUN_NOT_SIMULATION_A",
  "RUN_NOT_SIMULATION_B",
  "TRAFFIC_DIFFERS",
  "ENGINE_DIFFERS",
]);

export const compareMetricsSchema = z.strictObject({
  verdict: z.enum(["pass", "strained", "fail"]),
  p50: z.number().nonnegative(),
  p95: z.number().nonnegative(),
  p99: z.number().nonnegative(),
  errorRate: z.number().min(0).max(1),
  throughput: z.number().nonnegative(),
  p95Target: z.number().positive(),
  errorBudget: z.number().min(0).max(1),
  bottleneckLabel: z.string().nullable(),
});

export const compareSideSchema = z.strictObject({
  revision,
  run: z
    .strictObject({
      id: z.uuid(),
      kind: z.enum(["simulation", "limits"]),
      status: z.enum(["pending", "completed", "failed"]),
      designRevision: revision,
      engineVersion: z.string(),
      createdAt: z.iso.datetime(),
      /** Present only for a completed simulation. */
      metrics: compareMetricsSchema.nullable(),
    })
    .nullable(),
});

export const comparisonSchema = z.strictObject({
  designId: z.uuid(),
  a: compareSideSchema,
  b: compareSideSchema,
  comparable: z.boolean(),
  reasons: z.array(comparabilityReasonSchema).max(10),
  /** Present only when comparable. Each value is b minus a, in the metric's own unit. */
  deltas: z
    .strictObject({
      p50: z.number(),
      p95: z.number(),
      p99: z.number(),
      errorRate: z.number(),
      throughput: z.number(),
    })
    .nullable(),
});
