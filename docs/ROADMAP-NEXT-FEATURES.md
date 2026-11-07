# Next features: roadmap, order of work and scopes

**Written 2026-11-06. Status: A/B published through 16bc7d5; C/E complete locally (not pushed); D/F remain DRAFT and unbuilt; G blocked on owner inputs.** The faculty extended the deadline, so everything is sized by quality (S small, M medium, L large), not days. It covers the six items the owner listed plus the community gallery (full scope in [DESIGN-FEED-SCOPE.md](DESIGN-FEED-SCOPE.md)).

Every item follows the usual loop: scope and owner approval, build, unit tests, e2e on real PostgreSQL, Chrome specs on a production web build, deliberate breaks, screenshots looked at, handoff entry, ask before commit, commit by explicit path, push only on instruction. The protected `docs/audit/m2-profile-source.json` is never staged. No live AI call is needed for any item here.

## 1. The items at a glance

| # | Item | What it gives | Size | Migration | Needs first |
|---|---|---|---|---|---|
| A | **One-click PDF from Results** | Download the PDF straight from the Results tab or header, without opening the Report page | S | none | nothing |
| B | **Dashboard extras** | Peak-hours heatmap and an export (CSV, JSON, one-page PDF) of the Admin numbers | S to M | none | nothing |
| C | **Notification bell** | An in-app bell with a count and a list: Support replies, new or assigned reports, later community events | M | yes | nothing |
| D | **Community gallery** (the feed) | Publish a design, browse, comment, remix, suggest a change, moderate | L, in five phases | yes, per phase | C for the full flow |
| E | **Saved replies and merge duplicates** | Support keeps canned answers and merges two reports about the same problem | M | yes | nothing |
| F | **Support design sharing by consent** | A person lets Support open one design, read-only, for one report | M to L | yes | nothing (benefits from C) |
| G | **AI acceptance run** | Real quality figures for the three AI tasks | n/a | none | **owner inputs** (see section 4) |

## 2. Recommended order, and why

1. **A. One-click PDF.** Small, no server change, fixes the exact friction the owner hit. Do first.
2. **B. Dashboard extras.** Small, aggregate-only, extends something already built and demoed.
3. **C. Notification bell.** A foundation: Support, the gallery and later features all need it. Build it before the gallery so the gallery never has to poll.
4. **D. Community gallery, phases F1 to F3** (publish, browse, view, comment, remix). The most visible new feature and a complete story on its own. Then **F4 suggestions** and **F5 moderation and counts**.
5. **E. Saved replies and merge.** Support polish. Worth doing before the gallery reports start arriving in volume, so it can sit between F3 and F4 if reports appear.
6. **F. Design sharing by consent.** The highest security cost and the lowest demo value. Build it last, and only if the owner wants Support to see designs.
7. **G. AI acceptance run** runs in parallel, blocked on the owner. It is the biggest open risk for the faculty's "fully operational AI" requirement, so the owner's time (the independent writers) should start now.

If the owner wants the most impressive demo soonest: A, B, C, then D (F1 to F3).

## 3. Scopes

### A. One-click PDF from Results (S) — verified; local commit 521f536
**Today:** the Results tab and the workspace header link to the Report page (`/designs/:id/report`), where **Download PDF** builds the file in the browser (the library is already loaded only when asked).
**Build:** a shared hook `useReportPdf` (fetch the report for a revision and run, build the PDF, save it) used by the Report page and by a **Download PDF** button in the Results panel and the workspace header. The header button builds the report for the saved revision's latest result; the Results panel builds it for the run being shown. It shows "Making the PDF..." and any failure plainly, with a link to the Report page as the fallback. A small "include decisions and assumptions" tick, remembered per browser, defaults to the Report page's default (on).
**Rules:** the file is identical to the Report page's (same code, same bytes for the same inputs); nothing new is fetched beyond the existing report endpoint; an unsaved design downloads the saved revision and says so; no result yet means the button is disabled with the reason.
**Tests:** unit for the hook's states; Chrome: download from Results gives the same file as from the Report page (compare the PDF text), failure shows the message and fallback, phone widths; a deliberate break (wrong run, wrong revision).
**Does not claim:** that unsaved changes are in the file.

**A verification (2026-11-06):** shared hook and direct header/Results controls built with synchronized notes choice. Header targets latest completed simulation of saved revision; Results pins displayed run/revision. Draft-safe Blob downloads and correct cancellation; real navigation remains guarded. Final build/types/lint/46 routes, 530 unit pass. Broad Chrome 168 pass/4 @dev skips; final PDF-focused 48/48 after a small state repair. No new dependency/API/migration or backend suite/full-project Chrome rerun. [Evidence/limits](audit/direct-pdf-2026-11-06/README.md). A committed locally as `521f536` on owner approval; not pushed.

