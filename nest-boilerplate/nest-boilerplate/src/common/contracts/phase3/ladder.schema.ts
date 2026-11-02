import { z } from "zod";
import { fixMeasureSchema } from "@/common/contracts/phase3/fixes.schema";

/** The load ladder: the saved design at a few multiples of its request rate. Every figure is the model's; nothing is saved. */
export const ladderRequestSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  /** A completed simulation run of the current saved revision. */
  runId: z.uuid(),
});

const limiterSchema = z.strictObject({ id: z.string(), label: z.string(), type: z.string() }).nullable();

export const ladderRungSchema = z.strictObject({
  /** 1 for the recorded run itself, otherwise the multiple of its request rate. */
  multiplier: z.number().positive(),
  rps: z.number().nonnegative(),
  /** OK: calculated. TOO_LARGE: the rate would be beyond what the model accepts. UNAVAILABLE: the calculation service was busy or
   * could not calculate it. */
  status: z.enum(["OK", "TOO_LARGE", "UNAVAILABLE"]),
  measure: fixMeasureSchema.nullable(),
  /** The component the model says limits the design at this load, if it names one. */
  limiter: limiterSchema,
});

export const ladderSchema = z.strictObject({
  designId: z.uuid(),
  runId: z.uuid(),
  revision: z.number().int().positive(),
  /** The recorded run, then each multiple, lowest load first. */
  rungs: z.array(ladderRungSchema).min(1).max(6),
});

export type Ladder = z.infer<typeof ladderSchema>;
export type LadderRung = z.infer<typeof ladderRungSchema>;
