import { MigrationInterface, QueryRunner } from "typeorm";

/** Content-free Support events and account preferences; no historical events are backfilled. */
export class Notifications1794800000000 implements MigrationInterface {
  name = "Notifications1794800000000";
  async up(q: QueryRunner) {
    const kinds =
      "'support_reply','report_status','support_new_report','support_assigned','reporter_reply'";
    await q.query(`CREATE TABLE notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind varchar(24) NOT NULL CHECK (kind IN (${kinds})),
      ref_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),
      read_at timestamptz NULL)`);
    await q.query(
      "CREATE INDEX notifications_owner_created ON notifications(user_id, created_at DESC, id DESC)",
    );
    await q.query(
      "CREATE INDEX notifications_owner_unread ON notifications(user_id, created_at) WHERE read_at IS NULL",
    );
    await q.query(`CREATE TABLE notification_preferences (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind varchar(24) NOT NULL CHECK (kind IN (${kinds})),
      muted boolean NOT NULL DEFAULT false,
      PRIMARY KEY(user_id, kind))`);
  }
  async down(q: QueryRunner) {
    const [row] = await q.query(
      "SELECT (SELECT count(*) FROM notifications)+(SELECT count(*) FROM notification_preferences) AS n",
    );
    if (Number(row.n) > 0)
      throw new Error(
        "Notifications rollback refuses to discard notifications or preferences",
      );
    await q.query("DROP TABLE notification_preferences");
    await q.query("DROP TABLE notifications");
  }
}
