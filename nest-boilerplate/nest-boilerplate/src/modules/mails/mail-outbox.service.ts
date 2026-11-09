import { Inject, Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { MAIL_OPTIONS, MAIL_SENDER, type MailOptions, type MailSender } from "@/modules/mails/mail-sender";
import { MAIL_KINDS, type MailKind, renderMail, reportUrl } from "@/modules/mails/templates";

const MAX_ATTEMPTS = 3;
const BATCH = 50;
/** Only fresh events are emailed, so enabling the mailer later never replays old notifications. */
const FRESH = "interval '1 hour'";

export interface OutboxResult {
  sent: number;
  retry: number;
  failed: number;
  skipped: number;
}

/**
 * Reads notifications that already exist and emails the reporter-facing ones. It never writes to notifications and is never
 * called from a request: a mail problem can delay an email, never a Support action. One row in notification_emails per
 * notification records the outcome, so a notification is not mailed twice after a success is recorded.
 */
@Injectable()
export class MailOutboxService {
  private readonly log = new Logger("Mail");

  constructor(
    private readonly db: DataSource,
    @Inject(MAIL_SENDER) private readonly sender: MailSender,
    @Inject(MAIL_OPTIONS) private readonly options: MailOptions,
  ) {}

  async runOnce(): Promise<OutboxResult> {
    const result: OutboxResult = { sent: 0, retry: 0, failed: 0, skipped: 0 };
    const rows: Array<{
      id: string;
      user_id: string;
      kind: MailKind;
      ref_id: string;
      email: string;
      ref: number;
      status: string;
      attempts: number | null;
    }> = await this.db.query(
      `SELECT n.id, n.user_id, n.kind, n.ref_id, u.email, t.ref, t.status, e.attempts
         FROM notifications n
         JOIN users u ON u.id = n.user_id AND u.account_status = 'active'
         JOIN support_tickets t ON t.id = n.ref_id
    LEFT JOIN notification_emails e ON e.notification_id = n.id
        WHERE n.kind = ANY($1::varchar[]) AND n.created_at > now() - ${FRESH}
          AND (e.notification_id IS NULL OR e.status = 'retry')
        ORDER BY n.created_at, n.id
        LIMIT ${BATCH}`,
      [MAIL_KINDS],
    );
    for (const row of rows) {
      const attempts = (row.attempts ?? 0) + 1;
      if (await this.overHourlyLimit(row.user_id)) {
        await this.record(row.id, "skipped", attempts, null);
        result.skipped++;
        continue;
      }
      try {
        const message = renderMail(row.kind, {
          ref: row.ref,
          status: row.status,
          url: reportUrl(this.options.frontendUrl, row.ref_id),
        });
        await this.sender.send({ to: row.email, ...message });
        await this.record(row.id, "sent", attempts, null);
        result.sent++;
      } catch (error) {
        const code = String((error as { code?: unknown })?.code ?? "SEND_FAILED").slice(0, 40);
        const final = attempts >= MAX_ATTEMPTS;
        await this.record(row.id, final ? "failed" : "retry", attempts, code);
        // No address, subject or server message: those can carry personal data or credentials.
        this.log.warn(`Email not sent (${code}), attempt ${attempts} of ${MAX_ATTEMPTS}`);
        if (final) result.failed++;
        else result.retry++;
      }
    }
    return result;
  }

  private async overHourlyLimit(userId: string) {
    const [row] = await this.db.query(
      `SELECT count(*)::int AS n FROM notification_emails e JOIN notifications n ON n.id = e.notification_id
        WHERE n.user_id = $1 AND e.status = 'sent' AND e.sent_at > now() - interval '1 hour'`,
      [userId],
    );
    return Number(row.n) >= this.options.hourlyLimit;
  }

  private async record(id: string, status: "retry" | "sent" | "failed" | "skipped", attempts: number, code: string | null) {
    await this.db.query(
      `INSERT INTO notification_emails(notification_id, status, attempts, sent_at, last_error_code)
       VALUES ($1, $2::varchar, $3, CASE WHEN $2::varchar = 'sent' THEN now() END, $4)
       ON CONFLICT (notification_id) DO UPDATE
         SET status = EXCLUDED.status, attempts = EXCLUDED.attempts, sent_at = EXCLUDED.sent_at,
             last_error_code = EXCLUDED.last_error_code, updated_at = now()`,
      [id, status, attempts, code],
    );
  }
}