### B. Dashboard extras (S to M) — verified; local commits 4993b9b / 9d21ba3
**Peak-hours heatmap:** a 7 by 24 grid (weekday by UTC hour) of activity (designs and runs created) over the last 28 days, added to the Admin metrics snapshot as 168 integers under the same single read-only transaction and cache. Shown as a grid with the **number in each cell** and a table behind it (never colour alone), a legend, and a note that times are UTC.
**Export:** `GET /v1/admin/metrics/export?format=csv|json` (Admin only, same permission, same snapshot, so it contains exactly what the dashboard shows and nothing more), plus a **one-page PDF** of the headline numbers reusing the dossier drawing code. File names carry the UTC time.
**Rules:** aggregate only (the leak test is extended); CSV contains only keys and numbers (no free text, so no spreadsheet-formula injection); exporting is audited with a counter, not content; the export respects the cache.
**Tests:** e2e (cells sum to the same totals as the cards for the window, boundaries across midnight and week, empty database, no personal data in any format, non-Admin refused); Chrome (heatmap, three downloads parse); deliberate breaks (off-by-one hour or weekday, a name in the export).

**B decisions approved through implementation go (2026-11-06):** rolling [snapshot time minus 28 days, snapshot time) window, UTC Monday-first cells, matching 28-day design/run totals. A derived aggregate-only snapshot key pins exports to the clicked view; retain up to 128 snapshots for 5 minutes, and fail clearly on expiry/restart rather than replace it. Export responses use the existing API envelope and browser file saving. CSV/JSON use the export endpoint; PDF obtains the same JSON snapshot with an explicit PDF purpose, then uses the existing drawing library. Redis stores accepted-export request counters by UTC day/closed format only (90-day TTL), not users or contents; unavailable audit storage blocks exports with a local error. No migration or new package.

**B verified (2026-11-06):** backend 785 unit/399 e2e; final web 536 unit/build/types/lint/46 routes; contracts clean. Chrome affected regression 124/124 plus final rebuilt B 12/12; nine in-memory mutations caught. Actual Redis failure/recovery and retained exports verified; 320/390/1024/1440 light/dark inspected. Initial failures and restored disposable-container storage workaround disclosed. No migration/dependency/live AI/push. [Guide](ADMIN-DASHBOARD-EXTRAS.md), [evidence/limits](audit/dashboard-extras-2026-11-06/README.md), report section 42.

