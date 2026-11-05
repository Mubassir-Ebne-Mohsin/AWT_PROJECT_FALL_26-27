# Admin live dashboard: scope and plan

**Written 2026-11-04. Status: BUILT 2026-11-05 on the owner's "Admin dashboard" go, using the recommended defaults (see the handoff entry); not committed. Not built: items 14 (heatmap), 20 (system detail beyond database, cache and uptime), 11 export, and the other tier B/C ideas.** No AI is involved. The owner's idea (2026-11-04): "for admin, a dashboard with live updates of total users registered, designs made, and more". The faculty's document has not arrived; if it names an admin or reporting feature, this scope is amended to match.

## 1. What exists today
- **Admin tools (R2):** `/admin/users` (find accounts, change roles, suspend or restore, read the role audit log). Routes under `/v1/admin/*`, each guarded by `@RequirePermission(...)`. **One permission table** (`account-role.enum.ts`): roles are never inherited, are read from the database on every call (not the token), and **"Admin never reads design content"** is an explicit rule of the project.
- **Data already in PostgreSQL:** `users` (createdAt, status active or suspended, role), `user_roles`, `designs` (createdAt, source blank, template, import, scripted or ai, templateId, archivedAt), `design_runs` (createdAt, status, payload with verdict and kind), `design_notes`, `design_shares`, challenge, attempt and review tables, `ai_task_calls` (task, outcome, tokens, latency; no text), and `role_audit` (append-only).
- **Also available:** a `/v1/health` probe (API, database, Redis), the AI quota state (free-tier limits and back-off) and the AI readiness per task.
- **Not present:** any live or streaming transport (no SSE, no WebSocket), any "last seen" tracking, and any metrics endpoint. The web app uses react-query and bearer tokens held in memory.

## 2. The feature in one sentence
An **Admin-only live dashboard** at `/admin/dashboard` that shows platform totals (users registered, designs made, test runs) with how fast they are growing, what people are building and how it is going, and whether the system is healthy, refreshing by itself every few seconds, using **aggregate counts only**: no emails, names, design content or any other personal data.

## 3. Scope
**P0 (the first version; must ship)**
1. **Totals (headline cards):** users registered (and how many are suspended), designs (kept) and designs created in the last 24 hours, test runs and runs in the last 24 hours, and "active in the last 15 minutes" (see D3).
2. **Live refresh:** the numbers update by themselves (about every 5 seconds), with a visible state: **Live**, **Paused** (tab hidden or paused by the admin), **Reconnecting** (with back-off) or **Stale** (no fresh answer for 30 seconds), and "updated N seconds ago".
3. **Trends:** three small charts, each with an accessible table behind it: registrations per day (14 days), designs created per day (14 days), test runs per hour (last 24 hours).
4. **Breakdowns:** designs by how they were made (blank, template, import, keyword draft, AI draft); runs by outcome (pass, strained, fail, failed); accounts by role; the most used templates.
5. **System health strip:** API, database and Redis (the existing probe), and the AI service (enabled tasks, quota used today against the free limit, back-off if any).
6. **Safety by construction:** a new permission `admin.metrics.read` held only by the Admin role; aggregate numbers only (R1); read-only; rate-limited; no design names, ids, emails or notes anywhere in the response.

**P1 (after P0 is verified; each independent)**
7. **Engagement funnel:** of all registered users, the share who created a design, ran a test, used a template, and used each AI task (counts and percentages).
8. **Time range selector** (1 hour, 24 hours, 7 days, 30 days) for the "new in the window" figures and the charts.
9. **Alerts strip:** plain, rule-based notices (for example "AI quota is above 80% of today's free limit", "more than 5 AI calls failed in the last hour", "registrations are 5 times the 7-day average", "no test run has completed in 10 minutes while some were requested").
10. **Anonymous activity feed:** the latest 20 events as words only ("A design was created from a template", "A test run finished: fails", "A new account registered"), newest first, with relative times. Needs the event log in D2 (option B) or is derived from the latest rows without any identifiers (option A).
11. **Export:** download the current snapshot as JSON or CSV, and as a one-page PDF reusing the dossier code (`web/src/lib/dossier`).

**P2 (only if time remains):** an SSE push transport (D1), counters for ladder, fixes and what-if usage (they are computed on demand and not stored today), per-day comparison with the previous period.

## 3b. More panels (added 2026-11-04 on the owner's request)
Each uses only data the system already has, shows aggregates only (R1), and is independent: it can be built, tested or cut on its own. "Cost" is rough build effort including tests. Tier A is what I would add first.

