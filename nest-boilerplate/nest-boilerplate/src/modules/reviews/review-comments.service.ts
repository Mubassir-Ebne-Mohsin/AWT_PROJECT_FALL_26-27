import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { AppException } from "@/common/errors";
import { DesignsService } from "@/modules/designs/designs.service";
import {
  REVIEW_COMMENT_MAX,
  createCommentRequestSchema,
  editCommentRequestSchema,
  ownerReplyRequestSchema,
  reviewCommentSchema,
} from "@/common/contracts/phase3/reviews.schema";

type Row = { id: string; parentId: string | null; authorId: string; displayName: string; text: string; createdAt: Date; editedAt: Date | null; removedAt: Date | null; ownerId: string };

/** Windows line breaks become plain ones, so a comment is the same text whichever machine typed it. */
const clean = (raw: Record<string, unknown>) => (typeof raw.text === "string" ? { ...raw, text: raw.text.replace(/\r\n?/g, "\n") } : raw);

const GONE = "This review is no longer available";

/**
 * R4 Reviewer feedback. One thread per review. The Reviewer writes top-level comments and may edit or remove their
 * own; the owner replies to a Reviewer's comment and can never change a Reviewer's words. A Reviewer's access ends the
 * moment the owner stops sharing (it reads as "not found"); the owner keeps reading the thread for good. Writes lock
 * the grant row, so the 50-comment limit cannot be passed by parallel requests. Text is stored and returned as plain
 * text; nothing here interprets it.
 */
@Injectable()
export class ReviewCommentsService {
  constructor(
    private readonly db: DataSource,
    private readonly designs: DesignsService,
  ) {}

  private dto(row: Row) {
    const removed = row.removedAt !== null;
    return reviewCommentSchema.parse({
      id: row.id,
      parentId: row.parentId,
      author: { role: row.authorId === row.ownerId ? "owner" : "reviewer", displayName: row.displayName },
      text: removed ? null : row.text,
      removed,
      createdAt: row.createdAt.toISOString(),
      editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    });
  }

  private async rows(m: EntityManager, grantId: string, commentId?: string) {
    return (await m.query(
      `SELECT c.id, c.parent_id AS "parentId", c.author_id AS "authorId", u.display_name AS "displayName", c.text,
              c.created_at AS "createdAt", c.edited_at AS "editedAt", c.removed_at AS "removedAt", g.owner_id AS "ownerId"
         FROM review_comments c JOIN users u ON u.id = c.author_id JOIN review_grants g ON g.id = c.grant_id
        WHERE c.grant_id = $1 ${commentId ? "AND c.id = $2" : ""}
        ORDER BY c.created_at, c.id`,
      commentId ? [grantId, commentId] : [grantId],
    )) as Row[];
  }

  private async thread(m: EntityManager, grantId: string) {
    return (await this.rows(m, grantId)).map((r) => this.dto(r));
  }

  /** Locks the grant and proves it is this Reviewer's and still active; anything else is the same "not found". */
  private async lockActiveForReviewer(m: EntityManager, reviewer: string, grantId: string) {
    const rows = (await m.query("SELECT id FROM review_grants WHERE id = $1 AND reviewer_id = $2 AND revoked_at IS NULL FOR UPDATE", [grantId, reviewer])) as unknown[];
    if (!rows.length) throw new AppException("NOT_FOUND", GONE);
  }

  private async assertRoom(m: EntityManager, grantId: string) {
    const [{ n }] = (await m.query("SELECT count(*)::int AS n FROM review_comments WHERE grant_id = $1", [grantId])) as Array<{ n: number }>;
    if (n >= REVIEW_COMMENT_MAX)
      throw new AppException("VALIDATION_FAILED", "This review already has the maximum number of comments", { reason: "COMMENT_LIMIT_REACHED", limit: REVIEW_COMMENT_MAX });
  }

  // ---- The Reviewer's side ----

  async listForReviewer(reviewer: string, grantId: string) {
    return this.db.transaction(async (m) => {
      const rows = (await m.query("SELECT id FROM review_grants WHERE id = $1 AND reviewer_id = $2 AND revoked_at IS NULL", [grantId, reviewer])) as unknown[];
      if (!rows.length) throw new AppException("NOT_FOUND", GONE);
      return this.thread(m, grantId);
    });
  }

