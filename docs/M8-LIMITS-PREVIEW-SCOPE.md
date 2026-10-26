# M8 — Limits, live preview and canvas load overlay

**Date:** 2026-10-26 (Asia/Dhaka). **Status:** PROPOSED — awaiting user approval. Planning only; M8 implementation has not started. M7 is complete locally; Phase2 remains in progress and still requires M8 and M9.

## Goal and user journey

Help a user see where the architecture is under pressure while editing, then deliberately calculate the traffic range where it first misses its targets.

**Open design → enable Load → edit traffic/components → inspect an unsaved model preview → find limits → inspect the saved failure threshold → improve the design → calculate again.**

All numbers remain mathematical estimates. No infrastructure load generation, AI call, paid service or wall-clock traffic test is introduced.

## Confirmed starting point

- M7 supplies Traffic settings, input history/autosave, detailed stored simulation Results, chart primitives, snapshot provenance and recovery checks.
- The pure backend calculation adapter already supports simulation, limits and preview. Limits result schemas distinguish found, failsAtMinimumLoad and notReachedWithinRange.
- RunsService already accepts simulation/limits as internal kinds and persists immutable records with kind/revision/request-id matching. The mounted controller currently exposes simulation submission, not Limits submission.
- SimulationExecutor already implements durable/preview priorities, cancellation signals, owner/editor-session/sequence handling, bounded bookkeeping and deadlines. Existing constants are one worker, four waiting jobs/reservations, durable5000ms, preview2000ms,128 preview entries and30-second preview bookkeeping TTL. These are inspected implementation values, not new performance promises.
- Frozen Phase2 contracts already describe preview request/response. Preview includes an editor-session UUID, increasing sequence, graph/traffic snapshot, fingerprint and engine version. The mounted preview HTTP endpoint and corresponding client UI are missing.
- Current saved run summaries contain kind, but the frontend has a single run/intention path. Limits and simulations must become kind-aware end to end; a Limits result must not accidentally replace or reopen as a simulation result.

Sources: PHASE-2-PLAN.md sections5–9; M7-TRAFFIC-RESULTS.md and progress-report section19; backend common/contracts/phase2/{api,result}.schema.ts; simulation/{simulation.service,engine/compute,engine/limits,worker/simulation-executor}.ts; designs/{designs.controller,designs.service,runs.service}.ts; prototype canvas/LiveBar and Sections15–16. Reuse the original prototype and numerical reference; do not redesign them.

## A. Limits API and calculation lifecycle — required

Mount authenticated POST /v1/designs/:id/limits using the existing durable RunsService pipeline and run request contract. Reuse GET /v1/designs/:id/runs/:runId for polling/reopening. New/pending acceptance returns202; an idempotent retained terminal retry returns200, following the existing simulation protocol.

Before submission: validate fields, serialize/flush all current edits and capture the acknowledged saved revision. Preserve the request UUID, operation kind and expected revision when acceptance is uncertain. Retrying must recover that same calculation; a known failed job needs a deliberate new request id. Enforce the existing24-hour retry guarantee and shared per-owner durable-work limit.

Run test and Find limits share admission safeguards. Neither cancels an accepted durable calculation. Navigation/disconnection stops browser polling but does not cancel accepted durable work. Deletion and interrupted-job recovery retain the established server semantics.

Ownership checks must cover submission, polling, request-key retries and run/design matching. Regenerate the mounted Swagger/API types; keep stable response envelopes/error codes. No new migration, runtime dependency or environment setting is expected. Inspect before deciding details; document any necessary contract change.

## B. Limits tab — required

Port the prototype's breaking-point cards, ramp chart, target lines, saturation-order presentation and edit links using recorded backend output.

Show the cause (latency/errors/both), relevant component when identified, headroom when defined, and input revision/fingerprint/engine/time. Show p95/p99 and error curves with separate labelled axes, current average load and searched threshold markers. An expandable data table is the keyboard/readable chart alternative. Display tested bounds and search precision/iterations; do not imply an exact physical capacity.

| Backend state | Required wording/behavior |
| --- | --- |
| found | Show the last tested passing load and first tested failing load as a bracket; any rounded estimate retains the visible bracket |
| failsAtMinimumLoad | State that the design already misses targets at the minimum tested1rps, and the threshold below that is unknown; do not claim zero capacity or failure at every positive load |
| notReachedWithinRange | State that failure was not found up to the returned maximum tested load; do not claim never fails or infinite capacity |

The engine currently caps search at10-million-rps and24 refinement iterations; the actual returned tested range remains authoritative. Average-rate threshold and burst peak must be distinguished. Zero current traffic must not produce an invented finite headroom multiplier; use an explicit undefined/not-applicable presentation consistent with the result contract.

