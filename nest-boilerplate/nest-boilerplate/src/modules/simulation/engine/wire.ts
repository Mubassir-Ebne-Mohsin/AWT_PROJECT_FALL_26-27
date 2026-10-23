import { z } from "zod";
import {
  simulationSchema,
  validationSchema,
} from "@/common/contracts/phase2/result.schema";
import type { Simulation, Validation } from "@/modules/simulation/engine/types";
import { EngineFault } from "@/modules/simulation/engine/budget";

export function bounded(value: number) {
  if (value === Infinity) return { kind: "unbounded" as const };
  if (!Number.isFinite(value) || value < 0)
    throw new EngineFault(
      "COMPUTE_FAILED",
      "The model produced an invalid number.",
    );
  return { kind: "finite" as const, value };
}
export function toValidation(report: Validation) {
  const issue = (i: Validation["errors"][number]) => ({
    code: i.code,
    message: i.msg,
    repair: i.fix,
    nodeIds: i.nodeIds,
    severity: i.level,
  });
  return validationSchema.parse({
    ok: report.ok,
    errors: report.errors.map(issue),
    warnings: report.warnings.map(issue),
  });
}
export function toSummary(
  source: Simulation,
): z.infer<typeof simulationSchema> {
  const { ok: _ok, byId: _byId, bottleneck, ...summary } = source;
  if (Object.keys(source.flows).length > 200)
    throw new EngineFault(
      "COMPLEXITY_LIMIT",
      "This design exceeds the supported flow-output budget.",
    );
  return simulationSchema.parse({
    ...summary,
    validation: toValidation(source.validation),
    bottleneckId: bottleneck?.id ?? null,
    nodes: source.nodes.map((n) => ({
      ...n,
      cap: bounded(n.cap),
      satRps: bounded(n.satRps),
    })),
    queues: source.queues.map((q) => ({ ...q, lag: bounded(q.lag) })),
    flows: Object.entries(source.flows).map(([edge, rps]) => {
      const [from, to] = edge.split(">");
      return { from, to, rps };
    }),
  });
}
