import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { DataSource } from "typeorm";
import { AppException } from "@/common/errors";
import { DesignsService } from "@/modules/designs/designs.service";
import { DesignShare } from "@/modules/designs/entities/design-share.entity";
import { ReportService } from "@/modules/designs/report.service";
import {
  SHARE_MAX_ACTIVE,
  createShareRequestSchema,
  openShareRequestSchema,
  shareCreatedSchema,
  shareSchema,
  sharedViewSchema,
} from "@/common/contracts/phase3/share.schema";

const DAY_MS = 86_400_000;
const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");
const iso = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * M16.2 Read-only share links. Owner operations lock the design row, so the active-link limit cannot be
 * exceeded by parallel requests. The secret is 256 bits from a CSPRNG, shown once and stored only as a hash.
 * The public read answers every unusable link (unknown, expired, revoked) identically.
 */
@Injectable()
export class DesignSharesService {
  constructor(
    private readonly db: DataSource,
    private readonly designs: DesignsService,
    private readonly reports: ReportService,
  ) {}

  private status(row: DesignShare, now = new Date()) {
    if (row.revokedAt) return "revoked" as const;
    if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return "expired" as const;
    return "active" as const;
  }

  private dto(row: DesignShare) {
    return shareSchema.parse({
      id: row.id,
      designId: row.designId,
      scope: row.scope,
      revision: row.revision,
      runId: row.runId,
      includeDecisions: row.includeDecisions,
      createdAt: iso(row.createdAt),
      expiresAt: iso(row.expiresAt),
      revokedAt: iso(row.revokedAt),
      lastOpenedAt: iso(row.lastOpenedAt),
      openCount: row.openCount,
      status: this.status(row),
    });
  }

  async create(owner: string, designId: string, raw: Record<string, unknown>) {
    const parsed = createShareRequestSchema.safeParse(raw);
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid share request");
    const body = parsed.data;
    const design = await this.designs.owned(owner, designId);
    const revision = body.revision ?? design.revision;
    // The document is assembled and validated BEFORE the link exists, from the same code as the owner's report.
    let report = await this.reports.assemble(designId, revision, body.run ?? null, body.scope === "design_report" && body.includeDecisions ? "decisions" : "none");
    if (body.scope === "design") report = { ...report, run: null, limits: null, noteScope: "none", notes: [] };
    const token = randomBytes(32).toString("base64url");
    return this.db.transaction(async (m) => {
      await this.designs.owned(owner, designId, m, true);
      const active = await m
        .getRepository(DesignShare)
        .createQueryBuilder("s")
        .where("s.design_id = :designId AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > now())", { designId })
        .getCount();
      if (active >= SHARE_MAX_ACTIVE)
        throw new AppException("VALIDATION_FAILED", "This design already has the maximum number of active links", {
          reason: "SHARE_LIMIT_REACHED",
          limit: SHARE_MAX_ACTIVE,
        });
      const now = new Date();
      const row = await m.save(
        m.create(DesignShare, {
          designId,
          tokenHash: hashOf(token),
          scope: body.scope,
          revision,
          runId: report.run?.id ?? null,
          includeDecisions: body.scope === "design_report" && body.includeDecisions,
          report,
          createdAt: now,
          expiresAt: body.expiresInDays === null ? null : new Date(now.getTime() + body.expiresInDays * DAY_MS),
          revokedAt: null,
          lastOpenedAt: null,
          openCount: 0,
        }),
      );
      return shareCreatedSchema.parse({ ...this.dto(row), token });
    });
  }

  async list(owner: string, designId: string) {
    await this.designs.owned(owner, designId);
    const rows = await this.db.getRepository(DesignShare).find({ where: { designId }, order: { createdAt: "DESC", id: "DESC" }, take: 50 });
    return rows.map((row) => this.dto(row));
  }

  /** Idempotent: revoking twice keeps the first revocation time. Opening statistics are kept. */
  async revoke(owner: string, designId: string, shareId: string) {
    return this.db.transaction(async (m) => {
      await this.designs.owned(owner, designId, m, true);
      const row = await m.findOneBy(DesignShare, { id: shareId, designId });
      if (!row) throw new AppException("NOT_FOUND", "Link not found");
      if (!row.revokedAt) {
        row.revokedAt = new Date();
        await m.save(row);
      }
      return this.dto(row);
    });
  }

  /**
   * Public, unauthenticated read. One atomic UPDATE both validates the link (not revoked, not expired) and
   * records the open, so revocation and expiry are enforced on every read and counters cannot drift.
   */
  async open(raw: Record<string, unknown>) {
    const parsed = openShareRequestSchema.safeParse(raw);
    if (!parsed.success) throw new AppException("NOT_FOUND", "This link is no longer available");
    const result = await this.db.query(
      `UPDATE design_shares SET open_count = open_count + 1, last_opened_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
       RETURNING scope, created_at AS "createdAt", expires_at AS "expiresAt", report`,
      [hashOf(parsed.data.token)],
    );
    const rows = (Array.isArray(result[0]) ? result[0] : result) as Array<{ scope: "design" | "design_report"; createdAt: Date; expiresAt: Date | null; report: Record<string, unknown> }>;
    const row = rows[0];
    if (!row) throw new AppException("NOT_FOUND", "This link is no longer available");
    const { designId: _internal, ...report } = row.report;
    return sharedViewSchema.parse({ scope: row.scope, sharedAt: iso(row.createdAt), expiresAt: iso(row.expiresAt), report });
  }
}
