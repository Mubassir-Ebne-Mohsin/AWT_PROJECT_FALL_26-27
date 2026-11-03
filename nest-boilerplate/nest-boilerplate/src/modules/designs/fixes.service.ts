import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppException } from "@/common/errors";
import { currentSimulationRun } from "@/modules/designs/current-run";
import { fixesSchema, type Fixes, type FixSuggestion } from "@/common/contracts/phase3/fixes.schema";
import { allowedCandidates, candidateFixes, improves, MAX_SUGGESTIONS, rankFor, type FixFilter, type Measure } from "@/modules/simulation/engine/fixes";
import { DesignsService } from "@/modules/designs/designs.service";
import { RunsService } from "@/modules/designs/runs.service";
import { SimulationService } from "@/modules/simulation/simulation.service";
import { ExecutionError } from "@/modules/simulation/worker/executor-error";

/**
 * Verified fix suggestions. For a completed run of the saved design that did not pass, it tries a few ordinary edits at the
 * component that limits the design, runs the engine on each edited graph at the run's own traffic, and offers only the edits that
 * helped and made nothing worse. Every figure in the answer is the engine's; nothing is saved and no model is involved. Applying a
 * fix is the person's own save of the edited design, through the editor.
 */
const measure = (s: { verdict: Measure["verdict"]; p95: number; errorRate: number; maxRho: number }): Measure => ({ verdict: s.verdict, p95: s.p95, errorRate: s.errorRate, maxRho: s.maxRho });

@Injectable()
export class FixesService {
  constructor(
    private readonly designs: DesignsService,
    private readonly runs: RunsService,
    private readonly simulation: SimulationService,
  ) {}

  async suggest(owner: string, id: string, request: { expectedRevision: number; runId: string; filter?: FixFilter }, signal: AbortSignal): Promise<Fixes> {
    const { design, run, summary } = await currentSimulationRun(this.designs, this.runs, owner, id, request);
    const baseline = measure(summary);
    const filter: FixFilter = request.filter ?? { exclude: [], preference: "default" };
    const hot = summary.bottleneckId ?? [...summary.nodes].filter((n) => n.type !== "client").sort((a, b) => b.rho - a.rho)[0]?.id ?? null;
    const limiterNode = design.graph.nodes.find((n) => n.id === hot);
    const base = {
      designId: design.id,
      runId: run.id,
      revision: design.revision,
      baseline,
      limiter: limiterNode ? { id: limiterNode.id, label: limiterNode.label, type: limiterNode.type } : null,
      filter,
    };
    if (summary.verdict === "pass") return fixesSchema.parse({ ...base, status: "NOTHING_TO_FIX", suggestions: [], tried: 0, skipped: 0 });

    const all = candidateFixes(design.graph, design.traffic, hot);
    const candidates = allowedCandidates(all, filter);
    if (all.length && !candidates.length) return fixesSchema.parse({ ...base, status: "ALL_EXCLUDED", suggestions: [], tried: 0, skipped: 0 });
    const session = randomUUID();
    const helpful: (FixSuggestion & { effort: number })[] = [];
    let tried = 0,
      skipped = 0;
    for (const [sequence, candidate] of candidates.entries()) {
      if (signal.aborted) throw new AppException("UNAVAILABLE", "The request was cancelled", { reason: "CANCELLED" });
      try {
        const result = await this.simulation.run(
          owner,
          { kind: "preview", snapshot: { schemaVersion: design.schemaVersion, graph: candidate.graph, traffic: design.traffic } },
          { editorSessionId: session, sequence, signal },
        );
        if (!result.preview) {
          skipped++;
          continue;
        }
        tried++;
        const after = measure(result.preview);
        if (improves(baseline, after))
          helpful.push({ id: candidate.id, kind: candidate.kind, title: candidate.title, detail: candidate.detail, assumption: candidate.assumption, after, graph: candidate.graph, effort: candidate.effort });
      } catch (error) {
        if (!(error instanceof ExecutionError)) throw error;
        skipped++;
      }
    }
    const suggestions = rankFor(helpful, filter.preference).slice(0, MAX_SUGGESTIONS).map(({ effort: _effort, ...fix }) => fix);
    const status = suggestions.length ? "SUGGESTIONS" : tried === 0 && skipped > 0 ? "INCOMPLETE" : "NO_IMPROVEMENT_FOUND";
    return fixesSchema.parse({ ...base, status, suggestions, tried, skipped });
  }
}