### C. Notification bell (M) — verified locally; owner migration required
**What:** a bell in the top bar with an unread count and a list. Events at first: Support replied to your report; your report's status changed; (Support) a new report, a report assigned to you, the reporter replied. The gallery adds comments, replies, suggestions, accept or decline and moderation notices later.
**Data:** `notifications(id, user_id, kind, ref_id, created_at, read_at)`. **Only a closed `kind` and ids are stored, never text**; the sentence is built in the browser from the kind, so a notification can never carry hostile or private text. Deleted when the account is deleted. Rows older than 90 days are ignored by reads and removed lazily.
**API:** list (newest first, cursor), unread count, mark one or all read. A person only ever reads their own.
**Delivery:** polling every 30 seconds while the tab is visible (the same pausing, back-off and out-of-order rules as the Admin dashboard), no push and no email.
**Rules:** a notification is created in the same transaction as the event that causes it; no notification for your own action; a per-kind mute in Settings; count capped at "99+"; never reveals content someone may not see (a revoked person's notification opens a "no longer available" page, not the content).
**Tests:** e2e (created with the event and only for the right person, own-only reads, mark read, retention, account deletion, no text stored); Chrome (bell count updates by itself, opens the right page, keyboard and screen-reader behaviour, phone widths); deliberate breaks (notify the wrong account, store text).

### D. Community gallery (L)
Full scope, brainstorm, phases F1 to F5, rules and questions: [DESIGN-FEED-SCOPE.md](DESIGN-FEED-SCOPE.md). In one sentence: publish a **frozen snapshot** of one revision, browse and comment, **remix** into your own account, and **suggest a change** that the owner reviews with a server-verified before-and-after; nobody but the owner ever edits the owner's design.

### E. Saved replies and merge duplicates (M) — complete locally, 2026-11-07

Backend 785/785 unit and 422/422 e2e (32 suites, four sequential processes); web 557/557 unit; Chrome 88/88 affected across four light/dark laptop projects; four applied functional faults caught. Builds, lint/types, both contracts and 46 routes pass. [Guide](SUPPORT-EXTRAS.md), [scope](SUPPORT-EXTRAS-SCOPE.md), report section 45. The surviving link resolves only the caller's original private thread; no conversation is combined. Owner migration required; no push authorized.

**Saved replies:** Support keeps short canned answers (title and plain-text body up to 4,000 characters) as **personal** or **shared with the team**. A picker in the reply box **inserts the text into the box; it never sends by itself**, so Support edits before sending. A tiny placeholder set (`{code}` for the reference, `{name}` for the reporter's display name) is filled in when inserted; nothing else is substituted. Limits: 50 personal, 100 shared; shared ones can be edited by any Support account, with the change logged.
**Merge duplicates:** from a report, Support marks it a **duplicate of** another report. The duplicate becomes Resolved with a system message to its author ("merged into SF-1042"), a link to the surviving report, and the author can keep writing there. Rules: no merging a report into itself or into one already merged (no chains or cycles); both threads stay readable; **merge is logged and can be reversed by Support** (the duplicate reopens); internal notes never cross to the other reporter; the surviving report's author is not shown the other author's name or text.
**Data:** `support_saved_replies`; `support_tickets.merged_into_id` (nullable); activity action `merge` and `unmerge`.
**Tests:** e2e (insert never sends, placeholders, ownership of personal replies, shared edit is logged, merge rules and cycles, notes and names never leak across, unmerge, the migration up and down); Chrome; deliberate breaks (leak a name across a merge, allow a cycle).

### F. Support design sharing by consent (M to L)
**Scope item 7 of [SUPPORT-SYSTEM-SCOPE.md](SUPPORT-SYSTEM-SCOPE.md), built as written there.** On the report form an **unticked** box "Share this design with Support so they can see the problem" lets the person pick **one** of their designs and one revision. It grants **Support read-only access to that frozen snapshot, for that report only** (the same allow-listed snapshot as a share link), through a Support-only permission `support.design.read`.
**Rules:** consent is per report and per design revision; **every open is logged** (append-only) and the person sees "Support viewed your design 2 times" with the times; the person can **withdraw at any moment and access ends at once**; access also ends 14 days after the report is resolved; a second design of the same person stays unreadable; Admin gets nothing; the snapshot contains no private notes or other revisions.
**Data:** `support_design_access(ticket_id, design_id, revision, frozen_report, granted_at, withdrawn_at)`, `support_design_opens` (append-only).
**Tests:** e2e (no consent, no access; withdrawal ends access immediately; one design only; opens are counted and listed; expiry; Admin refused); Chrome (grant, view, withdraw, the counter); deliberate breaks (allow access without consent, ignore withdrawal, expose a note).

### G. AI acceptance run (blocked on the owner)
Needs, from the owner: at least 5 independent people to write the goals, a decision on the retry-rule contradiction in [AI-DEADLINE-PLAN.md](AI-DEADLINE-PLAN.md), confirmation of the pass bars, and an explicit go for about 68 live calls. Until then every AI figure is a development figure and must stay labelled so.

## 4. Things only the owner can do (in this order)
1. **Run `pnpm migration:run`** on their own database after each item that adds a migration (this roadmap adds several; each will say so loudly).
2. **Start collecting the AI test writers now.** It is the only slow, human part.
3. **Answer the questions** in [DESIGN-FEED-SCOPE.md](DESIGN-FEED-SCOPE.md) section 11 (the gallery needs decisions before any code) and approve the order above.
4. Run the personal timed rehearsal and supply the faculty document (it may add a requirement and change this order).

## 5. Risks and how the plan handles them
- **Moderation load in the gallery.** Mitigated by a signed-in-only start, rate limits, a publishing bar (a completed test run), owner-side hide on comments, reports into the existing Support inbox, and a seeded, curated start.
- **Privacy of published designs.** Mitigated by frozen allow-listed snapshots, a leak test against an allow-list, explicit ticks, instant unpublish, and honest wording about copies that cannot be recalled.
- **Scope creep ("Facebook for designs").** Mitigated by the cut list in the gallery scope (no live co-editing, follows, messages or ranking) and by phases that each stand alone.
- **A large feature on a laptop with limited memory.** One heavy job at a time, a production build for Chrome runs, throw-away databases for browser tests.
- **Migrations on the owner's database.** Additive only; every down migration refuses if it would lose data; each handoff entry states the run command.

## 6. Definition of done for each item
Built to its scope in this document; every test listed green and every deliberate break caught; screenshots in light and dark at 320, 390, 1024 and 1440 looked at; the demo script gains a step; the handoff entry says what is and is not covered; the migration run command stated for the owner; committed and pushed only when the owner says so.
