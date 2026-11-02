import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppException } from "@/common/errors";
import { ladderSchema, type Ladder, type LadderRung } from "@/common/contracts/phase3/ladder.schema";
import { currentSimulationRun } from "@/modules/designs/current-run";
import { DesignsService } from "@/modules/designs/designs.service";
import { RunsService } from "@/modules/designs/runs.service";
import { ENGINE_BOUNDS } from "@/modules/simulation/engine/budget";
import { SimulationService } from "@/modules/simulation/simulation.service";
import { ExecutionError } from "@/modules/simulation/worker/executor-error";

/**
 * The load ladder. For a completed run of the saved design it runs the same design, with the same shape and bursts, at two, five and
 * ten times the request rate, through the same model as a test run. Every figure is the model's; nothing is saved and no language
 * model is involved. A rate the model does not accept is reported as such, never calculated or guessed.
 */
export const LADDER_MULTIPLIERS = [2, 5, 10] as const;

type Summary = { verdict: "pass" | "strained" | "fail"; p95: number; errorRate: number; maxRho: number; bottleneckId: string | null; nodes: { id: string; label: string; type: string }[] };
const measure = (s: Summary) => ({ verdict: s.verdict, p95: s.p95, errorRate: s.errorRate, maxRho: s.maxRho });
const limiter = (s: Summary) => {
  const node = s.bottleneckId ? s.nodes.find((n) => n.id === s.bottleneckId) : undefined;
  return node ? { id: node.id, label: node.label, type: node.type } : null;
};

@Injectable()
export class LadderService {
  constructor(
    private readonly designs: DesignsService,
    private readonly runs: RunsService,
    private readonly simulation: SimulationService,
  ) {}

  async climb(owner: string, id: string, request: { expectedRevision: number; runId: string }, signal: AbortSignal): Promise<Ladder> {
    const { design, run, summary } = await currentSimulationRun(this.designs, this.runs, owner, id, request);
    const rungs: LadderRung[] = [{ multiplier: 1, rps: design.traffic.rps, status: "OK", measure: measure(summary), limiter: limiter(summary) }];
    const session = randomUUID();
    for (const [sequence, multiplier] of LADDER_MULTIPLIERS.entries()) {
      if (signal.aborted) throw new AppException("UNAVAILABLE", "The request was cancelled", { reason: "CANCELLED" });
      const rps = design.traffic.rps * multiplier;
      if (rps > ENGINE_BOUNDS.maximumRps) {
        rungs.push({ multiplier, rps, status: "TOO_LARGE", measure: null, limiter: null });
        continue;
      }
      try {
        const result = await this.simulation.run(
          owner,
          { kind: "preview", snapshot: { schemaVersion: design.schemaVersion, graph: design.graph, traffic: { ...design.traffic, rps } } },
          { editorSessionId: session, sequence, signal },
        );
        rungs.push(result.preview ? { multiplier, rps, status: "OK", measure: measure(result.preview), limiter: limiter(result.preview) } : { multiplier, rps, status: "UNAVAILABLE", measure: null, limiter: null });
      } catch (error) {
        if (!(error instanceof ExecutionError)) throw error;
        rungs.push({ multiplier, rps, status: "UNAVAILABLE", measure: null, limiter: null });
      }
    }
    return ladderSchema.parse({ designId: design.id, runId: run.id, revision: design.revision, rungs });
  }
}
