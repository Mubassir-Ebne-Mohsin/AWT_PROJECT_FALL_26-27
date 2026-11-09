import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppException } from "@/common/errors";
import { DesignsService } from "@/modules/designs/designs.service";
import { ReportService } from "@/modules/designs/report.service";
import { GalleryPost } from "@/modules/gallery/entities/gallery-post.entity";
import type { CreateDesignDto } from "@/modules/designs/designs.dto";
import {
  GALLERY_MAX_ACTIVE,
  GALLERY_MAX_PER_DAY,
  galleryDetailSchema,
  galleryListSchema,
  galleryPostSchema,
  galleryQuerySchema,
  galleryRemixSchema,
  galleryUnpublishedSchema,
  publishRequestSchema,
} from "@/common/contracts/phase3/gallery.schema";

const iso = (d: Date | string) => new Date(d).toISOString();

interface Row extends GalleryPost {
  ownerName: string;
}

/** A driver may return rows directly or as [rows, count]; both are handled the same way as the share service. */
const rowsOf = <T>(result: unknown): T[] => (Array.isArray(result) && Array.isArray(result[0]) ? (result[0] as T[]) : (result as T[]));

/**
 * Community gallery. A post is a frozen snapshot of one revision and one completed run, assembled by the same report
 * code as the owner's report, with no notes. Owners publish and unpublish; everyone signed in can read and remix.
 * Nothing in a post is live: a remix is a new private design that shares nothing with the original afterwards.
 */
@Injectable()
export class GalleryService {
  constructor(
    private readonly db: DataSource,
    private readonly designs: DesignsService,
    private readonly reports: ReportService,
  ) {}

