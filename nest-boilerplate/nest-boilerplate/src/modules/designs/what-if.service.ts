import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppException } from "@/common/errors";
import type { Traffic } from "@/common/contracts/phase2/graph.schema";
import { WHATIF_BOUNDS, WHATIF_READ_SHARES, whatIfSchema, type WhatIf, type WhatIfChange } from "@/common/contracts/phase3/what-if.schema";
import { currentSimulationRun } from "@/modules/designs/current-run";
import { DesignsService } from "@/modules/designs/designs.service";
import { RunsService } from "@/modules/designs/runs.service";
import { ENGINE_BOUNDS } from "@/modules/simulation/engine/budget";
import { SimulationService } from "@/modules/simulation/simulation.service";
import { ExecutionError } from "@/modules/simulation/worker/executor-error";

type Summary = { verdict: "pass" | "strained" | "fail"; p95: number; errorRate: number; maxRho: number; bottleneckId: string | null; nodes: { id: string; label: string; type: string }[] };
const measure = (s: Summary) => ({ verdict: s.verdict, p95: s.p95, errorRate: s.errorRate, maxRho: s.maxRho });
const limiter = (s: Summary) => {
  const node = s.bottleneckId ? s.nodes.find((n) => n.id === s.bottleneckId) : undefined;
  return node ? { id: node.id, label: node.label, type: node.type } : null;
};

const refuse = (message: string, reason: string) => new AppException("VALIDATION_FAILED", message, { reason });

/**
 * The traffic after the change. A value outside the bounds is refused with a plain message; it is never clamped, rounded into range
 * or repaired. A change that changes nothing is refused too, so no calculation is spent on it.
 */
export function applyWhatIf(traffic: Traffic, change: WhatIfChange): Traffic {
  if (change.trafficMode === "keep" && change.shape === "keep" && change.readShare === "keep") throw refuse("Choose something to change: the traffic, its shape or the read share.", "WHATIF_NOTHING_TO_CHANGE");
  let rps = traffic.rps;
  if (change.trafficMode === "multiply") {
    const { min, max } = WHATIF_BOUNDS.multiply;
    if (change.value < min || change.value > max) throw refuse("Multiply the traffic by a number from " + min + " to " + max + ".", "WHATIF_OUT_OF_RANGE");
    rps = traffic.rps * change.value;
  } else if (change.trafficMode === "set") {
    const { min, max } = WHATIF_BOUNDS.set;
    if (change.value < min || change.value > max) throw refuse("Set the traffic to between " + min.toLocaleString("en-US") + " and " + max.toLocaleString("en-US") + " requests per second.", "WHATIF_OUT_OF_RANGE");
    rps = change.value;
  }
  return {
    ...traffic,
    rps,
    shape: change.shape === "keep" ? traffic.shape : change.shape,
    readRatio: change.readShare === "keep" ? traffic.readRatio : WHATIF_READ_SHARES[change.readShare],
  };
}

/**
 * What if the traffic changed? For a completed run of the saved design it runs the same design under the changed traffic through the
 * same model as a test run, and sets the two side by side. Every figure is the model's; nothing is saved and no language model is
 * involved. A rate the model does not accept is reported as such, never calculated or guessed.
 */
@Injectable()
export class WhatIfService {
  constructor(
    private readonly designs: DesignsService,
    private readonly runs: RunsService,
    private readonly simulation: SimulationService,
  ) {}

  async ask(owner: string, id: string, request: { expectedRevision: number; runId: string; change: WhatIfChange }, signal: AbortSignal): Promise<WhatIf> {
    const { design, run, summary } = await currentSimulationRun(this.designs, this.runs, owner, id, request);
    const traffic = applyWhatIf(design.traffic, request.change);
    const side = (t: Traffic) => ({ rps: t.rps, shape: t.shape, readRatio: t.readRatio });
    const before = { ...side(design.traffic), status: "OK" as const, measure: measure(summary), limiter: limiter(summary) };
    let after: WhatIf["after"];
    if (traffic.rps > ENGINE_BOUNDS.maximumRps) after = { ...side(traffic), status: "TOO_LARGE", measure: null, limiter: null };
    else {
      if (signal.aborted) throw new AppException("UNAVAILABLE", "The request was cancelled", { reason: "CANCELLED" });
      try {
        const result = await this.simulation.run(
          owner,
          { kind: "preview", snapshot: { schemaVersion: design.schemaVersion, graph: design.graph, traffic } },
          { editorSessionId: randomUUID(), sequence: 0, signal },
        );
        after = result.preview ? { ...side(traffic), status: "OK", measure: measure(result.preview), limiter: limiter(result.preview) } : { ...side(traffic), status: "UNAVAILABLE", measure: null, limiter: null };
      } catch (error) {
        if (!(error instanceof ExecutionError)) throw error;
        after = { ...side(traffic), status: "UNAVAILABLE", measure: null, limiter: null };
      }
    }
    return whatIfSchema.parse({ designId: design.id, runId: run.id, revision: design.revision, change: request.change, before, after });
  }
}
