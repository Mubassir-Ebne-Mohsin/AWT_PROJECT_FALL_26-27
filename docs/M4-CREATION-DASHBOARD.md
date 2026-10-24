# M4 — Creation and dashboard

Updated 2026-10-24 (Asia/Dhaka). Approved scope: [Phase 2 plan](PHASE-2-PLAN.md), milestone M4; prototype Sections 10–11. See the dated acceptance evidence in [the living report](STRESSFORGE-PROGRESS-REPORT.md#15-m4--creation-and-dashboard).

## What to use

Start the existing API and web app using the root README, then sign in:

- /new: four creation choices and template shortcuts.
- /new/template: six real templates, graph previews, selection details and a name for your copy.
- /new/blank: name, region, traffic preset, Clients-only or completely empty. This is a safe saved starting point. Drawing/connecting tools remain M5–M6.
- /new/import: paste or select JSON, check it, review its preview and name, then explicitly create.
- /new/describe: four example descriptions or your own paragraph, labelled Scripted mock before submission. Review the graph, traffic and assumptions, then explicitly save.
- /dashboard: total owned designs, retained runs, current results needing attention among the ten recent designs, owned cards, links to individual saved runs and confirmed deletion.
- In the workspace, expand “Design description and assumptions” to read the saved description. Scripted assumptions survive reopening.

No AI provider, AI quota, browser-side numerical engine, automatic Limits calculation, or new runtime dependency was added.

## Preparation and persistence

Authenticated POST /v1/designs/prepare accepts { input: ... }:

- blank: source/name/region/start/preset;
- import: source/text;
- scripted: source/text (1–1000 characters).

It returns { data: { design, assumptions } }. Preparation does not create rows or run computations. POST /v1/designs uses the existing strict CreateDesign contract to save the reviewed snapshot with server-controlled owner/revision/id. The live /docs-json operation and generated frontend types describe preparation; the original M1 planned contracts remain unchanged.

Import accepts the frozen flat version-one or versionless document, never a database record. Limit: 64 KiB raw UTF-8, 50 nodes, 200 edges. Omitted labels/properties/edge IDs get existing defaults; omitted positions invoke deterministic source layout. Explicitly invalid coordinates, unsupported versions/properties/types, injected server fields, unsafe or duplicate IDs and invalid references fail before persistence. Safe incomplete/cyclic drafts may save; runnable validation still gates Run.

The JSON transport allowance is 160 KiB for preparation because escaping a valid raw file can double its size. Other JSON routes retain 100 KiB. Both parsers are registered explicitly through the Nest adapter; raw import validation still enforces 64 KiB. Oversized transport/malformed bodies use the existing 422 envelope.

Scripted drafting ports the prototype keyword rules, including its explicit daily-user → peak-rps assumption. It is not real AI or measured traffic. Four source examples have exact graph/traffic/assumption parity tests. Unlike the source’s silent count clamps, unsupported literal counts are rejected; malformed or negative/fractional server counts cannot become positive integers by partial matching. Description plus a clearly delimited “Scripted mock assumptions” text section is validated against the existing 2000-character description limit and stored together. No new Notes feature or schema migration.

## Recovery rules

CreationSession instances live in CreationProvider above system-screen replacement, keyed by user and creation screen. There is no persistent browser storage. Input changes invalidate checked previews; renaming a checked draft keeps it. Explicit logout/account switch disposes sessions, including late replies.

Only one preparation/create request can be in flight per screen. Late responses after leaving cannot navigate back. A successful response is retained for deliberate reopening. For a lost response or 5xx, creation may already have committed: no automatic create retry; check the dashboard or confirm a deliberate new intent. This is conservative duplicate prevention, not a server idempotency guarantee across reloads/tabs. Pending/unconfirmed creation triggers an unload warning. Reload still clears unsaved memory; the UI says so.

Dashboard results come from saved summaries, not recalculation. Unrun, stale, pending, failed calculation and model verdicts have distinct labels. “Needs attention” is explicitly scoped to current results in the ten recent designs; retained counts do not claim lifetime totals. Deletion uses the shared accessible alert dialog, cascades stored runs, cancels compute through M3, clears matching cached editor state and refreshes summaries.

## Verification and safe reproduction

Reuse existing Node 22/pnpm tests. Run API e2e only with a disposable DB_TEST_DATABASE. Browser tests use SF_WEB_URL/SF_API_URL and a dedicated database/Redis; traces and storage-state artifacts stay off. STRESSFORGE_AUDIT_BUILD=1 selects .next-audit rather than the normal development output.

Focused files: API creation.spec.ts and designs.e2e-spec.ts; web creation-session.test.cjs, browser/m4.spec.ts and browser/m4-recovery.spec.ts. The report records final results, failures found and corrected, coverage scope, screenshots, real service outages and limitations.

Two explicit opt-in harnesses under web/tests support the local audit setup only:

- SF_M4_REAL_OUTAGES=1 node tests/verify-m4-services.cjs stops/starts ONLY labelled M4 containers, checks exact host ports 5547/6394, and always restarts them in finally. Use an audit API on 5003 pointing at the dedicated sf_m4_outage database and web on 3003. Never point it at normal data.
- SF_M4_REAL_API_OUTAGE=1 node tests/verify-m4-api-outage.cjs waits for an operator to stop/restart their isolated API between two Enter signals (send the second only after /v1/health is200); it verifies waking-up and retained import text. It never stops a process itself.

Future milestone work must update the same living report, retain history, add fresh evidence and reassess any touched earlier requirements. Nothing updates automatically.
