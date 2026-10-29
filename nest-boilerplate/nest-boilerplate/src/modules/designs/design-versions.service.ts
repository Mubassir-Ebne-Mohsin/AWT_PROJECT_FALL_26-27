import { Injectable } from "@nestjs/common";
import { inputFingerprint } from "@/common/contracts/phase2/fingerprint";
import { recordVersion } from "@/modules/designs/record-version";
import { DataSource, In, LessThan } from "typeorm";
import { SavedRun } from "@/modules/designs/entities/design-run.entity";
import type { DesignRun } from "@/common/contracts/phase2/api.schema";
import { z } from "zod";
import { compareQuerySchema, comparisonSchema, comparabilityReasonSchema } from "@/common/contracts/phase3/compare.schema";

type Reason = z.infer<typeof comparabilityReasonSchema>;
// Key order must not decide equality.
const stable = (value: unknown): string =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : 1)))
      : v,
  );
import { AppException } from "@/common/errors";
import { DesignsService } from "@/modules/designs/designs.service";
import { DesignVersion } from "@/modules/designs/entities/design-version.entity";
import {
  designVersionSchema,
  versionListQuerySchema,
} from "@/common/contracts/phase3/version.schema";
@Injectable()
export class DesignVersionsService {
  constructor(
    private readonly db: DataSource,
    private readonly designs: DesignsService,
  ) {}
  async list(owner: string, id: string, raw: Record<string, unknown>) {
    await this.designs.owned(owner, id);
    const q = versionListQuerySchema.safeParse(raw);
    if (!q.success)
      throw new AppException("VALIDATION_FAILED", "Invalid version pagination");
    const rows = await this.db
      .getRepository(DesignVersion)
      .find({
        where: {
          designId: id,
          ...(q.data.beforeRevision
            ? { revision: LessThan(q.data.beforeRevision) }
            : {}),
        },
        order: { revision: "DESC" },
        take: q.data.limit,
      });
    return rows.map((row) =>
      designVersionSchema.parse({
        ...row,
        createdAt: row.createdAt.toISOString(),
      }),
    );
  }
  /**
   * Compare two saved versions of one design. The server decides comparability: deltas exist only when both
   * sides have a completed simulation for the compared version, at identical traffic and the same engine
   * version. Otherwise every reason is listed and no number is ever subtracted.
   */
  async compare(owner: string, id: string, raw: Record<string, unknown>) {
    await this.designs.owned(owner, id);
    const parsed = compareQuerySchema.safeParse(raw);
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid comparison request");
    const { a, b } = parsed.data;
    const versionRows = await this.db.getRepository(DesignVersion).find({ where: { designId: id, revision: In([a, b]) } });
    for (const revision of [a, b])
      if (!versionRows.some((row) => row.revision === revision))
        throw new AppException("NOT_FOUND", "That version is no longer retained", { reason: "VERSION_NOT_RETAINED", revision });
    const repo = this.db.getRepository(SavedRun);
    const recent = await repo.find({ where: { designId: id }, order: { createdAt: "DESC", id: "DESC" }, take: 200 });
    const pick = async (revision: number, explicit?: string): Promise<DesignRun | null> => {
      if (explicit) {
        // Scoped to this design: another design's run id is simply not found.
        const row = recent.find((r) => r.id === explicit) ?? (await repo.findOneBy({ id: explicit, designId: id }));
        if (!row) throw new AppException("NOT_FOUND", "Run not found");
        return row.payload;
      }
      return recent.map((r) => r.payload).find((p) => p.kind === "simulation" && p.status === "completed" && p.designRevision === revision) ?? null;
    };
    const runA = await pick(a, parsed.data.runA);
    const runB = await pick(b, parsed.data.runB);
    const reasons: Reason[] = [];
    const check = (run: DesignRun | null, revision: number, side: "A" | "B") => {
      const missing: Reason = side === "A" ? "RUN_MISSING_A" : "RUN_MISSING_B";
      if (!run) return void reasons.push(missing);
      const version = versionRows.find((row) => row.revision === revision)!;
      let matches = run.designRevision === revision;
      if (matches) {
        try {
          matches = run.fingerprint === inputFingerprint({ schemaVersion: version.snapshot.schemaVersion, graph: version.snapshot.graph, traffic: version.snapshot.traffic }, run.engineVersion);
        } catch {
          matches = false;
        }
      }
      if (!matches) reasons.push(side === "A" ? "RUN_NOT_FOR_VERSION_A" : "RUN_NOT_FOR_VERSION_B");
      if (run.kind !== "simulation") reasons.push(side === "A" ? "RUN_NOT_SIMULATION_A" : "RUN_NOT_SIMULATION_B");
      else if (run.status !== "completed") reasons.push(side === "A" ? "RUN_NOT_COMPLETED_A" : "RUN_NOT_COMPLETED_B");
    };
    check(runA, a, "A");
    check(runB, b, "B");
    const metrics = (run: DesignRun | null) => {
      if (!run || run.status !== "completed" || run.result.kind !== "simulation") return null;
      const s = run.result.summary;
      const hot = s.bottleneckId ? s.nodes.find((n) => n.id === s.bottleneckId) : undefined;
      return {
        verdict: s.verdict, p50: s.p50, p95: s.p95, p99: s.p99, errorRate: s.errorRate, throughput: s.throughput,
        p95Target: s.traffic.sloP95, errorBudget: s.traffic.errorBudget, bottleneckLabel: hot?.label ?? null,
      };
    };
    const ma = metrics(runA), mb = metrics(runB);
    if (runA && runB && ma && mb) {
      if (stable(runA.snapshot.traffic) !== stable(runB.snapshot.traffic)) reasons.push("TRAFFIC_DIFFERS");
      if (runA.engineVersion !== runB.engineVersion) reasons.push("ENGINE_DIFFERS");
    }
    const comparable = reasons.length === 0 && !!ma && !!mb;
    const side = (revision: number, run: DesignRun | null, m: ReturnType<typeof metrics>) => ({
      revision,
      run: run ? { id: run.id, kind: run.kind, status: run.status, designRevision: run.designRevision, engineVersion: run.engineVersion, createdAt: run.createdAt, metrics: m } : null,
    });
    return comparisonSchema.parse({
      designId: id,
      a: side(a, runA, ma),
      b: side(b, runB, mb),
      comparable,
      reasons,
      deltas: comparable && ma && mb
        ? { p50: mb.p50 - ma.p50, p95: mb.p95 - ma.p95, p99: mb.p99 - ma.p99, errorRate: mb.errorRate - ma.errorRate, throughput: mb.throughput - ma.throughput }
        : null,
    });
  }
  /**
   * Restore saves an old version content as a NEW revision. Old versions are never edited or deleted.
   * The design row is locked and expectedRevision is checked, so a stale view or a parallel save gets a 409.
   */
  async restore(owner: string, id: string, revision: number, expectedRevision: number) {
    if (!Number.isInteger(revision) || revision < 1)
      throw new AppException("VALIDATION_FAILED", "Invalid version revision");
    return this.db.transaction(async (m) => {
      const design = await this.designs.owned(owner, id, m, true);
      this.designs.revision(design, expectedRevision);
      const row = await m.findOneBy(DesignVersion, { designId: id, revision });
      if (!row)
        throw new AppException("NOT_FOUND", "That version is no longer retained", {
          reason: "VERSION_NOT_RETAINED",
        });
      const old = designVersionSchema.parse({
        ...row,
        createdAt: row.createdAt.toISOString(),
      }).snapshot;
      if (old.schemaVersion !== design.schemaVersion)
        throw new AppException("VALIDATION_FAILED", "That version uses an older design format", {
          reason: "RESTORE_SCHEMA_MISMATCH",
        });
      const identical =
        old.name === design.name &&
        old.description === design.description &&
        inputFingerprint({ schemaVersion: old.schemaVersion, graph: old.graph, traffic: old.traffic }) ===
          inputFingerprint({ schemaVersion: design.schemaVersion, graph: design.graph, traffic: design.traffic });
      if (identical)
        throw new AppException("VALIDATION_FAILED", "That version is identical to the current design", {
          reason: "RESTORE_NO_CHANGES",
        });
      Object.assign(design, {
        name: old.name,
        description: old.description,
        graph: old.graph,
        traffic: old.traffic,
        revision: design.revision + 1,
        updatedAt: new Date(),
      });
      const value = this.designs.dto(await m.save(design));
      await recordVersion(m, value, "restore", revision);
      return value;
    });
  }
}
