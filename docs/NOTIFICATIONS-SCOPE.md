# C — Notification bell

Approved by the owner on 6 November 2026; implementation and mandatory verification complete locally; not pushed. This expands roadmap C only. A/B were pushed through 16bc7d5. No gallery, email, external push service or live AI is authorized. The owner separately approved replacing the obsolete Preferences-placeholder assertion with five mute-control/saved-value checks.

## Behavior and decisions

- New report: notify active Support staff, excluding the actor. Reporter reply: assigned active Support agent, otherwise the active team. Assignment: new assignee only. Public Support reply/status change: report author only. Internal notes, unchanged status/assignment and all self-actions produce no corresponding notification.
- Five closed kinds; storage contains only notification/recipient/reference IDs, kind and timestamps. No title, body, sender name/email, prompt, design content or arbitrary text. Account deletion cascades; ticket deletion cascades references.
- Events insert in the originating Support transaction. Failure rolls back the event too. Per-kind account mutes suppress future events and retain existing items. Preferences persist on the account and are included with retained own notifications in account export.
- Newest-first timestamp/UUID cursor. Reads ignore rows older than 90 days; bounded own-only cleanup is lazy. Same-account mark-one/all are idempotent. Opening rechecks current ticket ownership/Support role; unavailable access returns no target and the bell explains it. Destination APIs retain their own authorization.
- Bell is available on authenticated shell pages. Poll every 30 seconds while visible, with 60/120/240-second failure backoff and explicit pause/resume/refresh. Latest-page polling resets pagination; pause to browse earlier items. Ignore old/aborted responses and cancel actions on close, account/route change or unmount. Preserve unsaved-draft confirmation before programmatic navigation.
- Unread badge caps at 99+. Reuse the existing focus-trapped modal, keyboard/Escape/return-focus behavior and app tokens. Numeric count and text work without color/motion. Compact phone controls preserve theme/help/AI/search access.

## API and migration

All require access JWT and derive recipient from CurrentUser; no client-supplied account ID:

- GET /v1/notifications (limit, before + beforeId), GET /unread-count
- GET/PATCH /v1/notifications/preferences (kind, muted)
- POST /v1/notifications/read-all, /:id/read, /:id/open

Normal success/error envelopes and existing throttling apply. No new frontend route (registry stays 46), package or provider.

**Owner action on completion: run pnpm migration:run in the backend before starting the updated API.** Notifications1794800000000 adds notifications/preferences tables and indexes, with no backfill. Down refuses to discard populated notification/preferences rows. Owner database is not migrated by this work.

## Acceptance checks

- Real Postgres: recipient matrix, no self/internal/no-op events, own-only reads/mutations, anonymous denial, cursor ties, mute persistence and isolation, account cascade/export, 90-day filtering/lazy cleanup, concurrent tabs, lost access, transactional rollback and migration up/down/refusal. Inspect storage/DTO allow-lists and private canaries.
- Controlled UI units: 30-second timing, hidden/visible behavior, bounded backoff, out-of-order reads, duplicate actions, close/unmount cancellation, pagination and all five saved preferences.
- Chrome: actual notification after Support reply, automatic badge update, open correct report, read-one/all, prefs persistence, staff assignment/new-report/reporter reply, role loss/unavailable, keyboard/focus, controlled local failures, 320/390/1024/1440 light/dark and reduced motion.
- Deliberate faults: wrong recipient, absent self exclusion, stored private text/expanded storage, missing current-access check, old response winning. Each must fail a meaningful assertion; restore/avoid editing production source.
- Build/lint/types/contracts/unit/e2e and affected neighboring Support/settings/shell checks. Use isolated containers/databases only, one heavy job at a time. Preserve protected M2/runtime/all audit PNGs and film; never inspect environment values or call a live AI provider.

Verification: Backend 785/785 unit, 411/411 e2e (31 suites), builds/types/lint/contracts pass. Web 544/544 full unit, 18/18 final focused controls, build/types/lint and 46 routes pass. Chrome 96/96 affected, then 20/20 final notifications, 4/4 existing shell journeys and 4/4 reduced-motion journeys; five applied deliberate faults caught. The owner additionally approved bounding the existing Support rollback test to its target migration; every previous safety assertion remains.

Record actual results and gaps in the same living report, newest handoff entry and current state before closing C. Future milestones remain separate approvals. Push C only on an explicit instruction; the current push authorized the nine already verified commits.
