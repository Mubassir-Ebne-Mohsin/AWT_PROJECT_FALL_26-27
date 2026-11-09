import { MigrationInterface, QueryRunner } from "typeorm";

/** Outcome log of the optional mailer (docs/MAILER-SCOPE.md). Derived data: one row per notification that was considered for email. */
export class NotificationEmails1795000000000 implements MigrationInterface {
  name = "NotificationEmails1795000000000";
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE notification_emails (
      notification_id uuid PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,
      status varchar(8) NOT NULL CHECK (status IN ('retry','sent','failed','skipped')),
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
      sent_at timestamptz NULL,
      last_error_code varchar(40) NULL,
      updated_at timestamptz NOT NULL DEFAULT now())`);
    await q.query("CREATE INDEX notification_emails_retry ON notification_emails(updated_at) WHERE status = 'retry'");
  }
  async down(q: QueryRunner) {
    await q.query("DROP TABLE notification_emails");
  }
}
