import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import * as argon2 from "argon2";
import { appConfig } from "@/config";
import { AppException } from "@/common/errors";
import { TokenStore } from "@/modules/auth/token-store.service";
import { UsersService } from "@/modules/users/users.service";
import {
  EXPORT_RUNS_IN_FULL,
  accountExportSchema,
  deleteAccountSchema,
  profileUpdateSchema,
} from "@/common/contracts/phase3/account.schema";

type Fields = { path: string; message: string }[];
const invalid = (fields: Fields) => new AppException("VALIDATION_FAILED", "Validation failed", { fields });
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
const FORMER = "Former Instructor";

/**
 * P4 account self-service: change the display name, export everything the account holds, and delete the account.
 * Each operation acts on the signed-in person's own account only; no id other than their own is ever taken from the
 * request. The export never includes other people's emails, share-link secrets or password hashes.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly db: DataSource,
    private readonly users: UsersService,
    private readonly tokens: TokenStore,
  ) {}

  async updateProfile(userId: string, raw: unknown) {
    const parsed = profileUpdateSchema.safeParse(raw);
    if (!parsed.success) throw invalid(parsed.error.issues.map((i) => ({ path: String(i.path[0] ?? "displayName"), message: i.message })));
    await this.db.query("UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1", [userId, parsed.data.displayName]);
    const user = await this.users.findById(userId);
    if (!user) throw new AppException("UNAUTHENTICATED", "You are not signed in");
    return this.users.toDto(user);
  }

  async exportData(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new AppException("UNAUTHENTICATED", "You are not signed in");
    const q = <T = Record<string, any>>(sql: string, params: unknown[] = [userId]): Promise<T[]> => this.db.query(sql, params);

    const roles = await q<{ role: string }>("SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role");
    const designs = await q(
      `SELECT id, name, description, source, template_id, revision, archived_at, created_at, updated_at, graph, traffic
       FROM designs WHERE owner_id = $1 ORDER BY created_at, id`,
    );
    const versions = await q(
      `SELECT v.design_id, v.revision, v.origin, v.created_at, v.snapshot FROM design_versions v
       JOIN designs d ON d.id = v.design_id WHERE d.owner_id = $1 ORDER BY v.revision`,
    );
    const notes = await q(
      `SELECT n.design_id, n.revision, n.kind, n.text, n.created_at FROM design_notes n
       JOIN designs d ON d.id = n.design_id WHERE d.owner_id = $1 ORDER BY n.created_at, n.id`,
    );
    const runs = await q(
      `SELECT * FROM (
         SELECT r.id, r.design_id, r.status, r.created_at, r.completed_at, r.payload,
                row_number() OVER (PARTITION BY r.design_id ORDER BY r.created_at DESC, r.id DESC) AS rn
         FROM design_runs r JOIN designs d ON d.id = r.design_id WHERE d.owner_id = $1) x
       ORDER BY created_at, id`,
    );
    const shares = await q(
      `SELECT s.design_id, s.scope, s.revision, s.created_at, s.expires_at, s.revoked_at, s.open_count FROM design_shares s
       JOIN designs d ON d.id = s.design_id WHERE d.owner_id = $1 ORDER BY s.created_at`,
    );
    const grants = await q(
      `SELECT g.id, g.design_id, g.revision, g.created_at, g.revoked_at, u.display_name AS reviewer
       FROM review_grants g JOIN users u ON u.id = g.reviewer_id WHERE g.owner_id = $1 ORDER BY g.created_at`,
    );
    const thread = await q(
      `SELECT c.grant_id, u.display_name AS author, CASE WHEN c.removed_at IS NULL THEN c.text ELSE NULL END AS text, c.created_at
       FROM review_comments c JOIN review_grants g ON g.id = c.grant_id JOIN users u ON u.id = c.author_id
       WHERE g.owner_id = $1 ORDER BY c.created_at, c.id`,
    );
    const mine = await q(
      `SELECT CASE WHEN removed_at IS NULL THEN text ELSE NULL END AS text, created_at FROM review_comments WHERE author_id = $1 ORDER BY created_at, id`,
    );
    const challenges = await q(
      `SELECT id, title, summary, status, goal_p95_ms, goal_error_rate, traffic, created_at, published_at, archived_at
       FROM challenges WHERE instructor_id = $1 ORDER BY created_at, id`,
    );
    const attempts = await q(
      `SELECT a.id, c.title, a.created_at FROM challenge_attempts a JOIN challenges c ON c.id = a.challenge_id
       WHERE a.learner_id = $1 ORDER BY a.created_at, a.id`,
    );
    const submissions = await q(
      `SELECT s.attempt_id, s.design_revision, s.status, s.result, s.created_at FROM challenge_submissions s
       JOIN challenge_attempts a ON a.id = s.attempt_id WHERE a.learner_id = $1 ORDER BY s.created_at, s.id`,
    );
    const feedback = await q(
      `SELECT s.attempt_id, COALESCE(u.display_name, '${FORMER}') AS author, f.body, f.created_at FROM challenge_feedback f
       JOIN challenge_submissions s ON s.id = f.submission_id JOIN challenge_attempts a ON a.id = s.attempt_id
       LEFT JOIN users u ON u.id = f.instructor_id WHERE a.learner_id = $1 ORDER BY f.created_at, f.id`,
    );
    const history = await q("SELECT at, action, role FROM role_audit WHERE target_id = $1 ORDER BY at", [userId]);
    const reports = await q(
      `SELECT t.id,t.ref,t.category,t.title,t.status,t.created_at,t.body,t.expected,t.merged_into_id,(SELECT ref FROM support_tickets p WHERE p.id=t.merged_into_id) AS merged_ref FROM support_tickets t WHERE author_id = $1 ORDER BY created_at, id`,
    );
    // Public messages only: `internal = false` keeps Support's private notes out of a person's own export.
    const reportMessages = await q(
      `SELECT m.ticket_id, m.author_kind, m.body, m.created_at FROM support_messages m
       JOIN support_tickets t ON t.id = m.ticket_id WHERE t.author_id = $1 AND m.internal = false ORDER BY m.seq`,
    );

    const by = <T extends { design_id?: string; attempt_id?: string; grant_id?: string }>(rows: T[], key: "design_id" | "attempt_id" | "grant_id", id: string) =>
      rows.filter((r) => r[key] === id);

    const notifications = await q("SELECT id,kind,ref_id,created_at,read_at FROM notifications WHERE user_id=$1 AND created_at > now()-interval '90 days' ORDER BY created_at,id");
    const preferences = await q("SELECT kind,muted FROM notification_preferences WHERE user_id=$1");
    const saved = await q("SELECT id,title,body,scope,created_at,updated_at FROM support_saved_replies WHERE owner_id=$1 AND scope='personal' ORDER BY created_at,id");
    return accountExportSchema.parse({
      personalSavedReplies: saved.map(r=>({id:r.id,title:r.title,body:r.body,scope:r.scope,createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)})),
      notifications: notifications.map(n=>({id:n.id,kind:n.kind,refId:n.ref_id,createdAt:iso(n.created_at),readAt:iso(n.read_at)})),
      notificationPreferences: ["support_reply","report_status","support_new_report","support_assigned","reporter_reply"].map(kind=>({kind,muted:preferences.find(p=>p.kind===kind)?.muted??false})),
      format: "stressforge-export-v1",
      exportedAt: new Date().toISOString(),
      note: `Everything this account holds. Results of older runs beyond the latest ${EXPORT_RUNS_IN_FULL} per design are listed without their result. Share-link secrets, password hashes and other people's emails are never included. The role history keeps the email text of past role changes.`,
      account: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt.toISOString(),
        roles: ["user", ...roles.map((r) => r.role)],
      },
      designs: designs.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        source: d.source,
        templateId: d.template_id,
        revision: d.revision,
        archivedAt: iso(d.archived_at),
        createdAt: iso(d.created_at),
        updatedAt: iso(d.updated_at),
        graph: d.graph,
        traffic: d.traffic,
        versions: by(versions, "design_id", d.id).map((v) => ({ revision: v.revision, origin: v.origin, createdAt: iso(v.created_at), snapshot: v.snapshot })),
        notes: by(notes, "design_id", d.id).map((n) => ({ revision: n.revision, kind: n.kind, text: n.text, createdAt: iso(n.created_at) })),
        runs: by(runs, "design_id", d.id).map((r) => ({
          id: r.id,
          status: r.status,
          createdAt: iso(r.created_at),
          completedAt: iso(r.completed_at),
          ...(Number(r.rn) <= EXPORT_RUNS_IN_FULL ? { result: r.payload } : {}),
        })),
        shareLinks: by(shares, "design_id", d.id).map((s) => ({ scope: s.scope, revision: s.revision, createdAt: iso(s.created_at), expiresAt: iso(s.expires_at), revokedAt: iso(s.revoked_at), openCount: s.open_count })),
      })),
      reviewsOfMyDesigns: grants.map((g) => ({
        designId: g.design_id,
        revision: g.revision,
        reviewer: g.reviewer,
        createdAt: iso(g.created_at),
        revokedAt: iso(g.revoked_at),
        comments: by(thread, "grant_id", g.id).map((c) => ({ author: c.author, text: c.text, createdAt: iso(c.created_at) })),
      })),
      commentsIWrote: mine.map((c) => ({ text: c.text, createdAt: iso(c.created_at) })),
      challengesIManage: challenges.map((c) => ({
        id: c.id,
        title: c.title,
        summary: c.summary,
        status: c.status,
        goal: { p95Ms: c.goal_p95_ms, errorRate: c.goal_error_rate },
        traffic: c.traffic,
        createdAt: iso(c.created_at),
        publishedAt: iso(c.published_at),
        archivedAt: iso(c.archived_at),
      })),
      challengeAttempts: attempts.map((a) => ({
        challengeTitle: a.title,
        startedAt: iso(a.created_at),
        submissions: by(submissions, "attempt_id", a.id).map((s) => ({ designRevision: s.design_revision, status: s.status, result: s.result, createdAt: iso(s.created_at) })),
        feedbackReceived: by(feedback, "attempt_id", a.id).map((f) => ({ from: f.author, text: f.body, createdAt: iso(f.created_at) })),
      })),
      roleHistory: history.map((h) => ({ at: iso(h.at), action: h.action, role: h.role })),
      problemReports: reports.map((r) => ({
        mergedInto: r.merged_into_id ? {id:r.merged_into_id,code:`SF-${r.merged_ref}`} : null,
        code: `SF-${r.ref}`,
        category: r.category,
        title: r.title,
        status: r.status,
        createdAt: iso(r.created_at),
        body: r.body,
        expected: r.expected,
        messages: reportMessages.filter((x) => x.ticket_id === r.id).map((x) => ({ from: x.author_kind === "user" ? "you" : "support", text: x.body, createdAt: iso(x.created_at) })),
      })),
    });
  }

  /**
   * Deletes the account and everything that belongs only to it. A challenge that other people have attempted is kept
   * (archived, with no owner) so their results survive; every other challenge goes with the account. The role history
   * is an append-only audit log and is kept.
   */
  async deleteAccount(userId: string, raw: unknown): Promise<void> {
    const parsed = deleteAccountSchema.safeParse(raw);
    if (!parsed.success) throw invalid(parsed.error.issues.map((i) => ({ path: String(i.path[0] ?? "confirmation"), message: i.message })));
    const user = await this.users.findById(userId);
    if (!user) throw new AppException("UNAUTHENTICATED", "You are not signed in");
    if (!(await argon2.verify(user.passwordHash, parsed.data.password))) throw invalid([{ path: "password", message: "Incorrect password" }]);

    await this.db.transaction(async (m) => {
      const [locked] = await m.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!locked) throw new AppException("UNAUTHENTICATED", "You are not signed in");
      const [{ others }] = await m.query(
        `SELECT count(*)::int AS others FROM user_roles r JOIN users u ON u.id = r.user_id
         WHERE r.role = 'admin' AND u.account_status = 'active' AND u.id <> $1`,
        [userId],
      );
      const [{ mine }] = await m.query("SELECT count(*)::int AS mine FROM user_roles WHERE user_id = $1 AND role = 'admin'", [userId]);
      if (mine > 0 && others < 1) throw new AppException("CONFLICT", "The last working Admin cannot delete their account", { reason: "LAST_ADMIN" });

      // Own attempts first, so a challenge only the owner ever attempted can be removed cleanly.
      await m.query("DELETE FROM challenge_attempts WHERE learner_id = $1", [userId]);
      await m.query(
        `UPDATE challenges SET status = 'archived', archived_at = COALESCE(archived_at, now()), instructor_id = NULL
         WHERE instructor_id = $1 AND EXISTS (SELECT 1 FROM challenge_attempts a WHERE a.challenge_id = challenges.id)`,
        [userId],
      );
      await m.query("DELETE FROM challenges WHERE instructor_id = $1", [userId]);
      await m.query("DELETE FROM users WHERE id = $1", [userId]);
    });
    // The account is gone; make its still-valid access tokens useless at once instead of after they expire.
    await this.tokens.blockUser(userId, appConfig.env.JWT_ACCESS_TTL_SECONDS);
  }
}