Label the order **predicted saturation under unshed demand**. This is not a chronological failure trace. Latency/error targets may fail before a component reaches100%, and cross-region delay may be the limiting cause. Keep pending/failed/empty/stale/pressure/retry states truthful; no fake progress percentage or replay animation presented as ongoing computation.

## C. Live preview — required

Mount authenticated POST /v1/simulation/preview using the frozen bounded snapshot/session/sequence contract. Compute with the existing worker; no browser numerical engine and no database run row. Preview never changes saved results, retained-run counts or dashboard history.

Recommended client defaults, subject to approval:

- Live preview is off initially and enabled by the explicit Load control on Edit. Keep this preference in memory for that user/design; no new persistent storage. On Traffic, offer an explicit live-preview control while preserving M7's clearly labelled recorded chart. Results and Limits stay snapshot-based.
- Debounce valid semantic edits by750ms. Rate, burst, read share, targets, shape, duration, region and component/edge changes affect the model. Pan/zoom/selection, design-name changes and coordinate-only movement do not trigger preview.
- Hold at most one current request per editor session. Abort a superseded request, increment sequence, and accept a reply only if account, design, editor-session, sequence and semantic fingerprint still match. A backend-computed fingerprint may be compared against an equivalent deterministic client identity; do not introduce another numerical engine or change fingerprint ordering.
- Pause while a field is invalid, a pointer gesture is unfinished, a save conflict is unresolved or an explicit durable calculation is pending. After recovery/completion, request only the latest valid inputs if preview remains enabled.
- Stop/cancel on disable, navigation away from preview-enabled views, logout/account switch, disposal and request disconnect. Same-account reauthentication retains the draft but resumes with a fresh valid preview identity.
- Preview pressure429, timeout or complexity failure stays inline with an explicit retry; no tight automatic retry loop. Supersession/cancellation is neutral UI state, not an internal-server-error alert. Freeze the cancellation HTTP handling in the first contract step so it fits existing response/error conventions.

Preview does not require a successful save; it can describe valid in-memory unsaved inputs. Autosave remains a separate750ms workflow. Keep **Live preview — unsaved inputs** distinct from **Recorded run — revision N**. Old output can remain visibly stale, but cannot be painted as current or attached to changed nodes/edges.

Traffic's live summary can show p95/errors/bottleneck from the preview. Its existing timeline stays explicitly the recorded run's illustrative samples: the preview contract currently returns a summary, not a newly calculated timeline. No hidden extra simulation request is justified just to animate that chart.

## D. Canvas overlay and topology — required

- Port the Load button and L shortcut, respecting input fields/dialogs. A clear legend and text states accompany semantic colours: idle, healthy below75%, strained75–under100%, failing at/above100%.
- On Edit, render current preview utilization, bottleneck and modeled edge-flow emphasis over the existing SVG canvas. Values above100% remain numeric even if meters clamp visually. Distinguish background drops/queues from foreground request errors.
- Port the bottom traffic control using the same EditorSession traffic settings/history/autosave as the Traffic tab. It is a real draft edit, not a separate hidden traffic value; no request on every slider event or pointer frame.
- Overlay toggles, selection and pan/zoom are view-only: no save, revision increment or undo step. New/deleted components and changing edges must never inherit mismatched old metrics.
- Add the prototype's read-only Topology under load to Results. It uses that selected run's saved graph and metrics, even if the current draft differs. Selection reveals the corresponding recorded metrics; Edit links target the current node only when applicable.
- Preserve existing arrows, hit targets, connection gestures, keyboard operations and minimap. Emphasized flow is a model visualization, not observed packets. Respect reduced-motion preferences and avoid animation as a correctness requirement.

## E. Scheduling, reliability and cross-tab integration — required

Recheck the existing worker through the new HTTP boundary: Run/Find limits preempt a running preview and evict queued preview work when required; genuine durable pressure still returns429. Preview must never preempt accepted durable work. Deadlines include queue wait; timeout/crash must release capacity and allow recovery. Keep bookkeeping bounded/expiring and owner-scoped under multiple tabs.

Client abort/disconnect must cancel only preview work. Confirm transport event wiring does not mistake normal request-body completion for an aborted request. Server shutdown/restart, database finalization failure, deletion, queued expiry and retention must retain the established durable-job guarantees.

Keep distinct selected simulation and Limits identities/intents. Route and dashboard links use stored kind, and summaries label which calculation they describe. A lost Limits response cannot be retried as Run test, and an old preview cannot overwrite either saved result. Preserve the latest available simulation selection when visiting Limits without pretending its output came from the new calculation. Do not add a general History feature to solve selection.

## Implementation sequence