**Product insight (what people build and where it breaks)**
| # | Panel | What it shows | Data it counts | Cost | Tier |
|---|---|---|---|---|---|
| 11 | **Where designs break** | Which component type is the limiting component in failing or strained runs (app, database, cache, queue...), as a bar chart | `design_runs.payload` bottleneck type, verdict | Small | **A** |
| 12 | **What people build** | Components per design (buckets 1-5, 6-10, 11-20, 21+), most used component types, average size | `designs.graph` node counts and types | Small to medium | A |
| 13 | **Traffic people test** | Distribution of requests per second tested (buckets) and the median | `design_runs.payload` traffic | Small | B |
| 14 | **Peak hours heatmap** | A 7 by 24 grid (weekday by UTC hour) of activity (designs and runs), darker is busier | `created_at` of designs and runs | Medium | **A** |
| 15 | **Time to first design** | Median minutes from registering to the first design, and how many never made one | `users.created_at` and each user's first design | Small | B |
| 16 | **Returning users** | Distinct people active on more than one day in the last 7 days | distinct owner and day over designs, runs, AI calls | Small | B |

**AI health (ties to the Evaluation story)**
| # | Panel | What it shows | Data it counts | Cost | Tier |
|---|---|---|---|---|---|
| 17 | **AI usage by task and outcome** | Goal box, describe and what-if: calls today, completed, refused (NOT_A_SYSTEM), invalid output, rate-limited, cancelled; the share that failed | `ai_task_calls` (no text, only outcome, task, model, tokens, latency) | Small | **A** |
| 18 | **AI quota and latency** | Tokens and requests used today against the free limit, back-off if any, median and p95 latency per task | `ai_task_calls`, the quota state | Small | A |

**System health (what is running and how fast)**
| # | Panel | What it shows | Data it counts | Cost | Tier |
|---|---|---|---|---|---|
| 19 | **Simulation queue** | Runs pending now, the oldest pending age, run duration (median and p95) over the last hour, failed-run share | `design_runs` status and timestamps | Small | **A** |
| 20 | **System panel** | API uptime, app and engine version, database size and largest tables (row counts), Redis memory, Node memory | process, `pg_database_size`, `pg_stat_user_tables`, Redis `INFO` | Small to medium | A |
| 21 | **API traffic (rolling 5 minutes)** | Requests per minute, 4xx and 5xx counts, p50 and p95 latency by route group | a small in-memory counter in a request interceptor (single instance; resets on restart, and says so) | Medium | C |

**Community and trust (learning features and administration)**
| # | Panel | What it shows | Data it counts | Cost | Tier |
|---|---|---|---|---|---|
| 22 | **Learning activity** | Challenges published, attempts started and completed, submissions awaiting feedback, active reviewer grants and share links | challenge, attempt, review and share tables | Small | B |
| 23 | **Feature adoption** | Share of designs with notes, of notes pinned to a component, of designs shared, of designs with a recorded Limits search | `design_notes` (including the new pins), shares, runs | Small | B |
| 24 | **Administration activity** | Counts only: role changes and suspensions in the last 7 days (no names; the Accounts page keeps the audit with names) | `role_audit` counts, `users.status` | Small | B |

**Dashboard experience**
| # | Feature | What it does | Cost | Tier |
|---|---|---|---|---|
| 25 | **Wall display mode** | A full-screen, large-type view of the headline numbers that updates live and cycles through panels, for putting on a screen at the demo | Small to medium | **A** |
| 26 | **Panel picker** | Show or hide panels and keep the choice in the browser; a "Compact" and a "Detailed" layout | Small | B |
| 27 | **Delta badges and goals** | Change since the previous period on each card (for example +12 vs yesterday); an optional target the admin sets (for example 50 designs), shown as a progress bar | Small | B |
| 28 | **Jump to Accounts** | Cards link to the Accounts page with the right filter (for example "Suspended") | Small | B |

**Demo support (so the dashboard is alive on the day)**
| # | Feature | What it does | Cost | Tier |
|---|---|---|---|---|
| 29 | **Demo activity generator** | A command, `pnpm demo:activity`, that registers a few clearly named demo accounts (`*@demo.stressforge.test`), creates designs from templates, runs tests and calls the AI fakes at a human pace, so the numbers visibly tick during the demo. A matching `pnpm demo:activity:clean` removes exactly those accounts and their designs. It never touches real accounts, and the page does not hide that demo data exists (the Accounts page shows the demo emails) | Medium | **A** |

**Tier A** (my recommendation if time allows): 11, 14, 17, 18, 19, 20, 25, 29. **Tier B:** 12 is already A; 13, 15, 16, 22 to 24, 26 to 28. **Tier C (only if time remains):** 21, SSE push, usage counters for the ladder, fixes and what-if (they are computed on demand and not stored today).

