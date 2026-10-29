import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppException } from "@/common/errors";
import type { DesignRun } from "@/common/contracts/phase2/api.schema";
import { DesignsService } from "@/modules/designs/designs.service";
import { SavedDesign } from "@/modules/designs/entities/design.entity";
import { DesignVersion } from "@/modules/designs/entities/design-version.entity";
import { SavedRun } from "@/modules/designs/entities/design-run.entity";
import { DesignNote } from "@/modules/designs/entities/design-note.entity";
import { reportQuerySchema, reportSchema, type Report } from "@/common/contracts/phase3/report.schema";

type NoteScope = Report["noteScope"];

/** Stated in every report. Plain sentences, no promises beyond what the model does. */
export const REPORT_LIMITATIONS = [
  "These numbers come from a simplified queueing model of your design, not from measuring a real system.",
  "Latency, error and throughput figures are predictions at the traffic settings shown; real systems vary.",
  "Results apply only to the revision and traffic settings shown here. Other revisions can behave differently.",
  "The load-over-time chart, where shown, is an illustrative sample, not a recording.",
];

const iso = (d: Date) => d.toISOString();

/**
 * M16 Report assembly. One place builds the document for both the owner's report and (M16.2) a shared
 * snapshot. `assemble` does no ownership check by design: callers prove access first.
 */
@Injectable()
export class ReportService {
  constructor(
    private readonly db: DataSource,
    private readonly designs: DesignsService,
  ) {}

  async forOwner(owner: string, id: string, raw: Record<string, unknown>) {
    const design = await this.designs.owned(owner, id);
    const q = reportQuerySchema.safeParse(raw);
    if (!q.success) throw new AppException("VALIDATION_FAILED", "Invalid report request");
    return this.assemble(id, q.data.revision ?? design.revision, q.data.run ?? null, "all");
  }

  async assemble(designId: string, revision: number, runId: string | null, noteScope: NoteScope): Promise<Report> {
    const design = await this.db.getRepository(SavedDesign).findOneBy({ id: designId });
    if (!design) throw new AppException("NOT_FOUND", "Design not found");
    const version = await this.db.getRepository(DesignVersion).findOneBy({ designId, revision });
    if (!version) throw new AppException("NOT_FOUND", "That version is no longer retained", { reason: "VERSION_NOT_RETAINED", revision });
    const runs = this.db.getRepository(SavedRun);
    const recent = (await runs.find({ where: { designId }, order: { createdAt: "DESC", id: "DESC" }, take: 200 })).map((r) => r.payload);
    let chosen: DesignRun | null = null;
    if (runId) {
      // Scoped to this design: another design's run id is simply not found.
      const row = await runs.findOneBy({ id: runId, designId });
      if (!row) throw new AppException("NOT_FOUND", "Run not found");
      chosen = row.payload;
    } else {
      chosen = recent.find((p) => p.kind === "simulation" && p.status === "completed" && p.designRevision === revision) ?? null;
    }
    const limitsRun = recent.find((p) => p.kind === "limits" && p.status === "completed" && p.designRevision === revision) ?? null;

    const notes =
      noteScope === "none"
        ? []
        : (await this.db.getRepository(DesignNote).find({ where: { designId }, order: { createdAt: "ASC", id: "ASC" }, take: 100 }))
            .filter((n) => noteScope === "all" || n.kind === "decision")
            .map((n) => ({ revision: n.revision, kind: n.kind, text: n.text, createdAt: iso(n.createdAt) }));

    return reportSchema.parse({
      designId,
      name: version.snapshot.name,
      description: version.snapshot.description,
      revision,
      isCurrentRevision: design.revision === revision,
      versionCreatedAt: iso(version.createdAt),
      generatedAt: new Date().toISOString(),
      graph: version.snapshot.graph,
      traffic: version.snapshot.traffic,
      run: chosen ? this.runBlock(chosen, revision) : null,
      limits: limitsRun ? this.limitsBlock(limitsRun) : null,
      noteScope,
      notes,
      limitations: REPORT_LIMITATIONS,
    });
  }

  private runBlock(run: DesignRun, revision: number) {
    const result = run.status === "completed" ? run.result : null;
    let simulation = null;
    if (result && result.kind === "simulation") {
      const s = result.summary;
      const hot = s.bottleneckId ? s.nodes.find((n) => n.id === s.bottleneckId) : undefined;
      simulation = {
        verdict: s.verdict,
        p50: s.p50,
        p95: s.p95,
        p99: s.p99,
        errorRate: s.errorRate,
        throughput: s.throughput,
        sloMet: s.sloMet,
        p95Target: s.traffic.sloP95,
        errorBudget: s.traffic.errorBudget,
        bottleneck: hot ? { label: hot.label, type: hot.type, rho: hot.rho } : null,
        components: s.nodes.map((n) => ({ label: n.label, type: n.type, region: n.region, peak: n.peak, rho: n.rho, status: n.status, errors: n.errors })),
      };
    }
    return {
      id: run.id,
      kind: run.kind,
      status: run.status,
      designRevision: run.designRevision,
      matchesRevision: run.designRevision === revision,
      engineVersion: run.engineVersion,
      createdAt: run.createdAt,
      traffic: run.snapshot.traffic,
      simulation,
      failure: run.status === "failed" ? { code: run.failure.code, message: run.failure.message } : null,
    };
  }

  private limitsBlock(run: DesignRun) {
    if (run.status !== "completed" || run.result.kind !== "limits") return null;
    const l = run.result;
    const bounded = (v: { kind: "finite"; value: number } | { kind: "unbounded" } | number | null) =>
      v === null ? null : typeof v === "number" ? v : v.kind === "finite" ? v.value : null;
    return {
      runId: run.id,
      createdAt: run.createdAt,
      state: l.state,
      passingRps: l.state === "found" ? l.passingRps : null,
      failingRps: l.state === "found" ? l.failingRps : null,
      headroom: bounded(l.headroom),
      firstComponent: l.firstId ? (l.order.find((o) => o.id === l.firstId)?.label ?? null) : null,
      cause: l.cause,
    };
  }
}