  private post(row: Row, viewer: string) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      ownerName: row.ownerName,
      isMine: row.ownerId === viewer,
      publishedAt: iso(row.publishedAt),
      revision: row.revision,
      verdict: row.verdict,
      p95: row.p95,
      p95Target: row.p95Target,
      tags: row.tags,
      nodeCount: row.nodeCount,
      remixCount: row.remixCount,
      allowRemix: row.allowRemix,
    };
  }

  async publish(owner: string, designId: string, raw: Record<string, unknown>) {
    const parsed = publishRequestSchema.safeParse(raw);
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid gallery post");
    const body = parsed.data;
    const design = await this.designs.owned(owner, designId);
    const revision = body.revision ?? design.revision;
    const full = await this.reports.assemble(designId, revision, body.run ?? null, "none");
    const sim = full.run?.status === "completed" ? full.run.simulation : null;
    if (!full.run || !sim)
      throw new AppException("VALIDATION_FAILED", "Run a completed test on this revision before publishing it", { reason: "NO_COMPLETED_RUN" });
    const report = { ...full, noteScope: "none" as const, notes: [] };
    const tags = [...new Set(report.graph.nodes.map((n) => n.type))].sort().slice(0, 12);
    return this.db.transaction(async (m) => {
      await this.designs.owned(owner, designId, m, true);
      const counts = rowsOf<{ active: number; today: number }>(
        await m.query(
          `SELECT count(*) FILTER (WHERE unpublished_at IS NULL)::int AS active,
                  count(*) FILTER (WHERE published_at > now() - interval '24 hours')::int AS today
           FROM gallery_posts WHERE owner_id = $1`,
          [owner],
        ),
      );
      if (counts[0].active >= GALLERY_MAX_ACTIVE)
        throw new AppException("VALIDATION_FAILED", "You have reached the maximum number of published designs", {
          reason: "GALLERY_LIMIT_REACHED",
          limit: GALLERY_MAX_ACTIVE,
        });
      if (counts[0].today >= GALLERY_MAX_PER_DAY)
        throw new AppException("VALIDATION_FAILED", "You can publish at most 5 designs a day", { reason: "GALLERY_DAILY_LIMIT", limit: GALLERY_MAX_PER_DAY });
      const dup = rowsOf(await m.query("SELECT 1 FROM gallery_posts WHERE design_id = $1 AND revision = $2 AND unpublished_at IS NULL", [designId, revision]));
      if (dup.length) throw new AppException("CONFLICT", "This revision is already published", { reason: "ALREADY_PUBLISHED" });
      const who = rowsOf<{ name: string }>(await m.query("SELECT display_name AS name FROM users WHERE id = $1", [owner]));
      const row = await m.save(
        m.create(GalleryPost, {
          ownerId: owner,
          designId,
          title: body.title,
          description: body.description,
          revision,
          runId: report.run?.id ?? null,
          verdict: sim.verdict,
          p95: sim.p95,
          p95Target: sim.p95Target,
          tags,
          nodeCount: report.graph.nodes.length,
          allowRemix: body.allowRemix,
          remixCount: 0,
          report,
          publishedAt: new Date(),
          unpublishedAt: null,
        }),
      );
      return galleryPostSchema.parse(this.post({ ...row, ownerName: who[0]?.name ?? "" } as Row, owner));
    });
  }

  async list(viewer: string, raw: Record<string, unknown>) {
    const parsed = galleryQuerySchema.safeParse(raw);
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid gallery query");
    const { q, verdict, tag, mine, page, pageSize } = parsed.data;
    const params: unknown[] = [];
    const where = ["p.unpublished_at IS NULL"];
    if (q) {
      params.push("%" + q.replace(/[\\%_]/g, "\\$&") + "%");
      where.push(`(p.title ILIKE $${params.length} ESCAPE '\\' OR p.description ILIKE $${params.length} ESCAPE '\\')`);
    }
    if (verdict) {
      params.push(verdict);
      where.push(`p.verdict = $${params.length}`);
    }
    if (tag) {
      params.push(tag);
      where.push(`$${params.length} = ANY(p.tags)`);
    }
    if (mine === "true") {
      params.push(viewer);
      where.push(`p.owner_id = $${params.length}`);
    }
    const clause = where.join(" AND ");
    const total = rowsOf<{ n: number }>(await this.db.query(`SELECT count(*)::int AS n FROM gallery_posts p WHERE ${clause}`, params))[0].n;
    const rows = rowsOf<Row>(
      await this.db.query(
        `SELECT p.id, p.owner_id AS "ownerId", p.title, p.description, p.revision, p.verdict, p.p95, p.p95_target AS "p95Target",
                p.tags, p.node_count AS "nodeCount", p.allow_remix AS "allowRemix", p.remix_count AS "remixCount",
                p.published_at AS "publishedAt", u.display_name AS "ownerName"
         FROM gallery_posts p JOIN users u ON u.id = p.owner_id
         WHERE ${clause} ORDER BY p.published_at DESC, p.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize],
      ),
    );
    return galleryListSchema.parse({ items: rows.map((r) => this.post(r, viewer)), total, page, pageSize });
  }

  private async load(id: string): Promise<Row> {
    const rows = rowsOf<Row>(
      await this.db.query(
        `SELECT p.id, p.owner_id AS "ownerId", p.title, p.description, p.revision, p.verdict, p.p95, p.p95_target AS "p95Target",
                p.tags, p.node_count AS "nodeCount", p.allow_remix AS "allowRemix", p.remix_count AS "remixCount",
                p.published_at AS "publishedAt", p.report, u.display_name AS "ownerName"
         FROM gallery_posts p JOIN users u ON u.id = p.owner_id WHERE p.id = $1 AND p.unpublished_at IS NULL`,
        [id],
      ),
    );
    if (!rows[0]) throw new AppException("NOT_FOUND", "This post is no longer available");
    return rows[0];
  }

  async get(viewer: string, id: string) {
    const row = await this.load(id);
    const { designId: _internal, ...report } = row.report;
    return galleryDetailSchema.parse({ ...this.post(row, viewer), report });
  }

  /** Idempotent for the owner. Anyone else gets "not found", so the existence of a post is not revealed. */
  async unpublish(owner: string, id: string) {
    const found = rowsOf<{ id: string; unpublishedAt: Date }>(
      await this.db.query(
        `UPDATE gallery_posts SET unpublished_at = COALESCE(unpublished_at, now()) WHERE id = $1 AND owner_id = $2 RETURNING id, unpublished_at AS "unpublishedAt"`,
        [id, owner],
      ),
    );
    if (!found[0]) throw new AppException("NOT_FOUND", "This post is no longer available");
    return galleryUnpublishedSchema.parse({ id: found[0].id, unpublishedAt: iso(found[0].unpublishedAt) });
  }

  async remix(viewer: string, id: string) {
    const row = await this.load(id);
    if (!row.allowRemix) throw new AppException("FORBIDDEN", "The owner has not allowed remixing this design", { reason: "REMIX_NOT_ALLOWED" });
    const credit = `Remixed from "${row.title}" by ${row.ownerName}. Others may copy and change a published design in their own account, with credit.`;
    const design = await this.designs.create(viewer, {
      schemaVersion: 1,
      name: ("Remix of " + row.title).slice(0, 100).trimEnd(),
      description: row.description ? credit + "\n\n" + row.description : credit,
      source: "import",
      templateId: null,
      graph: row.report.graph,
      traffic: row.report.traffic,
    } as CreateDesignDto);
    const updated = rowsOf<{ n: number }>(await this.db.query("UPDATE gallery_posts SET remix_count = remix_count + 1 WHERE id = $1 RETURNING remix_count AS n", [id]));
    return galleryRemixSchema.parse({ design, remixCount: updated[0]?.n ?? row.remixCount + 1 });
  }
}
