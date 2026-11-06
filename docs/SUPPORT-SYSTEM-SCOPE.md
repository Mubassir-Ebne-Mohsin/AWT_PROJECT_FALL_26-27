# Support role and problem reports: scope and plan

**Written 2026-11-04. Status: P0 (items 1 to 6) and P1 item 12 BUILT 2026-11-05 on the owner's go ("Build with the highest precision and accuracy"), using the recommended answers to every question in section 10; committed as `6d93542`.** Built beyond P0: priority with age badges (item 10, the badge half) and the one-click report on the error screen (item 12). **Not built:** the design-sharing consent flow (7), the notification bell (8), saved replies and merge (9), all of P2. The Admin dashboard panel (11) is implemented in the 2026-11-05 Codex follow-up, verified with the recorded full-run/targeted-repair history (see below), uncommitted. **How it differs from this plan:** (a) the app already had a placeholder "Send feedback" dialog that stored nothing; it was replaced by the real report dialog, so the top-bar button, the command palette and the error screens all open it; (b) the report's "screen" is the route pattern (`/designs/:id/results`), never the address, because addresses carry design ids and secret share links; (c) a reporter appears in the activity log by id only (`(reporter)`), so deleting an account leaves no email in it; (d) Support sees the reporter's display name but never their email; the reporter sees Support's replies as "Support", never a staff name; (e) messages and log rows get a sequence number so same-millisecond rows keep their order; (f) the account data export now includes the person's own reports and Support's public replies (never internal notes); (g) a demo Support account is added to the demo seed. **Run `pnpm migration:run` on your own database: migration `1794700000000-Support` is new** (the Chrome and e2e runs used throw-away databases, never yours). No AI is involved. The owner's idea (2026-11-04): users can report bugs or any system issue; reports go to a new role, **Support**, with an inbox. The faculty extended the deadline, so this plan is sized by quality, not by days.

## 1. What exists today
- **Roles (R1):** `user` (implicit), `instructor`, `reviewer`, `admin`, held in `user_roles` (a CHECK allows exactly those three granted roles), changes recorded in the append-only `role_audit`. One permission table in `account-role.enum.ts`; routes declare `@RequirePermission(...)`; roles are read from the database on every call; **roles are never inherited and no role reads a private design unless its own rule allows it** (Reviewer only reads designs shared with them; Admin never reads design content).
- **Admin tools:** `/admin/users` (find, grant or revoke roles, suspend or restore, audit). Demo accounts exist for each role.
- **Web:** a Help drawer, a keyboard-shortcut sheet, error and system screens (`system-screen.tsx`), a session modal, Settings. No way for a user to tell anyone about a problem.
- **Not present:** any ticket, message or inbox concept, any in-app notification, any email sending.

## 2. The feature in one sentence
A signed-in user can **report a problem** (bug, wrong-looking result, account issue, idea) from anywhere in the app; the report lands in the **Support inbox** (a new role), where Support triages, replies and resolves it; the user follows their reports and Support's replies under **My reports**.

## 3. Scope
**P0 (first version)**
1. **Report a problem:** a button in the Help drawer and on every error screen; a short form: category, title, what happened, what you expected (optional). Plain text, bounded.
2. **Automatic technical context** (shown to the user before sending, removable): page address (without secrets), browser and screen size, app version, time, and for an error screen the request id. Never a password, token, cookie or design content.
3. **My reports:** the user's list (reference such as `SF-1042`, status Open, In progress, Waiting for you, Resolved, and the thread of replies); the user can add a message and reopen within 14 days of resolution.
4. **Support role:** a new grantable role `support` with its own permissions (see D2); an Admin grants and revokes it exactly like the others (audited).
5. **Support inbox (`/support`):** a table of reports (reference, category, title, status, priority, age, assignee), filters and search, newest first, an unread marker; a detail view with the thread, reply box, **private internal notes** (never shown to the user), status and priority controls, assign to me or to another Support account.
6. **Safety by construction:** text is plain and never rendered as HTML; length limits; a per-account rate limit (for example 5 reports an hour and 20 a day); one open duplicate title warning; every Support action on a report that changes it is recorded in an append-only log (like `role_audit`).

