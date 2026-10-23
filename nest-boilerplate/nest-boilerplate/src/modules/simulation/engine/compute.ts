import { z } from "zod";
import {
  snapshotSchema,
  MODEL_VERSION,
} from "@/common/contracts/phase2/graph.schema";
import {
  outputSchema,
  simulationOutputSchema,
  simulationSchema,
  validationSchema,
} from "@/common/contracts/phase2/result.schema";
import { inputFingerprint } from "@/common/contracts/phase2/fingerprint";
import {
  WorkBudget,
  EngineFault,
  ENGINE_BOUNDS,
} from "@/modules/simulation/engine/budget";
import { validate } from "@/modules/simulation/engine/graph";
import { simulate, paths } from "@/modules/simulation/engine/simulate";
import { timeline, successful } from "@/modules/simulation/engine/timeline";
import { findLimits } from "@/modules/simulation/engine/limits";
import { toSummary, toValidation } from "@/modules/simulation/engine/wire";

export const calculationSchema = z.strictObject({
  kind: z.enum(["simulation", "limits", "preview"]),
  snapshot: snapshotSchema,
});
export type Calculation = z.infer<typeof calculationSchema>;
export const computeResultSchema = z.strictObject({
  validation: validationSchema,
  output: outputSchema.nullable(),
  preview: simulationSchema.nullable(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  engineVersion: z.literal(MODEL_VERSION),
  stats: z.strictObject({
    pairAttempts: z.number().int().nonnegative(),
    walkCalls: z.number().int().nonnegative(),
  }),
});
export type ComputeResult = z.infer<typeof computeResultSchema>;
export function calculate(value: unknown): ComputeResult {
  const { kind, snapshot } = calculationSchema.parse(value);
  const { graph, traffic } = snapshot;
  const budget = new WorkBudget(),
    validation = toValidation(validate(graph));
  const result: ComputeResult = {
    validation,
    output: null,
    preview: null,
    fingerprint: inputFingerprint(snapshot),
    engineVersion: MODEL_VERSION,
    stats: { pairAttempts: 0, walkCalls: 0 },
  };
  if (!validation.ok) return result;
  try {
    if (kind === "limits") result.output = findLimits(graph, traffic, budget);
    else {
      const summary = toSummary(
        successful(simulate(graph, traffic, { budget })),
      );
      if (kind === "preview") result.preview = summary;
      else
        result.output = simulationOutputSchema.parse({
          kind: "simulation",
          summary,
          paths: paths(graph, traffic, { budget }).map(
            ({ seq: _seq, ...path }) => path,
          ),
          timeline: timeline(graph, traffic, budget),
          timelineLabel: "illustrative sampled timeline",
        });
    }
    result.stats = {
      pairAttempts: budget.pairAttempts,
      walkCalls: budget.walkCalls,
    };
    const checked = computeResultSchema.parse(result);
    if (
      Buffer.byteLength(JSON.stringify(checked), "utf8") >
      ENGINE_BOUNDS.responseBytes
    ) {
      throw new EngineFault(
        "COMPLEXITY_LIMIT",
        "This design exceeds the supported result-size budget.",
      );
    }
    return checked;
  } catch (error) {
    if (error instanceof EngineFault) throw error;
    throw new EngineFault(
      "COMPUTE_FAILED",
      "The model could not produce a finite, valid result.",
    );
  }
}
