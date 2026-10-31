import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppException } from "@/common/errors";
import { AccountRole } from "@/common/enums/account-role.enum";
import { DesignsService } from "@/modules/designs/designs.service";
import { ReportService } from "@/modules/designs/report.service";
import { AccountRolesService } from "@/modules/roles/account-roles.service";
import { ReviewGrant } from "@/modules/reviews/entities/review-grant.entity";
import { User } from "@/modules/users/entities/user.entity";
import { normalizeEmail } from "@/modules/users/users.service";
import { REVIEW_MAX_ACTIVE, createReviewRequestSchema, reviewGrantSchema, reviewItemSchema, reviewViewSchema } from "@/common/contracts/phase3/reviews.schema";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

type Row = { id: string; designName: string; ownerDisplayName: string; revision: number; sharedAt: Date; verdict: string | null };

/**
 * R3 Review grants. The owner names one Reviewer account by email and one revision; the document the Reviewer sees is
 * assembled and frozen at that moment from the same code as the owner's report (no notes), so later edits never reach
 * it. Access is by grant only: a Reviewer who is not the grantee gets "not found", never "forbidden", and the owner's
 * email never leaves the owner's own screens. Owner operations lock the design row so the limit cannot be exceeded.
 */
@Injectable()
export class ReviewGrantsService {
  constructor(
    private readonly db: DataSource,
    private readonly designs: DesignsService,
    private readonly reports: ReportService,
    private readonly roles: AccountRolesService,
  ) {}

  private dto(row: ReviewGrant, reviewer: { displayName: string; email: string }) {
    return reviewGrantSchema.parse({
      id: row.id,
      designId: row.designId,
      reviewer: { displayName: reviewer.displayName, email: reviewer.email },
      revision: row.revision,
      runId: row.runId,
      createdAt: iso(row.createdAt),
      revokedAt: iso(row.revokedAt),
      status: row.revokedAt ? "revoked" : "active",
    });
  }

  async create(owner: string, designId: string, raw: Record<string, unknown>) {
    const parsed = createReviewRequestSchema.safeParse(raw);
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid review request");
    const body = parsed.data;
    const design = await this.designs.owned(owner, designId);
    const reviewer = await this.db.manager.findOneBy(User, { email: normalizeEmail(body.email) });
    if (reviewer && reviewer.id === owner) throw new AppException("CONFLICT", "You cannot share a design with yourself", { reason: "SELF" });
    // One answer for every ineligible case (unknown, not a Reviewer, suspended), so this cannot be used to probe accounts.
    const eligible = !!reviewer && reviewer.accountStatus !== "suspended" && (await this.roles.rolesOf(reviewer.id)).includes(AccountRole.REVIEWER);
    if (!reviewer || !eligible) throw new AppException("NOT_FOUND", "No Reviewer account matches that email", { reason: "NO_REVIEWER" });

    const revision = body.revision ?? design.revision;
    // Assembled and validated BEFORE the grant exists; no notes ever go to a Reviewer.
    const report = await this.reports.assemble(designId, revision, body.run ?? null, "none");
    return this.db.transaction(async (m) => {
      await this.designs.owned(owner, designId, m, true);
      const [{ n }] = (await m.query("SELECT count(*)::int AS n FROM review_grants WHERE design_id = $1 AND revoked_at IS NULL", [designId])) as Array<{ n: number }>;
      if (n >= REVIEW_MAX_ACTIVE)
        throw new AppException("VALIDATION_FAILED", "This design already has the maximum number of active reviews", { reason: "REVIEW_LIMIT_REACHED", limit: REVIEW_MAX_ACTIVE });
      const same = await m.query("SELECT 1 FROM review_grants WHERE design_id = $1 AND reviewer_id = $2 AND revision = $3 AND revoked_at IS NULL", [designId, reviewer.id, revision]);
      if (same.length) throw new AppException("CONFLICT", "This revision is already shared with that Reviewer", { reason: "ALREADY_SHARED" });
      const row = await m.save(
        m.create(ReviewGrant, { designId, ownerId: owner, reviewerId: reviewer.id, revision, runId: report.run?.id ?? null, report, createdAt: new Date(), revokedAt: null }),
      );
      return this.dto(row, reviewer);
    });
  }

  async list(owner: string, designId: string) {
    await this.designs.owned(owner, designId);
    const rows = await this.db.getRepository(ReviewGrant).find({ where: { designId }, order: { createdAt: "DESC", id: "DESC" }, take: 50 });
    const people = new Map<string, User>();
    for (const row of rows) if (!people.has(row.reviewerId)) people.set(row.reviewerId, await this.db.manager.findOneByOrFail(User, { id: row.reviewerId }));
    return rows.map((row) => this.dto(row, people.get(row.reviewerId)!));
  }

  /** Idempotent: revoking twice keeps the first revocation time. */
  async revoke(owner: string, designId: string, grantId: string) {
    return this.db.transaction(async (m) => {
      await this.designs.owned(owner, designId, m, true);
      const row = await m.findOneBy(ReviewGrant, { id: grantId, designId });
      if (!row) throw new AppException("NOT_FOUND", "Review not found");
      if (!row.revokedAt) {
        row.revokedAt = new Date();
        await m.save(row);
      }
      const reviewer = await m.findOneByOrFail(User, { id: row.reviewerId });
      return this.dto(row, reviewer);
    });
  }

  /** The Reviewer's list. Revoked grants are gone from it. Display names only. */
  async sharedWithMe(reviewer: string) {
    const rows = (await this.db.query(
      `SELECT g.id, g.report ->> 'name' AS "designName", u.display_name AS "ownerDisplayName", g.revision,
              g.created_at AS "sharedAt", g.report #>> '{run,simulation,verdict}' AS verdict
         FROM review_grants g JOIN users u ON u.id = g.owner_id
        WHERE g.reviewer_id = $1 AND g.revoked_at IS NULL
        ORDER BY g.created_at DESC, g.id DESC LIMIT 100`,
      [reviewer],
    )) as Row[];
    return rows.map((r) => reviewItemSchema.parse({ ...r, sharedAt: r.sharedAt.toISOString() }));
  }

  /** Not the grantee, revoked, or unknown: all the same "not found". */
  async view(reviewer: string, grantId: string) {
    const rows = (await this.db.query(
      `SELECT g.id, u.display_name AS "ownerDisplayName", g.created_at AS "sharedAt", g.report
         FROM review_grants g JOIN users u ON u.id = g.owner_id
        WHERE g.id = $1 AND g.reviewer_id = $2 AND g.revoked_at IS NULL`,
      [grantId, reviewer],
    )) as Array<{ id: string; ownerDisplayName: string; sharedAt: Date; report: Record<string, unknown> }>;
    const row = rows[0];
    if (!row) throw new AppException("NOT_FOUND", "This review is no longer available");
    const { designId: _internal, ...report } = row.report;
    return reviewViewSchema.parse({ id: row.id, ownerDisplayName: row.ownerDisplayName, sharedAt: row.sharedAt.toISOString(), report });
  }
}
