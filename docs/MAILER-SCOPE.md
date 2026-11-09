# Mailer: scope (for approval, nothing built yet)

Written 2026-11-09. Purpose: fill the faculty guide's **Mailer** bonus ("send real emails from the application using a mail
module and templates; use an SMTP sandbox such as Mailtrap while testing") with a feature that does real work, without
putting any existing behaviour at risk.

## 1. What it does

It emails the people who already receive an in-app notification, for the two events that matter to a reporter:

| Notification kind | Email to | Content |
|---|---|---|
| `support_reply` | the reporter | "Support replied to your report SF-nnnn" + a button to open it |
| `report_status` | the reporter | "Your report SF-nnnn is now <status>" + the same button |

Staff-facing kinds (`support_new_report`, `reporter_reply`, `support_assigned`) are **not** emailed by default: they would
be noisy and the Support inbox already shows them. A setting can add them later.

Emails never contain report text, design content or anything a person typed. Subject, a fixed sentence, the ticket number
and a link to `FRONTEND_URL/reports/<id>`. This keeps the rule that private content does not leave the app.

## 2. The safety design (why this cannot harm the project)

1. **Existing write paths are not edited.** `notifications.emit()` and every Support/Admin service stay exactly as they are.
   The mailer *reads* the `notifications` table that already exists.
2. **Off by default.** `MAIL_ENABLED=false`. When off, no job is registered, nothing is sent, and the app behaves as today.
3. **After commit, never inside a request.** A Bull repeatable job runs every 30 s, picks notifications that have no row in
   the new `notification_emails` table, sends them and records the outcome. A request can never wait for, or fail because
   of, the mail server.
4. **A failure only delays an email.** Retry up to 3 times with back-off, then record `failed`. Errors are logged without
   addresses or secrets. Nothing is ever rolled back because of mail.
5. **Respects existing mutes.** A kind the person muted produced no notification, so it produces no email.
6. **Rate cap.** At most 10 emails per account per hour; excess is recorded as `skipped`, so a bug cannot flood a mailbox.
7. **Sandbox first.** Development and the demo use Mailtrap (free); no real mailbox is contacted. Real sending would be a
   separate, explicit decision by the owner.
8. **Secrets stay in env.** `.env.example` gets names only.

## 3. Pieces

| Piece | File (new unless stated) | Role |
|---|---|---|
| Module | `src/modules/mails/mails.module.ts` | Wires everything; imports nothing from feature modules except the database provider |
| Sender | `mails/mail-sender.ts` | Thin wrapper over `nodemailer` SMTP transport; a fake sender for tests |
| Templates | `mails/templates.ts` | Plain functions returning `{subject, text, html}`; all values escaped; no template engine dependency |
| Outbox poller | `mails/mail-outbox.processor.ts` | Bull repeatable job: select unsent notifications, join the account email, render, send, record |
| Table | `database/migrations/<ts>-NotificationEmails.ts` | `notification_emails(notification_id PK/FK cascade, status, attempts, sent_at, last_error_code)` with a CHECK on status |
| Config | `src/config/app.config.ts` (small edit) | `MAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`; refuses to start if enabled without a host |
| Env example | `.env.example` (edit) | Names with blank values |
| Module registration | `app.module.ts` (one line) | Adds `MailsModule` |
| Tests | `mails/*.spec.ts`, `test/mails.e2e-spec.ts` | See section 5 |

One new dependency: `nodemailer` (+ `@types/nodemailer`). Bull is already installed and registered; this gives it its first
real job, which is also what makes the bonus "do real work".

## 4. Optional, not in the first version

- **Welcome email on registration.** The guide lists it as an example, but it needs a call inside the auth service. Auth is
  the most sensitive module, so it is left out unless you ask; the same outbox design could carry it later.
- **Email preference switch in Settings** (one toggle "Email me about my reports"). Without it, emails follow the existing
  mutes only. Small web change; recommended if real mailboxes are ever used.
- **Staff kinds by email** behind a setting.

## 5. Verification plan

- Unit: templates (escaping, no content leakage, link built from `FRONTEND_URL`), rate cap, retry/back-off rule, config
  refusal when enabled without SMTP settings.
- End-to-end on `stressforge_test`: with the fake sender, a Support reply creates exactly one email row and one fake
  message; a muted kind creates none; a failing sender ends as `failed` after 3 attempts and the Support action's own
  response is unaffected; disabled mode registers no job.
- Regression: the full backend unit and e2e suites must stay green (currently 785 unit, 422 e2e).
- Manual: one run against a Mailtrap inbox, screenshot for the report ("Email in the Mailtrap inbox", guide Figure 6.14).
- Deliberate break: make the sender throw on every call and confirm no request fails.

## 6. Rollback

Set `MAIL_ENABLED=false` (instant). To remove entirely: revert the commit and run the migration down (drops one table).

## 7. Questions for the owner

1. Mailtrap (or similar sandbox) only for now, correct?
2. Reporter-facing kinds only (`support_reply`, `report_status`) for the first version?
3. Include the welcome email on registration (touches auth), or leave it out?
4. Include the Settings toggle now, or later?

## 8. Effort

About 1 to 2 days: 0.5 day build, 0.5 day tests, a few hours for verification and the screenshot. Cost: free (Mailtrap free
tier). Nothing is committed or pushed without your word.
