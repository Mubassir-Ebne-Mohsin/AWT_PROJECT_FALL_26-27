# M6 — Connections, undo and graph repair

Updated 2026-10-24 (Asia/Dhaka). Approved implementation scope: prototype Sections12–14 and store history behaviour, [Phase2 roadmap](PHASE-2-PLAN.md), and the reviewed M6 plan. Final evidence/verdict lives in [the progress report](STRESSFORGE-PROGRESS-REPORT.md).

## Using M6

Start/restart the existing API and web app using the root README. No dependency install, migration or environment change is needed specifically for M6.

1. Create a blank design. Drag Clients, App server and Database onto separate parts of the canvas, or add them by clicking and then move them apart.
2. Use **Connect (C)**, click Clients, then App server. Repeat App server to Database. Alternatively drag a node's right output handle onto a target, or use Source component / Destination component / Add connection in the properties panel.
3. Use Escape to cancel a connection; no edge is committed. In connect mode, Escape with a pending source cancels that source; Escape again returns to selection.
4. Use **Check graph**. It saves the latest valid draft first, then validates that saved revision.
5. Read each error's explanation and repair step. Select buttons focus affected nodes; disconnected Clients also offer Start connection.
6. Resolve blocking errors and Run test. Reopen/reload to recover the saved graph and results.

Connections show direction with arrowheads. Select one by clicking its line, keyboard focus, or the Connection dropdown. Reverse connection retains its identity; Delete connection removes it. Self-links, duplicate directed edges and inputs into Clients are rejected without saving. Existing limits remain50 nodes/200 edges. Cycles are valid saved drafts but block Run. Unreachable components and other model warnings are shown separately and do not automatically block Run.

The validation panel distinguishes current results from Outdated check. Editing never silently repairs or replaces your graph. Checks are explicit, not a background simulation/preview or a request on every pointer movement. Run's structured graph rejection also populates the panel. Failed/late checks cannot claim that newer inputs are valid.

## Editing and history

- Duplicate component copies properties, creates a collision-free ID and offsets the copy. It copies no arrows. Labels remain within80 characters.
- Delete selection removes a node plus all incident edges, or just the selected edge.
- Undo/Redo are buttons and Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y. Ctrl+D duplicates; Delete/Backspace deletes; C toggles Connect. Text fields retain their native keys. Dialogs/palette are outside canvas shortcut scope.
- One completed drag or node-and-edges deletion is one history step. Consecutive edits to the same name/property coalesce within1500ms; history is capped at60 input snapshots.
- Saves retain history. Undoing a saved change becomes a new edit and saves using the current revision; revisions and run identities are never undone.
- New edits after Undo clear Redo. Pan, zoom, selection and validation do not enter history.
- Reloading a confirmed server version, adopting another tab's clean remote edit, or deliberately rebasing after conflict starts a new history boundary. Reapply keeps the local graph but clears old undo/redo.
- History is memory-only per user/design above system-screen replacement. Same-account session reauthentication retains it; explicit logout/account switch disposes it even if remote logout fails. Browser reload/tab close loses unsaved work and local history; existing navigation/unload guards warn where supported.

## Implementation

- WEB/src/lib/canvas/commands.ts: immutable connect/reverse/delete/duplicate commands and existing graph limits.
- WEB/src/lib/editor-history.ts: bounded local input history with grouping.
- WEB/src/lib/editor-session.ts: integrates history with serialized save acknowledgements, check/save barrier, validation identity, conflict recovery and disposal.
- WEB/src/components/canvas/: visible ports, temporary arrows, edge hit targets/selection, connection controls and validation repair panel.
- Existing POST /v1/designs/:id/validate remains the authority. No endpoint, schema, database migration, simulation-engine behaviour or runtime dependency changed.

Save at gesture completion, never on pointer frames. Cancel/focus loss/lost capture discard incomplete gestures. Existing unsaved/saving/conflict/failed states remain visible. Slow save replies preserve newer edits and undo; dirty graphs survive failed writes. History never replaces ownership/authentication or database revisions.

## Verification and safe test setup

Run the existing frontend test/typecheck/lint/build/check:routes scripts and backend build/typecheck/lint:check/test/test:e2e. Backend e2e truncates its test tables: use a dedicated disposable DB_TEST_DATABASE, never the normal database.

New focused tests: WEB/tests/m6.test.cjs and WEB/tests/browser/m6.spec.ts. Browser coverage includes blank-to-run, cycle repair, warnings, zoomed port dragging/click connections, duplicate/delete/undo, typed-input shortcuts,429 recovery, slow-save undo and deliberate conflict reapply. Earlier Foundation/M3/M4/M5 suites remain regression gates.

For isolated browser acceptance use STRESSFORGE_AUDIT_BUILD=1, NEXT_PUBLIC_API_URL=http://localhost:5003/v1 and web3003. Set SF_WEB_URL=http://localhost:3003, SF_API_URL=http://localhost:5003/v1 and an installed SF_BROWSER_CHANNEL. Production deliberately omits four @dev state cases; run them separately against an isolated dev server with SF_DEV_STATES=1. Never export auth traces/storage state.

Explicit opt-in: SF_M6_REAL_OUTAGES=1 node tests/verify-m6-services.cjs stops/starts only containers labelled stressforge.audit=m6, named stressforge-m6-postgres and stressforge-m6-redis, with ports5549/6396. Audit API must use their separate sf_m6_audit database. Labels/ports are checked and services restart in finally. The harness verifies retained connections/history and undo after actual database/Redis interruptions. It is not part of normal pnpm test and must never target normal services.

## Boundaries and maintenance

M7 full Traffic/Results and M8 live load overlays/preview/Limits remain unfinished. M6 adds no real AI, server version history, persistent offline recovery, collaboration or automatic graph fixing. Local model limitations and earlier dependency follow-ups remain.

Future milestone work must update the same progress report, preserve earlier history, add observed verification evidence and reassess touched earlier requirements. No automatic update or synchronization is promised.