| Step | Deliverable | Exit check |
| --- | --- | --- |
| M8.1 Contracts and HTTP | Inspect current code/instructions; mount Limits/preview; settle cancellation responses and kind-aware intents; regenerate types | Auth/ownership, invalid input, accepted retry, preview bounds/cancellation; no persisted preview rows |
| M8.2 Saved Limits | Complete Limits UI, charts, search states, stale/reopen and kind-aware dashboard links | Each search state and zero-load headroom verified; real saved calculation survives reload |
| M8.3 Preview lifecycle | Debounce, cancellation, sequence/fingerprint/account checks, inline failures | Rapid edits/two tabs/out-of-order replies stay correct; durable work wins |
| M8.4 Overlay | Edit Load/traffic controls and snapshot-based Results topology | Correct component/edge metrics; existing editing remains usable at50nodes/200edges |
| M8.5 Integration/report | Run scoped and earlier regression gates, real outages and source comparison; update the same living report | Evidence-backed M8 verdict, preserved earlier history and explicit M9 remainder |

These are internal implementation checkpoints under one M8 scope, not separate feature approvals or a claim of work already completed.

## Test and acceptance matrix

1. **Numerical/contract:** six reference templates; found/minimum-load/search-cap results; bracket validity, headroom/zero traffic, cause, burst versus average, finite/unbounded values and saturation-order labels. Keep numerical parity; any demonstrated defect fix needs documented expected-result changes.
2. **API/security:** unauthenticated401, foreign design handling, run/design ownership, owner isolation for preview sequences, malformed/oversized/complex graphs, UUID/sequence boundaries, generated-type equality and unchanged envelopes.
3. **Durable jobs:** same-key retry, changed-kind/revision409, lost-response recovery, real failed-job retry, pending limits across navigation/reload, save races, two-tab409, deletion, startup reconciliation and retained-key guarantees.
4. **Preview lifecycle:** rapid changes/slider bursts produce bounded requests; newer sequences win; late responses/abort/reopen/disposal/account switch cannot restore obsolete metrics; no DB rows or history/count pollution; layout changes produce no calculations.
5. **Worker integration:** running preview plus full preview queue when Run/Limits arrives; one-owner durable pressure; real worker timeout/crash, queue expiry, abort cleanup, resource bounds and responsive health. Existing unit evidence alone does not establish HTTP disconnect behavior.
6. **UI/results:** all Limits states; live versus recorded labels; separate simulation/limits links/intents; staleness; invalid graph repair; loading/failure/retry; zero/high utilization; queues/background calls; selected old snapshot after current-node deletion.
7. **Editor/accessibility:** overlay/traffic control preserve drag/connect/reverse/delete/undo/redo and selection at different zooms; L shortcut respects text inputs; legend/numeric equivalents, labelled controls, keyboard charts/tables, focus and reduced motion.
8. **Real recovery/regression:** isolated PostgreSQL, Redis and API interruptions; session expiry/re-login/logout; builds/types/lint/unit/e2e plus Foundation and M3–M7 browser regressions. Test1440/1024 light/dark and a second Chromium browser. Record failed attempts, corrections, actual commands and any untested browsers/accessibility/soak limits.

## Definition of done

From an owned saved design, a user can enable Load, edit traffic/components and receive a clearly labelled current model preview without freezing editing. Find limits saves the latest valid inputs and produces a persistent, honestly bounded result that reopens correctly. Improving the design can change its preview and recalculated limit. Simulations, Limits and previews retain separate identities. Failure/pressure/session/deletion/restart tests preserve draft data and job guarantees. All required checks pass or mandatory work remains explicitly incomplete in the living report.

Update STRESSFORGE-PROGRESS-REPORT.md with a requirement mapping, observed evidence, initial failures/fixes, earlier-phase reassessment and remaining limitations; preserve earlier history. Nothing updates automatically. M8 completion still leaves M9 final integration acceptance. No automatic GitHub push, merge, production deployment or M9 implementation is authorized by this planning document.

## Out of scope

Real AI generation/fixes, new palette component types, model-formula redesign/calibration, real load generation, version-history/Compare/Report/export, collaboration/public sharing, offline persistence, distributed workers, new paid services and a replacement design system. M9 remains a separate milestone; existing model assumptions and dependency advisories must remain visible.

## Planning review and recommendation

The scope closes the remaining major Phase2 product features using existing foundations. The hard part is coordinating ephemeral preview work with reliable saved calculations and current editing identities. Begin with Limits and kind-aware navigation, then add preview, then overlay; preserve the tested M7 Results view throughout. Sequence admission, cancellation and identity safeguards before visual integration. Approve this scope before any M8 application implementation starts.
