import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { ZodError } from "zod";
import { AppException } from "@/common/errors";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import {
  MESSAGES_PER_HOUR,
  REOPEN_DAYS,
  REPORTS_PER_DAY,
  REPORTS_PER_HOUR,
  createReportSchema,
  inboxDetailSchema,
  inboxPageSchema,
  inboxQuerySchema,
  messageRequestSchema,
  reportDetailSchema,
  reportListSchema,
  supportAgentsSchema,
  supportMessageRequestSchema,
  ticketUpdateSchema,
} from "@/common/contracts/phase3/support.schema";

type Row = Record<string, unknown>;
const iso = (v: unknown) => new Date(v as string | Date).toISOString();
const isoOrNull = (v: unknown) => (v === null || v === undefined ? null : iso(v));
const codeOf = (ref: number) => `SF-${ref}`;
// Millisecond timestamps, so the cursors the API hands out (ISO strings) compare exactly with what is stored.
const NOW = "date_trunc('milliseconds', now())";

const invalid = (error: ZodError) =>
  new AppException("VALIDATION_FAILED", "Please check the highlighted fields", { fields: error.issues.map((i) => ({ path: String(i.path[0] ?? "request"), message: i.message })) });

/** The like pattern for a search term, with the pattern characters escaped so a person cannot widen the match. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Problem reports and the Support inbox. A report belongs to its author and to Support; nobody else can see it, and an Admin
 * without the Support role gets nothing. The author's views are built from a query that never selects internal notes, so there
 * is no filter or path by which one could reach them. Deleting an account clears the author (a foreign key, ON DELETE SET NULL):
 * the report is kept without any name or email. Every change is written to an append-only activity table.
 */
@Injectable()
export class SupportService {
  constructor(private readonly db: DataSource) {}

  // ---- Shared ---------------------------------------------------------------------------------------------------------

  private activity(m: EntityManager, ticket: { id: string; ref: number }, action: string, actor: { kind: "user" | "support"; id: string; email: string }, from: string | null, to: string | null) {
    return m.query(
      `INSERT INTO support_activity (at, ticket_id, ticket_ref, action, actor_kind, actor_id, actor_email, from_value, to_value) VALUES (${NOW}, $1, $2, $3, $4, $5, $6, $7, $8)`,
      // A reporter is recorded by id only: no email is kept for them, so deleting their account leaves nothing personal in the log.
      [ticket.id, ticket.ref, action, actor.kind, actor.id, actor.kind === "user" ? "(reporter)" : actor.email, from, to],
    );
  }

  private summary(r: Row) {
    return {
      id: r.id as string,
      ref: r.ref as number,
      code: codeOf(r.ref as number),
      category: r.category as string,
      title: r.title as string,
      status: r.status as string,
      priority: r.priority as string,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
      resolvedAt: isoOrNull(r.resolved_at),
    };
  }

  // ---- The author's side ----------------------------------------------------------------------------------------------

