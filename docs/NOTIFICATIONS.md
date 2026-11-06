# Notification bell — roadmap C

## Before running the updated API

**Run the new migration on your own database.** This work migrated only disposable audit databases. With Docker/Postgres running, stop your current backend and use PowerShell:

```powershell
Set-Location "C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\nest-boilerplate\nest-boilerplate"
pnpm migration:run
pnpm start:dev
```

`Notifications1794800000000` adds notifications and mute preferences with indexes. It does not backfill old events or alter existing reports. Down refuses to discard populated notification/preferences rows. No new package, paid service, AI call or frontend route is needed. The existing frontend run command is unchanged.

## Use the bell

Sign in and select the bell in the top bar. It shows an unread count, capped at **99+**. New Support replies and report status changes appear automatically, normally within 30 seconds while the tab is visible. Support staff additionally receive new-report, assignment and reporter-reply alerts.

Opening an item marks that item read and checks current access before navigation. Other updates remain unread until opened or marked read. A first public Support reply can create two notices: one for the reply and one for its automatic status change. Internal notes and your own actions never notify you. An unchanged status or assignment does not create another event.

**Mark read** affects one item; **Mark all as read** affects your own retained items. This is separate from the Support inbox's per-report unread indicator. Use **Load earlier notifications** to browse, **Pause updates** to keep the current page, or **Resume updates** to return to the latest view. Polling refreshes the latest page, so pause before reading earlier pages. Hidden tabs stop polling; visible tabs refresh immediately. Errors stay local, retain the last data and offer Refresh; automatic retry backs off to at most four minutes.

Keyboard: Tab navigates the dialog, Escape closes and restores focus. Ctrl+K closes the bell before opening the command palette. Async actions move focus to the stable Close control so disabling/removing a row action cannot strand keyboard focus. A pending open is cancelled when closed, signed out, changing account/route or unmounted. Unsaved architecture drafts still require confirmation before navigation.

## Preferences and privacy

**Settings → Preferences** contains five account-level mute controls. Mutes stop future matching notifications; existing items stay readable. Controls respond immediately and roll back on failure, then reconcile with saved server values. Staff kinds apply only while you hold the Support role. Each person sees and changes only their own preferences.

New reports notify active Support staff other than the actor. Reporter replies notify the active assignee, or the active team if no active Support assignee exists. New assignments notify the assignee, excluding self-assignment. Public replies/status changes notify the author, excluding the actor. All inserts share the event's transaction; a failed notification insert rolls back the originating change.

Storage contains only IDs, one of five closed kinds, creation/read timestamps and boolean preferences. Labels are built in the browser; titles, messages, names, email addresses, prompts and design contents are not stored in notifications. Account export includes your retained notifications and preferences; deleting an account cascades both. Deleted tickets remove their notification references.

Only the last 90 days are read. Expired own rows are cleaned in bounded batches during reads. Old receipts cannot grant access: opening rechecks current ownership/Support role, and unavailable access shows a local message instead of opening report content. Destination APIs enforce access again.

## Developer interface

Access JWT required, recipient derived from CurrentUser:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /v1/notifications | Latest-first page; limit 1–50, cursor before + beforeId |
| GET | /v1/notifications/unread-count | Own unread count |
| GET / PATCH | /v1/notifications/preferences | Read all kinds / save {kind, muted} |
| POST | /v1/notifications/read-all | Mark own retained items read |
| POST | /v1/notifications/:id/read | Mark one own item read |
| POST | /v1/notifications/:id/open | Mark/read and resolve a currently authorized internal target or null |

Normal API envelopes/throttling apply. Foreign or expired notification IDs return the same not-found result. No arbitrary target URL is accepted. Future gallery kinds need their own scope, contract/storage migration and privacy tests.

Scope: [NOTIFICATIONS-SCOPE.md](NOTIFICATIONS-SCOPE.md). Verification and limitations are recorded in the living progress report and [dated evidence](audit/notifications-2026-11-06/README.md).
