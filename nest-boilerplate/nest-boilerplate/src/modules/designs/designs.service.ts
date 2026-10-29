import { recordVersion } from "@/modules/designs/record-version";
import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager, LessThan } from "typeorm";
import { runListQuerySchema, runSummarySchema } from "@/common/contracts/phase3/history.schema";
import { AppException } from "@/common/errors";
import { WithMeta } from "@/common/interceptors/response-envelope.interceptor";
import {
  designSchema,
  designSummarySchema,
  listQuerySchema,
} from "@/common/contracts/phase2/api.schema";
import { SavedDesign } from "@/modules/designs/entities/design.entity";
import { SavedRun } from "@/modules/designs/entities/design-run.entity";
import { CreateDesignDto, PatchDesignDto } from "@/modules/designs/designs.dto";
@Injectable()
export class DesignsService {
  constructor(readonly db: DataSource) {}
  async owned(
    owner: string,
    id: string,
    manager: EntityManager = this.db.manager,
    lock = false,
  ) {
    const d = await manager.findOne(SavedDesign, {
      where: { id },
      ...(lock ? { lock: { mode: "pessimistic_write" as const } } : {}),
    });
    if (!d) throw new AppException("NOT_FOUND", "Design not found");
    if (d.ownerId !== owner)
      throw new AppException(
        "FORBIDDEN",
        "This design belongs to another account",
      );
    return d;
  }
  revision(d: SavedDesign, expected: number) {
    if (d.revision !== expected)
      throw new AppException(
        "CONFLICT",
        "The saved design changed. Your draft has been retained.",
        { reason: "REVISION_MISMATCH", currentRevision: d.revision },
      );
  }
  dto(d: SavedDesign) {
    const { ownerId: _owner, ...value } = d;
    return designSchema.parse({
      ...value,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    });
  }
  async create(ownerId: string, dto: CreateDesignDto) {
    return this.db.transaction(async (m) => {
      const now = new Date();
      const repo = m.getRepository(SavedDesign);
      const design = await repo.save(repo.create({ ...dto, ownerId, revision: 1, createdAt: now, updatedAt: now }));
      const value = this.dto(design);
      await recordVersion(m, value, "create");
      return value;
    });
  }
  async get(owner: string, id: string) {
    return this.dto(await this.owned(owner, id));
  }
  async patch(owner: string, id: string, dto: PatchDesignDto) {
    return this.db.transaction(async (m) => {
      const d = await this.owned(owner, id, m, true);
      this.revision(d, dto.expectedRevision);
      const { expectedRevision: _expected, ...fields } = dto;
      Object.assign(d, fields, {
        revision: d.revision + 1,
        updatedAt: new Date(),
      });
      const value = this.dto(await m.save(d));
      await recordVersion(m, value, "edit");
      return value;
    });
  }
  async remove(owner: string, id: string) {
    await this.db.transaction(async (m) => {
      await this.owned(owner, id, m, true);
      await m.delete(SavedDesign, id);
    });
  }
  async summaries(owner: string, page: number, pageSize: number) {
    const [designs, total] = await this.db
      .getRepository(SavedDesign)
      .findAndCount({
        where: { ownerId: owner },
        order: { updatedAt: "DESC", id: "DESC" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
    const data = await Promise.all(
      designs.map(async (d) => {
        const latest = await this.db
          .getRepository(SavedRun)
          .findOne({
            where: { designId: d.id },
            order: { createdAt: "DESC", id: "DESC" },
          });
        const {
          graph: _g,
          traffic: _t,
          schemaVersion: _v,
          ...record
        } = this.dto(d);
        return designSummarySchema.parse({
          ...record,
          nodeCount: d.graph.nodes.length,
          edgeCount: d.graph.edges.length,
          latestRun: latest ? this.runSummary(latest) : null,
        });
      }),
    );
    return { data, total };
  }
  /**
   * Recorded runs of one design, newest first, for the History timeline. The cursor is createdAt, so two
   * runs created in the same millisecond across a page boundary could be skipped; the retained window is small.
   */
  async runList(owner: string, id: string, raw: Record<string, unknown>) {
    await this.owned(owner, id);
    const q = runListQuerySchema.safeParse(raw);
    if (!q.success)
      throw new AppException("VALIDATION_FAILED", "Invalid run list query");
    const rows = await this.db.getRepository(SavedRun).find({
      where: {
        designId: id,
        ...(q.data.before ? { createdAt: LessThan(new Date(q.data.before)) } : {}),
      },
      order: { createdAt: "DESC", id: "DESC" },
      take: q.data.limit,
    });
    return rows.map((row) => runSummarySchema.parse(this.runSummary(row)));
  }
  runSummary(row: SavedRun) {
    const r = row.payload,
      summary =
        r.status === "completed"
          ? r.result.kind === "simulation"
            ? r.result.summary
            : r.result.current
          : null;
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      designRevision: r.designRevision,
      createdAt: r.createdAt,
      verdict: summary?.verdict ?? null,
      p95: summary?.p95 ?? null,
    };
  }
  async list(owner: string, raw: Record<string, unknown>) {
    const parsed = listQuerySchema.safeParse(
      Object.fromEntries(
        Object.entries(raw).map(([k, v]) => [
          k,
          typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v,
        ]),
      ),
    );
    if (!parsed.success)
      throw new AppException("VALIDATION_FAILED", "Invalid pagination");
    const { page, pageSize } = parsed.data,
      result = await this.summaries(owner, page, pageSize);
    return new WithMeta(result.data, { page, pageSize, total: result.total });
  }
  async dashboard(owner: string) {
    const { data: designs, total } = await this.summaries(owner, 1, 10);
    const query = () =>
      this.db
        .getRepository(SavedRun)
        .createQueryBuilder("r")
        .innerJoin(SavedDesign, "d", "d.id=r.design_id AND d.owner_id=:owner", {
          owner,
        });
    // Read the name in the same joined snapshot as the run. A later deletion must
    // not turn the entire dashboard into a 404 during a second ownership lookup.
    const recent = await query()
      .addSelect("d.name", "designName")
      .orderBy("r.createdAt", "DESC")
      .addOrderBy("r.id", "DESC")
      .limit(10)
      .getRawAndEntities<{ r_id: string; designName: string }>();
    const retainedRuns = await query().getCount();
    const names = new Map(recent.raw.map((row) => [row.r_id, row.designName]));
    const recentRuns = recent.entities.map((r) => ({
      ...this.runSummary(r),
      designId: r.designId,
      designName: names.get(r.id)!,
    }));
    return {
      designs,
      recentRuns,
      counts: { designs: total, retainedRuns },
      countsLabel: "Runs in the retained window" as const,
    };
  }
}