  async create(user: AuthUser, raw: unknown) {
    const parsed = createReportSchema.safeParse(raw);
    if (!parsed.success) throw invalid(parsed.error);
    const input = parsed.data;
    const id = await this.db.transaction(async (m) => {
      // One account's reports are counted and added one at a time, so two quick requests cannot both slip under the limit.
      await m.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["sf-support-create:" + user.id]);
      const [counts] = (await m.query(
        `SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS hour,
                count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS day,
                floor(extract(epoch FROM (min(created_at) FILTER (WHERE created_at > now() - interval '1 hour') + interval '1 hour' - now())))::int AS hour_wait,
                floor(extract(epoch FROM (min(created_at) FILTER (WHERE created_at > now() - interval '1 day') + interval '1 day' - now())))::int AS day_wait
           FROM support_tickets WHERE author_id = $1`,
        [user.id],
      )) as Row[];
      if ((counts.hour as number) >= REPORTS_PER_HOUR)
        throw new AppException("RATE_LIMITED", `You can send ${REPORTS_PER_HOUR} reports an hour. Please try again later.`, { reason: "REPORTS_PER_HOUR", retryAfterSeconds: Math.max(1, counts.hour_wait as number) });
      if ((counts.day as number) >= REPORTS_PER_DAY)
        throw new AppException("RATE_LIMITED", `You can send ${REPORTS_PER_DAY} reports a day. Please try again tomorrow.`, { reason: "REPORTS_PER_DAY", retryAfterSeconds: Math.max(1, counts.day_wait as number) });
      if (!input.confirmDuplicate) {
        const [dup] = (await m.query(
          `SELECT ref FROM support_tickets WHERE author_id = $1 AND status <> 'resolved' AND lower(title) = lower($2) ORDER BY created_at DESC LIMIT 1`,
          [user.id, input.title],
        )) as Row[];
        if (dup) throw new AppException("CONFLICT", "You already have an open report with this title", { reason: "DUPLICATE_OPEN", code: codeOf(dup.ref as number) });
      }
      const [row] = (await m.query(
        `INSERT INTO support_tickets (author_id, category, title, body, expected, context, created_at, updated_at, last_user_activity_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, ${NOW}, ${NOW}, ${NOW}) RETURNING id, ref`,
        [user.id, input.category, input.title, input.body, input.expected ?? null, JSON.stringify(input.context)],
      )) as Row[];
      await this.activity(m, { id: row.id as string, ref: row.ref as number }, "create", { kind: "user", id: user.id, email: user.email }, null, "open");
      return row.id as string;
    });
    return this.own(user.id, id);
  }

  async listOwn(userId: string) {
    const rows = (await this.db.query(`SELECT * FROM support_tickets WHERE author_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100`, [userId])) as Row[];
    return reportListSchema.parse(rows.map((r) => this.summary(r)));
  }

  /** The author's own report. Another account's report, and one that does not exist, look the same: not found. */
  async own(userId: string, id: string) {
    const [t] = (await this.db.query(`SELECT * FROM support_tickets WHERE id = $1 AND author_id = $2`, [id, userId])) as Row[];
    if (!t) throw new AppException("NOT_FOUND", "Report not found");
    // `internal = false` is the whole privacy rule for notes: this is the only query that feeds the author's thread.
    const messages = (await this.db.query(`SELECT id, author_kind, body, created_at FROM support_messages WHERE ticket_id = $1 AND internal = false ORDER BY seq`, [id])) as Row[];
    const until = t.status === "resolved" ? new Date(new Date(t.resolved_at as string).getTime() + REOPEN_DAYS * 86400000) : null;
    return reportDetailSchema.parse({
      ...this.summary(t),
      body: t.body,
      expected: t.expected,
      context: t.context,
      messages: messages.map((x) => ({ id: x.id, from: x.author_kind === "user" ? "you" : "support", body: x.body, at: iso(x.created_at) })),
      reopenUntil: until && until.getTime() > Date.now() ? until.toISOString() : null,
    });
  }

  async addMessage(user: AuthUser, id: string, raw: unknown) {
    const parsed = messageRequestSchema.safeParse(raw);
    if (!parsed.success) throw invalid(parsed.error);
    await this.db.transaction(async (m) => {
      const [t] = (await m.query(`SELECT id, ref, status, resolved_at FROM support_tickets WHERE id = $1 AND author_id = $2 FOR UPDATE`, [id, user.id])) as Row[];
      if (!t) throw new AppException("NOT_FOUND", "Report not found");
      const [{ n }] = (await m.query(`SELECT count(*)::int AS n FROM support_messages WHERE author_id = $1 AND author_kind = 'user' AND created_at > now() - interval '1 hour'`, [user.id])) as Row[];
      if ((n as number) >= MESSAGES_PER_HOUR) throw new AppException("RATE_LIMITED", "You are sending messages too fast. Please wait a little.", { reason: "MESSAGES_PER_HOUR" });
      const ref = { id: t.id as string, ref: t.ref as number };
      const actor = { kind: "user" as const, id: user.id, email: user.email };
      if (t.status === "resolved") {
        const [{ within }] = (await m.query(`SELECT (resolved_at + interval '${REOPEN_DAYS} days' > now()) AS within FROM support_tickets WHERE id = $1`, [id])) as Row[];
        if (!within) throw new AppException("CONFLICT", `This report was resolved more than ${REOPEN_DAYS} days ago. Please send a new report.`, { reason: "REOPEN_WINDOW_PASSED" });
        await m.query(`UPDATE support_tickets SET status = 'open', resolved_at = NULL WHERE id = $1`, [id]);
        await this.activity(m, ref, "reopen", actor, "resolved", "open");
      } else if (t.status === "waiting") {
        await m.query(`UPDATE support_tickets SET status = 'open' WHERE id = $1`, [id]);
        await this.activity(m, ref, "status", actor, "waiting", "open");
      }
      await m.query(`INSERT INTO support_messages (ticket_id, author_id, author_kind, internal, body, created_at) VALUES ($1, $2, 'user', false, $3, ${NOW})`, [id, user.id, parsed.data.body]);
      await m.query(`UPDATE support_tickets SET updated_at = ${NOW}, last_user_activity_at = ${NOW} WHERE id = $1`, [id]);
      await this.activity(m, ref, "reply", actor, null, null);
    });
    return this.own(user.id, id);
  }

  // ---- Support's side -------------------------------------------------------------------------------------------------

  async agents() {
    const rows = (await this.db.query(`SELECT u.id, u.display_name FROM user_roles r JOIN users u ON u.id = r.user_id WHERE r.role = 'support' ORDER BY u.display_name, u.id LIMIT 200`)) as Row[];
    return supportAgentsSchema.parse(rows.map((r) => ({ id: r.id, displayName: r.display_name })));
  }

  private item(r: Row) {
    return {
      ...this.summary(r),
      authorName: (r.author_name as string | null) ?? null,
      assigneeId: (r.assignee_id as string | null) ?? null,
      assigneeName: (r.assignee_name as string | null) ?? null,
      unread: Boolean(r.unread),
    };
  }

  private static readonly ITEM_SELECT = `SELECT t.*, a.display_name AS author_name, s.display_name AS assignee_name,
      NOT EXISTS (SELECT 1 FROM support_reads x WHERE x.ticket_id = t.id AND x.user_id = $1 AND x.read_at >= t.last_user_activity_at) AS unread
    FROM support_tickets t LEFT JOIN users a ON a.id = t.author_id LEFT JOIN users s ON s.id = t.assignee_id`;

  async inbox(viewer: AuthUser, raw: Record<string, unknown>) {
    const parsed = inboxQuerySchema.safeParse(raw);
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid filter");
    const q = parsed.data;
    const args: unknown[] = [viewer.id];
    const where: string[] = [];
    const arg = (v: unknown) => {
      args.push(v);
      return `$${args.length}`;
    };
    if (q.status) where.push(`t.status = ${arg(q.status)}`);
    if (q.category) where.push(`t.category = ${arg(q.category)}`);
    if (q.priority) where.push(`t.priority = ${arg(q.priority)}`);
    if (q.assignee === "me") where.push(`t.assignee_id = $1`);
    else if (q.assignee === "none") where.push(`t.assignee_id IS NULL`);
    else if (q.assignee) where.push(`t.assignee_id = ${arg(q.assignee)}`);
    if (q.unread) where.push(`NOT EXISTS (SELECT 1 FROM support_reads x WHERE x.ticket_id = t.id AND x.user_id = $1 AND x.read_at >= t.last_user_activity_at)`);
    if (q.q) {
      // "SF-1042" is a reference code and matches that report only. A bare number matches the reference or any text containing it.
      const prefixed = /^sf-(\d{4,9})$/i.exec(q.q);
      if (prefixed) where.push(`t.ref = ${arg(Number(prefixed[1]))}`);
      else {
        const like = arg(likePattern(q.q));
        const bare = /^\d{4,9}$/.test(q.q);
        where.push(`(t.title ILIKE ${like} ESCAPE '\\' OR t.body ILIKE ${like} ESCAPE '\\'${bare ? ` OR t.ref = ${arg(Number(q.q))}` : ""})`);
      }
    }
    if (q.before) where.push(`(t.created_at, t.id) < (${arg(q.before)}::timestamptz, ${arg(q.beforeId ?? "ffffffff-ffff-ffff-ffff-ffffffffffff")}::uuid)`);
    const rows = (await this.db.query(`${SupportService.ITEM_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY t.created_at DESC, t.id DESC LIMIT ${arg(q.limit + 1)}`, args)) as Row[];
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return inboxPageSchema.parse({ items: page.map((r) => this.item(r)), next: rows.length > q.limit && last ? { at: iso(last.created_at), id: last.id } : null });
  }

  async detail(viewer: AuthUser, id: string) {
    const [t] = (await this.db.query(`${SupportService.ITEM_SELECT} WHERE t.id = $2`, [viewer.id, id])) as Row[];
    if (!t) throw new AppException("NOT_FOUND", "Report not found");
    const messages = (await this.db.query(
      `SELECT m.id, m.author_kind, m.internal, m.body, m.created_at, u.display_name FROM support_messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.ticket_id = $1 ORDER BY m.seq`,
      [id],
    )) as Row[];
    return inboxDetailSchema.parse({
      ...this.item(t),
      body: t.body,
      expected: t.expected,
      context: t.context,
      messages: messages.map((x) => ({ id: x.id, kind: x.internal ? "note" : x.author_kind, authorName: x.display_name ?? null, body: x.body, at: iso(x.created_at) })),
    });
  }

  async markRead(viewer: AuthUser, id: string) {
    const [t] = (await this.db.query(`SELECT id FROM support_tickets WHERE id = $1`, [id])) as Row[];
    if (!t) throw new AppException("NOT_FOUND", "Report not found");
    await this.db.query(
      `INSERT INTO support_reads (user_id, ticket_id, read_at) VALUES ($1, $2, ${NOW}) ON CONFLICT (user_id, ticket_id) DO UPDATE SET read_at = EXCLUDED.read_at`,
      [viewer.id, id],
    );
    return { read: true };
  }

  async reply(actor: AuthUser, id: string, raw: unknown) {
    const parsed = supportMessageRequestSchema.safeParse(raw);
    if (!parsed.success) throw invalid(parsed.error);
    await this.db.transaction(async (m) => {
      const [t] = (await m.query(`SELECT id, ref, status FROM support_tickets WHERE id = $1 FOR UPDATE`, [id])) as Row[];
      if (!t) throw new AppException("NOT_FOUND", "Report not found");
      const ref = { id: t.id as string, ref: t.ref as number };
      const who = { kind: "support" as const, id: actor.id, email: actor.email };
      await m.query(`INSERT INTO support_messages (ticket_id, author_id, author_kind, internal, body, created_at) VALUES ($1, $2, 'support', $3, $4, ${NOW})`, [id, actor.id, parsed.data.internal, parsed.data.body]);
      if (!parsed.data.internal) {
        await m.query(`UPDATE support_tickets SET first_response_at = COALESCE(first_response_at, ${NOW}), updated_at = ${NOW} WHERE id = $1`, [id]);
        if (t.status === "open") {
          await m.query(`UPDATE support_tickets SET status = 'in_progress' WHERE id = $1`, [id]);
          await this.activity(m, ref, "status", who, "open", "in_progress");
        }
      } else {
        await m.query(`UPDATE support_tickets SET updated_at = ${NOW} WHERE id = $1`, [id]);
      }
      await this.activity(m, ref, parsed.data.internal ? "note" : "reply", who, null, null);
    });
    return this.detail(actor, id);
  }

  async update(actor: AuthUser, id: string, raw: unknown) {
    const parsed = ticketUpdateSchema.safeParse(raw);
    if (!parsed.success) throw invalid(parsed.error);
    const change = parsed.data;
    await this.db.transaction(async (m) => {
      const [t] = (await m.query(`SELECT id, ref, status, priority, assignee_id FROM support_tickets WHERE id = $1 FOR UPDATE`, [id])) as Row[];
      if (!t) throw new AppException("NOT_FOUND", "Report not found");
      const ref = { id: t.id as string, ref: t.ref as number };
      const who = { kind: "support" as const, id: actor.id, email: actor.email };
      let changed = false;
      if (change.status !== undefined && change.status !== t.status) {
        await m.query(`UPDATE support_tickets SET status = $2::varchar, resolved_at = CASE WHEN $2::text = 'resolved' THEN ${NOW} ELSE NULL END WHERE id = $1`, [id, change.status]);
        await this.activity(m, ref, "status", who, t.status as string, change.status);
        changed = true;
      }
      if (change.priority !== undefined && change.priority !== t.priority) {
        await m.query(`UPDATE support_tickets SET priority = $2 WHERE id = $1`, [id, change.priority]);
        await this.activity(m, ref, "priority", who, t.priority as string, change.priority);
        changed = true;
      }
      if (change.assigneeId !== undefined && change.assigneeId !== (t.assignee_id ?? null)) {
        if (change.assigneeId !== null) {
          const [ok] = (await m.query(`SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'support'`, [change.assigneeId])) as Row[];
          if (!ok) throw new AppException("VALIDATION_FAILED", "Only an account with the Support role can be assigned", { fields: [{ path: "assigneeId", message: "Not a Support account" }] });
        }
        await m.query(`UPDATE support_tickets SET assignee_id = $2 WHERE id = $1`, [id, change.assigneeId]);
        await this.activity(m, ref, "assign", who, (t.assignee_id as string | null) ?? null, change.assigneeId);
        changed = true;
      }
      if (changed) await m.query(`UPDATE support_tickets SET updated_at = ${NOW} WHERE id = $1`, [id]);
    });
    return this.detail(actor, id);
  }
}