**Honest limits of the new panels.** 11 and 13 read the stored run payloads, so they describe test runs people recorded, not every preview. 12 reads each design's graph and is cached with the rest of the snapshot, so its cost grows with the number of designs (checked with `EXPLAIN` and capped). 15 and 16 are derived from timestamps and are labelled as such. 20's database figures are the database's own estimates. 21 is per process and resets on restart. 29 creates real rows, clearly labelled demo accounts, and must be cleaned after the demo.

## 4. Out of scope (declared)
Anything about an individual: no user list, no per-user activity, no design content, no email or name in any chart or feed (the existing Accounts page already covers lookup, with its own audit); no editing from the dashboard; no external monitoring tools; no historical backfill beyond what the database's own timestamps give.

## 5. Design decisions (recommendation first)
**D1. Live transport: short polling every 5 seconds (recommended for v1), push later.**
| Option | Pros | Cons |
|---|---|---|
| **A. Poll every 5 s** (recommended) | Works with the existing bearer-token fetch; trivially testable; survives proxies; one cached snapshot serves every admin | Up to 5 s late; a request every 5 s per open dashboard |
| B. SSE over `fetch` streaming | True push, fewer requests | `EventSource` cannot send an Authorization header, so it needs fetch streaming or a short-lived ticket; more moving parts; harder to test; reconnect logic |
Both use the same snapshot; B is a P2 upgrade that changes only the transport.
**D2. What "total" means: count the live tables (recommended), not an event log.**
- **Option A (recommended):** `COUNT` over `users` and `designs`. No migration. A deleted account or design disappears from the totals, and the page says so ("kept designs"). Per-day charts come from `created_at`, so they also exclude deleted items.
- **Option B:** an append-only `activity_events` table (like `role_audit`) written when an account registers, a design is created or a run finishes. Gives monotonic "ever created" totals and a true feed, but is a migration, writes on hot paths and a deletion-privacy question. Possible later (P2).
**D3. "Active now" without new tracking.** There is no last-seen column and adding one means a write on authenticated requests. The dashboard instead shows **"active in the last 15 minutes: people who saved a design, ran a test or called an AI feature"**, counted as distinct owners from rows that already exist. It is labelled exactly that, never "online".
**D4. One snapshot, cached for 3 seconds.** The server computes all figures in one read-only transaction (a consistent snapshot, so the cards agree with each other) and caches it for 3 seconds, so ten open dashboards cost one set of queries. Every response carries `generatedAt`; the client ignores an older response that arrives after a newer one.
**D5. Where it lives:** `/admin/dashboard`, next to `/admin/users`, with an "Accounts | Dashboard" switch and a route-registry entry that says "Admins only". A non-admin gets the same refusal the Accounts page gives.

## 6. Rules declared before code
**R1. Aggregates only.** The contract has no field that can carry a string typed by a user. Property test: a response built from data with known emails, names and design titles contains none of them.
**R2. Numbers are the database's.** Every figure is a `COUNT` or a bucketed `COUNT` of existing rows; the client adds no figure, only formatting (the same rule as the PDF).
**R3. Cards agree.** All figures come from one transaction; a chart's buckets sum to the matching card for the same window (tested).
**R4. Time is UTC**, stated on the page; windows are rolling ("last 24 hours"), not calendar days, except the daily charts, which are UTC days.
**R5. Honest states.** The page always says whether it is Live, Paused, Reconnecting or Stale; a number that could not be refreshed is greyed with its age, never shown as current.
**R6. The tab is polite.** Polling stops when the tab is hidden and resumes with an immediate refresh; at most one request is in flight; errors back off (5, 10, 20, 40 seconds, then 40) and the first success returns to 5.
**R7. Motion and speech are optional.** Counters change without animation when the person prefers reduced motion; a screen reader is not told about every tick (the figures are in a labelled region that announces only when the admin asks, or once per minute at most).
**R8. Read-only and rate-limited.** One `GET`, a per-account rate limit above the 5 s poll, no write path.
**R9. Permission is the only gate.** The route requires `admin.metrics.read`, which only the Admin role holds, read from the database on every call like the others.