**P1 (after P0 is verified; each independent)**
7. **Share a design with Support, by consent:** an unchecked tick-box "Share this design with Support so they can see the problem". It grants Support read-only access to **that one design at that revision** for the life of the report; Support's view is the existing read-only snapshot viewer; **every open is logged**; the user sees "Support viewed your design 2 times" and can withdraw consent (access ends at once).
8. **In-app notifications:** a bell with a count for "Support replied" (user) and "new report" or "assigned to you" (Support).
9. **Saved replies** (canned answers Support keeps) and **merge duplicates**.
10. **Priority and response-time badges:** Low, Normal, High, Urgent; an age badge that turns amber and red after configurable waits (for example 1 and 3 days).
11. **Admin dashboard panel** (ties to `ADMIN-DASHBOARD-SCOPE.md`): open reports, median first-response time, reports by category and status (aggregates only, no text).
12. **Error-screen one-click report:** the error id and the visible message are pre-filled.

**P2 (only if wanted):** email notifications (needs a mail setup that the project does not have), screenshot attachment (needs upload limits, type checks and storage), satisfaction rating after resolution, a public status page.

## 4. Out of scope (declared)
Live chat; phone or social channels; file attachments in v1; automatic classification, summaries or replies by AI; a separate database for support (see D1); letting Support read any design without consent; letting Support change a user's account, roles or password (that stays with Admin and the user).

