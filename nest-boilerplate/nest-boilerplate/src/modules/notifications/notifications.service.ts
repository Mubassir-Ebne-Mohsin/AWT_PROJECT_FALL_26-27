import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { AppException } from "@/common/errors";
import {
  NOTIFICATION_KINDS,
  notificationKindSchema,
  notificationPreferencesSchema,
  notificationPreferenceSchema,
  notificationQuerySchema,
  notificationsPageSchema,
  notificationTargetSchema,
} from "@/common/contracts/phase3/notifications.schema";

type Kind = (typeof NOTIFICATION_KINDS)[number];
const LIVE = "created_at > now() - interval '90 days'";
const iso = (v: Date | string) => new Date(v).toISOString();
const missing = () => new AppException("NOT_FOUND", "Notification not found");

@Injectable()
export class NotificationsService {
  constructor(private readonly db: DataSource) {}

  /** The caller's event transaction is mandatory. No event text, actor or email can be persisted. */
  async emit(
    m: EntityManager,
    kind: Kind,
    refId: string,
    actorId: string,
    recipientIds: string[],
  ) {
    notificationKindSchema.parse(kind);
    await m.query(
      `INSERT INTO notifications(user_id, kind, ref_id)
      SELECT u.id, $1::varchar, $2::uuid FROM users u
       WHERE u.id = ANY($3::uuid[]) AND u.id <> $4::uuid AND u.account_status = 'active'
         AND NOT EXISTS (SELECT 1 FROM notification_preferences p WHERE p.user_id=u.id AND p.kind=$1::varchar AND p.muted)`,
      [kind, refId, recipientIds, actorId],
    );
  }

  async team(
    m: EntityManager,
    kind: "support_new_report" | "reporter_reply",
    refId: string,
    actorId: string,
    assigneeId?: string | null,
  ) {
    const rows: { id: string }[] = await m.query(
      `SELECT u.id FROM users u JOIN user_roles r ON r.user_id=u.id
      WHERE r.role='support' AND u.account_status='active' AND
        ($1::uuid IS NULL OR u.id=$1 OR NOT EXISTS (SELECT 1 FROM user_roles x JOIN users a ON a.id=x.user_id WHERE x.role='support' AND x.user_id=$1 AND a.account_status='active'))`,
      [assigneeId ?? null],
    );
    await this.emit(
      m,
      kind,
      refId,
      actorId,
      rows.map((x) => x.id),
    );
  }

  async page(userId: string, raw: unknown) {
    const parsed = notificationQuerySchema.safeParse(raw);
    if (!parsed.success)
      throw new AppException(
        "VALIDATION_FAILED",
        "Invalid notification cursor or page size",
      );
    const q = parsed.data;
    return this.db.transaction("REPEATABLE READ", async (m) => {
      // Bounded lazy cleanup; every read also filters expired rows, even if more remain to clean.
      await m.query(
        `DELETE FROM notifications WHERE id IN (SELECT id FROM notifications WHERE user_id=$1 AND NOT (${LIVE}) LIMIT 1000)`,
        [userId],
      );
      const [{ at }] = await m.query(
        "SELECT date_trunc('milliseconds',now()) AS at",
      );
      const rows = await m.query(
        `SELECT id,kind,ref_id,created_at,read_at FROM notifications WHERE user_id=$1 AND ${LIVE}
        AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4`,
        [userId, q.before ?? null, q.beforeId ?? null, q.limit + 1],
      );
      const [{ n }] = await m.query(
        `SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL AND ${LIVE}`,
        [userId],
      );
      const items = rows.slice(0, q.limit),
        last = items.at(-1);
      return notificationsPageSchema.parse({
        generatedAt: iso(at),
        items: items.map((x: any) => ({
          id: x.id,
          kind: x.kind,
          refId: x.ref_id,
          createdAt: iso(x.created_at),
          readAt: x.read_at ? iso(x.read_at) : null,
        })),
        next:
          rows.length > q.limit && last
            ? { at: iso(last.created_at), id: last.id }
            : null,
        unreadCount: n,
      });
    });
  }

  async read(userId: string, id?: string) {
    const [row] = await this.db.query(
      `WITH changed AS (UPDATE notifications SET read_at=COALESCE(read_at,date_trunc('milliseconds',now()))
      WHERE user_id=$1 AND ${LIVE} AND ($2::uuid IS NULL OR id=$2) AND ($2::uuid IS NOT NULL OR read_at IS NULL) RETURNING 1)
      SELECT count(*)::int AS updated FROM changed`,
      [userId, id ?? null],
    );
    if (id && row.updated === 0) throw missing();
    return row;
  }

  async open(userId: string, id: string) {
    return this.db.transaction(async (m) => {
      const [row] = await m.query(
        `SELECT n.kind,n.ref_id,t.author_id,
        EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=$1 AND r.role='support') AS staff
        FROM notifications n JOIN support_tickets t ON t.id=n.ref_id WHERE n.id=$2 AND n.user_id=$1 AND n.${LIVE}`,
        [userId, id],
      );
      if (!row) throw missing();
      const staffKind = [
        "support_new_report",
        "support_assigned",
        "reporter_reply",
      ].includes(row.kind);
      const allowed = staffKind ? row.staff : row.author_id === userId;
      await m.query(
        "UPDATE notifications SET read_at=COALESCE(read_at,date_trunc('milliseconds',now())) WHERE id=$1 AND user_id=$2",
        [id, userId],
      );
      return notificationTargetSchema.parse({
        href: allowed
          ? `/${staffKind ? "support" : "reports"}/${row.ref_id}`
          : null,
      });
    });
  }

  async preferences(userId: string) {
    const rows = await this.db.query(
      "SELECT kind,muted FROM notification_preferences WHERE user_id=$1",
      [userId],
    );
    return notificationPreferencesSchema.parse(
      NOTIFICATION_KINDS.map((kind) => ({
        kind,
        muted: rows.find((r: any) => r.kind === kind)?.muted ?? false,
      })),
    );
  }
  async setPreference(userId: string, raw: unknown) {
    const parsed = notificationPreferenceSchema.safeParse(raw);
    if (!parsed.success)
      throw new AppException(
        "VALIDATION_FAILED",
        "Choose a notification kind and mute setting",
      );
    await this.db.query(
      `INSERT INTO notification_preferences(user_id,kind,muted) VALUES($1,$2,$3)
      ON CONFLICT(user_id,kind) DO UPDATE SET muted=EXCLUDED.muted`,
      [userId, parsed.data.kind, parsed.data.muted],
    );
    return this.preferences(userId);
  }
}