## 7. Technical plan
**Backend**
- `common/enums/account-role.enum.ts`: add `ADMIN_METRICS_READ` to the Admin role's list (the one table).
- `common/contracts/phase3/admin-metrics.schema.ts`: the snapshot contract (zod, strict): `generatedAt`, `windowHours`, `totals`, `windows`, `series` (arrays of `{bucketStart, count}`), `breakdowns` (arrays of `{key, count}` with keys from closed lists), `ai` (per task and outcome counts, tokens today, limit, back-off seconds), `health`. Added to `phase3.openapi.json`; web types regenerated.
- `modules/roles/admin-metrics.service.ts`: the queries (about ten aggregates, each with the existing indexes; an index migration only if `EXPLAIN` shows a scan that matters), one read-only transaction, a 3-second in-process single-flight cache.
- `modules/roles/roles.controller.ts` (edit): `GET /v1/admin/metrics`, guarded by the permission.
**Web**
- `web/src/lib/admin-metrics.ts`: type, formatting (numbers, relative time, rates), the polling state machine as a pure function (Live, Paused, Reconnecting, Stale; back-off; out-of-order rejection) plus a thin `useAdminMetrics` hook.
- `web/src/components/admin/admin-dashboard.tsx` and small parts: stat cards, sparkline (plain SVG, with a data table behind it), breakdown bars (with a table), health chips, state badge, pause toggle.
- `web/src/lib/routes.ts` and the admin navigation: the new route and the Accounts/Dashboard switch.
**Order of work:** (1) permission, contract, service with e2e tests; (2) the client state machine and formatting with unit tests; (3) the page, charts and states; (4) health and AI strip; (5) P1 items as time allows; (6) Chrome tests, deliberate breaks, screenshots at three widths in light and dark, full regression, demo script step, handoff.

## 8. Test and verification plan
- **Server (e2e, real PostgreSQL):** a non-admin gets 403 and no data; an Admin gets the strict shape; after registering users, creating designs (each source), running tests and calling the AI fake, the matching figures change by exactly that much; suspended accounts are counted in users and in "suspended"; an archived design is counted as kept; a deleted account and a deleted design leave the totals; the daily series sums to the 14-day card; the hourly series sums to the 24-hour card; **no email, name, design title or id appears in the JSON** (scan against the data created in the test); two calls inside 3 seconds run the queries once; revoking the Admin role refuses the next call at once; the route is in the published contract.
- **Unit (web):** the state machine (pause when hidden, resume with an immediate refresh, back-off steps, stale after 30 s, an older response never replaces a newer one, one request at a time); number and time formatting; sparkline geometry for zero, one and many points; tables match the data.
- **Browser (Chrome, real server):** an Admin sees the cards; registering a new account in another context raises "users registered" within about 8 seconds with no reload; creating a design raises "designs created"; a hidden tab makes no requests; killing the API shows Reconnecting then Stale, and restarting it returns to Live; a non-admin and a signed-out visitor are refused; 320, 390 and 1024 px without horizontal overflow, in light and dark; reduced motion has no animation; keyboard order and labels.
- **Deliberate breaks** (each must fail a test): drop the permission, include an email in the feed, count suspended as active, let a stale response overwrite a fresh one, skip the cache, drop the hidden-tab pause, let a chart disagree with its card.
- **Visual review:** screenshots of the dashboard in each state (Live, Reconnecting, Stale, empty database, busy database), looked at before it is called done.

## 9. Schedule and cut lines (written 4 November; the deadline is 8 November)
P0 alone is about one and a half days: server and tests (about 4 hours), web (about 6 hours), verification and visual review (about 3 hours). **Adding tier A of section 3b** (11, 14, 17, 18, 19, 20, 25, 29) adds about one more day, because most panels are one aggregate query, one small chart and their tests. Realistically, with four days left, that is **P0 plus a handful of tier A panels**, not everything. It competes with the acceptance run, the Evaluation update and the owner's rehearsal. **Cut order:** P2, then the export (P1 11), the activity feed (10), the alerts (9), the time range (8), the funnel (7); **never** the permission, R1 (aggregates only), the honest states (R5), the tests or the visual review. P0 alone is a complete, honest dashboard.

## 10. Questions for the owner
1. **Live transport:** poll every 5 seconds (recommended) or SSE push now?
2. **Totals:** count live tables (recommended, no migration), or add the event log for "ever created" totals and a true feed (a migration and writes on hot paths)?
3. **"Active now":** the derived "active in the last 15 minutes" (recommended), or add a last-seen column?
4. **Extras for the first version:** which of P1 (funnel, time range, alerts, feed, export) and which panels of section 3b do you want? My pick if time allows: the funnel and the alerts from P1, and from 3b the tier A panels **11 (where designs break), 17 and 18 (AI health), 19 (simulation queue), 25 (wall display) and 29 (demo activity generator)**; 14 and 20 if there is time.
5. **An Admin for the demo:** is there an Admin account on your machine, or should the demo use the existing demo accounts?
6. **Faculty document:** has it arrived, and does it name an admin or reporting feature?

## 11. Definition of done
P0 items 1 to 6 working in Chrome against the real server; every test in section 8 green and the breaks caught; the dashboard looked at as screenshots in every state at three widths in light and dark; no personal data in any response (tested); the demo script has one added step; the handoff entry says what is and is not covered; committed and pushed only on the owner's say.

## 12. What this feature does not claim
It does not measure real traffic to anyone's system or the model's accuracy: it counts what people did on this site. "Active" means saved, ran or called something in the window, not "online". Numbers are as of the second shown, and deleted accounts and designs are not counted.