  async create(reviewer: string, grantId: string, raw: Record<string, unknown>) {
    const parsed = createCommentRequestSchema.safeParse(clean(raw));
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid comment");
    return this.db.transaction(async (m) => {
      await this.lockActiveForReviewer(m, reviewer, grantId);
      await this.assertRoom(m, grantId);
      const [{ id }] = (await m.query(
        "INSERT INTO review_comments(grant_id, author_id, parent_id, text, created_at) VALUES ($1, $2, NULL, $3, now()) RETURNING id",
        [grantId, reviewer, parsed.data.text],
      )) as Array<{ id: string }>;
      return this.dto((await this.rows(m, grantId, id))[0]);
    });
  }

  /** Only the author, only while the review is active, only their own comment that is not removed. */
  async edit(reviewer: string, grantId: string, commentId: string, raw: Record<string, unknown>) {
    const parsed = editCommentRequestSchema.safeParse(clean(raw));
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid comment");
    return this.db.transaction(async (m) => {
      await this.lockActiveForReviewer(m, reviewer, grantId);
      const mine = (await m.query("SELECT id FROM review_comments WHERE id = $1 AND grant_id = $2 AND author_id = $3 AND removed_at IS NULL", [commentId, grantId, reviewer])) as unknown[];
      if (!mine.length) throw new AppException("NOT_FOUND", "Comment not found");
      await m.query("UPDATE review_comments SET text = $1, edited_at = now() WHERE id = $2", [parsed.data.text, commentId]);
      return this.dto((await this.rows(m, grantId, commentId))[0]);
    });
  }

  /** Idempotent. The text is erased and a placeholder stays, so replies to it still make sense. */
  async remove(reviewer: string, grantId: string, commentId: string) {
    return this.db.transaction(async (m) => {
      await this.lockActiveForReviewer(m, reviewer, grantId);
      const own = (await m.query("SELECT id FROM review_comments WHERE id = $1 AND grant_id = $2 AND author_id = $3", [commentId, grantId, reviewer])) as unknown[];
      if (!own.length) throw new AppException("NOT_FOUND", "Comment not found");
      await m.query("UPDATE review_comments SET text = '', removed_at = now() WHERE id = $1 AND removed_at IS NULL", [commentId]);
      return this.dto((await this.rows(m, grantId, commentId))[0]);
    });
  }

  // ---- The owner's side ----

  /** The grant must belong to this owner's design. Reading is allowed whether or not the review is still active. */
  private async ownedGrant(m: EntityManager, owner: string, designId: string, grantId: string, lock: boolean) {
    await this.designs.owned(owner, designId, m, lock);
    const rows = (await m.query(`SELECT id, revoked_at AS "revokedAt" FROM review_grants WHERE id = $1 AND design_id = $2 ${lock ? "FOR UPDATE" : ""}`, [grantId, designId])) as Array<{ id: string; revokedAt: Date | null }>;
    if (!rows.length) throw new AppException("NOT_FOUND", "Review not found");
    return rows[0];
  }

  async listForOwner(owner: string, designId: string, grantId: string) {
    return this.db.transaction(async (m) => {
      await this.ownedGrant(m, owner, designId, grantId, false);
      return this.thread(m, grantId);
    });
  }

  /** A reply to one of the Reviewer's top-level comments, and only while the review is active. */
  async reply(owner: string, designId: string, grantId: string, raw: Record<string, unknown>) {
    const parsed = ownerReplyRequestSchema.safeParse(clean(raw));
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid reply");
    return this.db.transaction(async (m) => {
      const grant = await this.ownedGrant(m, owner, designId, grantId, true);
      if (grant.revokedAt) throw new AppException("CONFLICT", "This review was stopped, so replies are closed", { reason: "REVIEW_STOPPED" });
      const parent = (await m.query(
        "SELECT id FROM review_comments WHERE id = $1 AND grant_id = $2 AND author_id <> $3 AND parent_id IS NULL AND removed_at IS NULL",
        [parsed.data.parentId, grantId, owner],
      )) as unknown[];
      if (!parent.length) throw new AppException("NOT_FOUND", "Comment not found");
      await this.assertRoom(m, grantId);
      const [{ id }] = (await m.query(
        "INSERT INTO review_comments(grant_id, author_id, parent_id, text, created_at) VALUES ($1, $2, $3, $4, now()) RETURNING id",
        [grantId, owner, parsed.data.parentId, parsed.data.text],
      )) as Array<{ id: string }>;
      return this.dto((await this.rows(m, grantId, id))[0]);
    });
  }
}