## 5. Design decisions (recommendation first)
**D1. Same PostgreSQL database, separate tables (recommended); not a second database.** The owner pictured "db to support db". A second database adds a copy step that can drop reports, a second system to run, back up and secure, and no real protection: access is controlled by the permission table either way. New tables: `support_tickets`, `support_messages`, `support_activity` (append-only log), `support_design_access` (P1). If hard isolation is ever required, a separate PostgreSQL schema inside the same database is the next step.
**D2. Support is its own role with narrow permissions; Admin does not inherit it.**
| Permission | Held by |
|---|---|
| `support.report.create` (write a report, read one's own) | every signed-in user (implicit, like the ordinary account) |
| `support.inbox.read` (see all reports, read threads) | Support |
| `support.inbox.reply` (reply, internal notes, status, priority, assign) | Support |
| `support.design.read` (open a design **a user consented to share**) | Support, only through the consent record |
Admin keeps granting the role and sees **only counts** on the dashboard. An Admin who also needs the inbox is granted Support, which is audited. Support cannot read private designs, change roles, suspend accounts or see the audit log.
**D3. A report belongs to its author, and what happens when they delete their account is stated up front (recommended):** the reports are **anonymised, not erased** (the author reference is cleared, the display name and email are not kept, the text stays) so Support keeps a record of the issue; the user is told this on the form. Alternative: delete the reports with the account.
**D4. Reference codes** `SF-<number>` from a database sequence (unguessable ids are used in URLs; the code is for talking about a report).
**D5. Categories (closed list):** Bug or error, A result looks wrong, Account or sign-in, Performance or slow, Idea or feedback, Other. Status: Open, In progress, Waiting for the user, Resolved.
**D6. Notifications in app first.** No email in v1 (no mail setup exists); the bell and the "My reports" list carry replies.

## 6. Rules declared before code
**R1. Reports are plain text.** No HTML, links are not auto-followed, control and NUL characters are refused, length-bounded; hostile text is stored verbatim and shown as text (as notes already do).
**R2. Nothing sensitive is captured automatically.** The context is a fixed list of fields; tokens, cookies, passwords, request bodies, design graphs and local storage are never collected. The user sees exactly what will be sent and can remove each item.
**R3. Support sees reports, not designs.** A design is readable by Support only through a live consent record, read-only, at the shared revision, with every open logged and the user able to withdraw.
**R4. Internal notes never reach the user** (tested at the API: the user's endpoints cannot return them under any filter).
**R5. A report is only visible to its author and to Support.** Another user gets 403 or 404, an Admin without Support gets 403.
**R6. Every change by Support is logged** (who, what, when) in an append-only table the database itself protects (UPDATE and DELETE refused), with no foreign keys so account deletion never rewrites history.
**R7. Rate limits and bounds hold on the server**, not only in the form.
**R8. Honest states.** The user is told when their report was received (reference code), what happens next, and that replies appear under My reports; Support's "unread" marker is per Support account.
**R9. No new power is a side effect:** granting Support adds nothing to the other roles' permissions, and revoking it removes the inbox at once (roles are read from the database on every call).

## 7. Technical plan
**Database (one migration, `Support`; the owner runs `pnpm migration:run`):** `support_tickets` (id uuid, ref serial, author_id nullable, category, title, body, expected, context jsonb with a fixed shape, status, priority, assignee_id nullable, created_at, updated_at, resolved_at), `support_messages` (id, ticket_id, author_id nullable, author_kind user or support, internal boolean, body, created_at), `support_activity` (append-only with the same trigger pattern as `role_audit`), and the CHECK constraints on `user_roles.role` and `role_audit.role` widened to include `support`. Indexes on ticket status and created_at and on author. `down` removes the tables and restores the constraints (refusing if any `support` role rows exist).
**Contract (additive):** `support.schema.ts` (strict zod: create report, list, detail, message, status change, internal note; `context` has a fixed object shape), added to `phase3.openapi.json`; web types regenerated. `Permission` enum and the one permission table gain the support permissions; `GRANTABLE_ROLES` gains `support`; the Accounts page role pickers and the role audit wording gain the new role.
**Server:** `modules/support/` with `SupportService`, `support.controller.ts` (user routes `/v1/support/reports`, Support routes `/v1/support/inbox`), the rate limit, and the activity log; `AccountRolesService` accepts the new role.
**Web:**
- `components/support/report-dialog.tsx` (the form with the visible context and the plain notices), opened from the Help drawer and the error screens.
- `components/support/my-reports.tsx` (list and thread) under Settings or the account menu.
- `components/support/inbox.tsx` and `ticket-detail.tsx` (`/support`, Support only; the route registry and the navigation gain the entry only for that role).
- `lib/support.ts` (formatting, statuses, validation mirrored from the server, the context collector with the allow-list).
**Order of work:** (1) migration, permissions, contract, service with e2e tests; (2) the context collector and the report form with unit tests; (3) My reports; (4) the Support inbox and detail; (5) role plumbing on the Accounts page; (6) P1 items one at a time, each with tests; (7) Chrome tests, deliberate breaks, screenshots in light and dark at three widths, full regression, demo script, handoff.

## 8. Test and verification plan
- **Server (e2e, real PostgreSQL):** create a report (shape, reference code, rate limit and bounds, hostile text stored verbatim); the author lists and reads only their own; another user gets 403 or 404; **an Admin without Support gets 403**; Support lists all and reads any thread; **internal notes never appear in any user endpoint** (every route, every filter); status and priority changes are logged and the log refuses UPDATE and DELETE; granting and revoking `support` takes effect at once and is audited; revoking removes access on the next call; deleting an account anonymises its reports per D3; the context field refuses extra keys (nothing sensitive can be smuggled in); the migration up and down on a database that already has data.
- **Consent (P1):** Support cannot open a design without consent; with consent they get a read-only view of that revision only; each open is logged and counted for the user; withdrawing consent ends access immediately; a second design of the same user stays unreadable.
- **Unit (web):** the context collector returns only the allowed fields and strips query strings and fragments; validation and counters mirror the server; status and badge logic; the inbox filters.
- **Browser (Chrome, real server):** a user reports a problem from the Help drawer and sees the reference code; the report appears in Support's inbox; Support replies and the user sees the reply under My reports; an internal note is invisible to the user; a user cannot open `/support`; Support cannot open `/admin/users`; the context preview lets the user remove items; widths 320, 390 and 1024 in light and dark; keyboard use; error screen one-click report.
- **Deliberate breaks** (each must fail a test): leak an internal note to the user, let an Admin without Support read the inbox, collect a token in the context, skip the rate limit, allow design access without consent, make the log updatable, render the body as HTML.
- **Visual review:** screenshots of the form, My reports, the inbox and the detail, in each state (empty, busy, error), looked at before it is called done.

## 9. Sequencing and cut lines
The faculty extended the deadline, so the cut order is by value, not by date: if scope must shrink, drop P2, then 12, 10, 9, 8, 11, and last the consent flow (7), but **never** the permissions (D2), the plain-text and context rules (R1, R2), the author-only visibility (R5), the audit log (R6) or the tests. P0 alone is a complete, honest support system. Build order across the three open features (admin dashboard, support, AI acceptance run) is the owner's call; the support system and the admin dashboard share one panel (11) and one migration pattern, so building the dashboard first and Support second works well.

## 10. Questions for the owner
1. **One database or two:** same database, separate tables (recommended)?
2. **Design sharing:** a per-report consent that gives Support read-only access to one design (recommended), or no design access at all?
3. **Account deletion:** anonymise the reports (recommended) or delete them with the account?
4. **Does an Admin also see the inbox?** My recommendation is no (Admin grants Support and sees counts); an Admin who needs it is granted Support.
5. **Notifications:** in-app only (recommended), or do you have a mail service to use?
6. **Categories and statuses:** are the lists in D5 right, and do you want priority and response-time badges (P1 10)?
7. **Which first:** the admin dashboard, the support system, or the AI acceptance run?
8. **Faculty document:** has it arrived, and does it name a support or reporting feature?

## 11. Definition of done
P0 items 1 to 6 working in Chrome against the real server; every test in section 8 green and the breaks caught; screenshots of every screen and state looked at in light and dark at three widths; the migration tested up and down on a database with data and its run command stated clearly for the owner; the demo script has a step that follows a report from user to Support and back; the handoff entry says what is and is not covered; committed and pushed only on the owner's say.

## 12. What this feature does not claim
It does not guarantee a reply time, does not diagnose problems for the user, and does not make reports private from the people who are meant to read them (Support). A report is the user's own words plus a short list of technical facts they have seen and approved.


## 11. Admin aggregate follow-up — 2026-11-05

Owner approved proceeding with the handoff plan. Item 11 is implemented without a new route, migration or dependency: the existing Admin metrics response and dashboard gain all-time total/unresolved counts, closed category/status tables, median first public reply time and its valid reply denominator. Unresolved means Open, In progress and Waiting. Null/negative durations are excluded; zero is valid; no valid samples is null. Internal notes and author replies do not start the clock. Support appears in the role breakdown. Admin receives no report text, technical context, identities or ticket ids, and gets no inbox/design permission.

Backend 780 unit and 396 e2e tests pass, including zero data, all categories/statuses, odd/even medians, invalid timestamps, real reply lifecycle and privacy/role refusals. Web 512 unit tests and a clean production build pass. All 20 targeted Chrome checks pass at 1024/1440 in light/dark, including live counts, narrow layouts, keyboard focus and reduced motion. Ten deliberate breaks are caught. Full Chrome: 1,150 passed/10 skipped/4 stale shell failures; after owner-approved test correction and missing breadcrumb/heading repairs, final affected Chrome passes 40/40. No second complete run after those small UI repairs. Necessary repairs address existing React lint errors and a delayed-session dialog focus bug; existing assertions were not weakened. [Evidence](audit/support-metrics-2026-11-05/README.md). Consent sharing, notifications, saved replies/merge and P2 remain unbuilt.
