import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppException } from "@/common/errors";
import { WithMeta } from "@/common/interceptors/response-envelope.interceptor";
import { DesignsService } from "@/modules/designs/designs.service";
import { SavedDesign } from "@/modules/designs/entities/design.entity";
import type { SavedRun } from "@/modules/designs/entities/design-run.entity";
import type { CreateDesignDto } from "@/modules/designs/designs.dto";
import {
  archiveStateSchema,
  libraryItemSchema,
  libraryQuerySchema,
} from "@/common/contracts/phase3/library.schema";

/** Result of the most recent completed run, whichever kind: a simulation summary or a Limits "current" summary. */
const VERDICT = `CASE WHEN r.payload->>'status' = 'completed'
  THEN COALESCE(r.payload #>> '{result,summary,verdict}', r.payload #>> '{result,current,verdict}') END`;
const FROM = `FROM designs d LEFT JOIN LATERAL (
  SELECT payload, created_at FROM design_runs WHERE design_id = d.id ORDER BY created_at DESC, id DESC LIMIT 1
) r ON true`;
const ORDER = {
  updated: "d.updated_at DESC, d.id DESC",
  name: "lower(d.name) ASC, d.id ASC",
  lastRun: "r.created_at DESC NULLS LAST, d.updated_at DESC, d.id DESC",
} as const;

/**
 * M15.5 Designs list: owner-only search, filters, sorting, duplicate and a reversible archive.
 * Every value reaches SQL as a bound parameter; search text is escaped so % and _ are matched literally.
 */
@Injectable()
export class DesignLibraryService {
  constructor(
    private readonly db: DataSource,
    private readonly designs: DesignsService,
  ) {}

  async list(owner: string, raw: Record<string, unknown>) {
    const parsed = libraryQuerySchema.safeParse(raw);
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid design list query");
    const { q, sort, verdict, archived, page, pageSize } = parsed.data;
    const params: unknown[] = [owner];
    const where = ["d.owner_id = $1"];
    if (archived === "active") where.push("d.archived_at IS NULL");
    if (archived === "archived") where.push("d.archived_at IS NOT NULL");
    if (q) {
      params.push("%" + q.replace(/[\\%_]/g, "\\$&") + "%");
      const n = params.length;
      where.push(`(d.name ILIKE $${n} ESCAPE '\\' OR d.description ILIKE $${n} ESCAPE '\\')`);
    }
    if (verdict === "none") where.push(`(${VERDICT}) IS NULL`);
    else if (verdict) {
      params.push(verdict);
      where.push(`(${VERDICT}) = $${params.length}`);
    }
    const clause = where.join(" AND ");
    const total = (await this.db.query(`SELECT count(*)::int AS n ${FROM} WHERE ${clause}`, params))[0].n as number;
    const rows = (await this.db.query(
      `SELECT d.id, d.name, d.description, d.revision, d.created_at AS "createdAt", d.updated_at AS "updatedAt",
        d.archived_at AS "archivedAt", jsonb_array_length(d.graph->'nodes') AS "nodeCount",
        jsonb_array_length(d.graph->'edges') AS "edgeCount", r.payload AS run
       ${FROM} WHERE ${clause} ORDER BY ${ORDER[sort]} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    )) as Array<Record<string, unknown> & { createdAt: Date; updatedAt: Date; archivedAt: Date | null; run: SavedRun["payload"] | null }>;
    const data = rows.map((row) =>
      libraryItemSchema.parse({
        id: row.id,
        name: row.name,
        description: row.description,
        revision: row.revision,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
        nodeCount: row.nodeCount,
        edgeCount: row.edgeCount,
        latestRun: row.run ? this.designs.runSummary({ payload: row.run } as SavedRun) : null,
      }),
    );
    return new WithMeta(data, { page, pageSize, total });
  }

  /** A new, independent design with the same content. Runs, notes and archive state are not copied. */
  async duplicate(owner: string, id: string) {
    const d = await this.designs.owned(owner, id);
    const name = ("Copy of " + d.name).slice(0, 100).trimEnd();
    return this.designs.create(owner, {
      schemaVersion: d.schemaVersion,
      name,
      description: d.description,
      source: d.source,
      templateId: d.templateId,
      graph: d.graph,
      traffic: d.traffic,
    } as CreateDesignDto);
  }

  /** Idempotent. Only visibility changes: revision, updatedAt, versions, runs and notes stay exactly as they were. */
  async setArchived(owner: string, id: string, archived: boolean) {
    return this.db.transaction(async (m) => {
      const design = await this.designs.owned(owner, id, m, true);
      const archivedAt = archived ? (design.archivedAt ?? new Date()) : null;
      if ((design.archivedAt?.getTime() ?? null) !== (archivedAt?.getTime() ?? null))
        await m.update(SavedDesign, { id }, { archivedAt });
      return archiveStateSchema.parse({
        designId: id,
        archived: archivedAt !== null,
        archivedAt: archivedAt ? archivedAt.toISOString() : null,
      });
    });
  }
}
