# STRESSFORGE — refined Phase 2 plan

**Revised:** 2026-10-24 (Asia/Dhaka). **Status:** user approved starting M0–M1 on 2026-10-24; M2 subsequently approved and completed on 2026-10-24; next checkpoint before M3. This document supersedes the original draft, preserved in [the archive](archive/PHASE-2-PLAN-2026-10-22.md). Recommended defaults below are planning decisions, not invented user approvals or verified implementations.

## 1. Target and recommendation

Build the first real end-to-end loop before completing every editor interaction:

**Login → create the MVP template → change app replicas → save → run the backend model → show p95/errors/bottleneck → reload and recover the saved design/result.**

A minimal graph renderer/property form is sufficient for this intermediate milestone. It is not Phase 2 completion. Then finish the interactive canvas, creation flows, Traffic, Results, Limits and resilient editing.

At completion a user can draw/configure an architecture, save/reopen it, set traffic, inspect predicted bottlenecks/limits, manually improve the design and run again. Results are mathematical estimates, not measurements obtained by sending traffic to real infrastructure.

## 2. Confirmed baseline and sources

- [Progress report](STRESSFORGE-PROGRESS-REPORT.md), section 9: Phase 1 locally completed; functional findings fixed and two transitive production advisories triaged. Reuse its recorded evidence, not earlier claims that Phase 1 remained partial.
- Historical 2026-10-23 baseline: HEAD eb8c39b was report-only. On 2026-10-24, M0 reviewed/reverified and published the actual Phase 1 remediation code/tests as 9e8bb00 to origin/main; the earlier publication gap is closed.
- [Phase 1 specification](../nest-boilerplate/nest-boilerplate/docs/stressforge/PHASE-1-PROMPT.md) and [architecture](ARCHITECTURE.md): preserve the nested Nest backend, sibling Next frontend, Node 22/pnpm, local PostgreSQL/Redis, auth, errors and generated API types.
- [Prototype](../nest-boilerplate/nest-boilerplate/docs/stressforge/reference/architecture-stress-test.html): SECTION 3 templates, 4 store/undo, 5 routes, 10 dashboard, 11 creation, 12–14 workspace/canvas, 15–16 charts and analytical tabs. Read selected sections, not the whole file at once.
- [Reference engine](../nest-boilerplate/nest-boilerplate/docs/stressforge/reference/mock-engine.js): twelve component types; validation, routing, simulate/paths/limits/timeline and scripted helpers. Keep reference files unchanged. Serializable graph/traffic schemas and validation/simulation services should be reusable by a future AiModule; do not build its provider integration now.
- web/src/lib/routes.ts and catalog.ts define existing destinations/tab phases. [Frontend tests](../web/tests/README.md) already provide Node/jsdom and Playwright coverage; strict backend test typing also exists. Extend them rather than rebuilding test infrastructure.

The central-AI course requirement remains a later essential obligation. No real AI provider or free-hosting guarantee is selected here. Reserve time for that phase; scripted output does not satisfy the requirement.

## 3. Scope

| Required Phase 2 work | Keep for later |
| --- | --- |
| Owned design CRUD and JSONB graph/traffic persistence | Public sharing, collaboration and permission management |
| Six exact prototype templates; blank and JSON creation | Public examples/template-library pages |
| Clearly labelled Scripted mock description flow | Real AI generation/explanation/apply-fix loop and AI quotas |
| All twelve types; SVG canvas, properties, edges, zoom/pan/fit, undo/redo, validation and load overlay | Diagram-library redesign and a replacement design system |
| Traffic, Results, Limits and simple SVG charts | History/Compare/Report/Notes features and PDF export |
| Minimal immutable run snapshots; real dashboard/latest/recent summaries | General version-history and restore |
| Bounded local computation and transient preview | Distributed workers, WebSockets, hosted compute and infrastructure load generation |

No new frontend URL is needed. /new/template is the Phase 2 picker; /templates remains the Phase 4 library placeholder. Dashboard discovers owned designs; standalone /designs stays Phase 3. Edit/Traffic/Results/Limits become functional; other workspace tabs and report/share remain honest future-phase placeholders.

Scripted description creation may produce an ordinary validated design, but must be labelled before submission, use no model, and consume no AI quota.

## 4. Decisions and architecture

| Topic | Recommended default |
| --- | --- |
| Numerical authority | One pure TypeScript backend engine. Browser renders outputs and performs only inexpensive structural checks |
| Rendering/state | Existing React/TanStack Query; SVG; focused editor reducer/context. No new runtime chart/diagram/state package without demonstrated need |
| Persistence | PostgreSQL designs and run snapshots; Redis keeps Phase 1 session/rate-limit duties. No result-cache prerequisite |
| Compute | One worker_threads worker with bounded scheduling/deadlines; no new Bull queue or distributed architecture |
| Explicit Run/Limits | Persist pending/completed/failed jobs; return 202 and poll; accepted work survives browser disconnect |
| Live preview | Ephemeral, latest-only, cancelable, lower priority than explicit work; no run-history row |
| Conflicts | Add CONFLICT/409 coherently to API/OpenAPI/client; recover inline while retaining draft |
| Ownership response | Preserve earlier prototype convention: absent UUID 404; existing foreign UUID 403, with no owner/name/graph disclosure. Explicitly acknowledge the resource-existence tradeoff |
| Local drafts | Memory-only above system-screen replacement, keyed by user/design; no silent IndexedDB/localStorage addition |
| Reference changes | Preserve behavior except documented correctness/wire exceptions; an earlier plan saying “approved” does not establish user approval |

Proposed Nest modules: DesignsModule and SimulationModule, using existing @/ aliases/conventions. Engine modules import no Nest/database/browser APIs. Worker adapter owns transport/resource bounds; services own authorization and persistence.

~~~mermaid
flowchart LR
  E[Editor + traffic] --> D[Authenticated Designs API]
  D --> P[(Postgres designs + runs)]
  D --> S[Simulation service / scheduler]
  V[Transient preview API] --> S
  S --> W[Bounded worker / pure engine]
  W --> S
  S --> P
  P --> R[Results / Limits / dashboard]
~~~

## 5. Data, validation and API contract

### Records

- **designs:** UUID id; server-owned ownerId FK; name/description; source kind/template reference; graph/traffic JSONB; schemaVersion; monotonic revision; timestamps.
- **design_runs:** UUID id; designId FK; kind simulation/limits; immutable input snapshot and design revision; fingerprint; engineVersion; requestId; status; result or safe failure; timestamps. Unique(designId,requestId).
- Explicit migrations, synchronize:false, owner/update/run-time indexes. Derive run ownership from its design. Never trust submitted owner/role.
- PATCH atomically checks owner + expectedRevision, updates allowlisted editable fields and increments revision. Stale save returns 409 with safe current-revision information; preserve local draft.
- Confirm deletion; remove owned design/dependent run rows transactionally. Late computation cannot recreate deleted data.

### Two validation levels

**Safe saved draft:** bounded shape, supported type/property/enum values, finite coordinates/numbers, unique safe IDs and valid edge references. Reject reserved object keys, duplicate directed edges, self-edges, dangling references and malformed imports.

Imports may omit coordinates, as in the prototype: apply the deterministic layout builder before validating the stored draft. Reject explicitly supplied non-finite/invalid positions. M1 defines versionless reference files as an explicit legacy import shape and rejects unsupported declared versions.

Empty, disconnected or cyclic drafts can be saved. **Runnable validation** separately rejects semantic errors (missing/unconnected Clients entry, incoming entry edges, cycles). Preserve reference warning/info classifications for orphans, queues without consumers and missing write targets unless reviewed.

A bad runnable graph blocks Run, not saving. Return structured issues with code/severity/message/repair/node IDs. Use Map/null-prototype lookups rather than trusting ordinary-object keys.

### Endpoints (all authenticated, with /v1 prefix)

| Endpoint | Purpose/status |
| --- | --- |
| GET /simulation/catalog; GET /templates | JSON-safe definitions/presets and six source templates; 200 |
| POST /designs | Safe blank/template/import/scripted draft; 201 |
| GET /designs | Paginated owner-only summaries; 200 |
| GET/PATCH/DELETE /designs/:id | Owned read/save/delete; 200/200/204; expectedRevision on PATCH |
| POST /designs/:id/validate | Saved revision's semantic report; 200; malformed requests remain 422 |
| POST /designs/:id/simulate; POST /designs/:id/limits | expectedRevision + UUID requestId; 202 new/pending, 200 retained terminal retry |
| GET /designs/:id/runs/:runId | Owner-checked status/snapshot/result; 200; run must belong to URL design |
| POST /simulation/preview | Unsaved bounded graph/traffic + editor-session UUID/sequence; no persistence |
| GET /dashboard | Bounded owned design/latest/recent summaries and labelled retained-window counts |

Preserve Phase 1 envelopes/codes; add only CONFLICT/409. Invalid request/submission 422; admission pressure 429; temporary service/compute failure 503. Validation/conflict/preview-pressure errors stay inline. Other errors follow existing system-state behavior. Regenerate API types whenever DTOs change.

### Reliable single-instance job protocol

1. Authorize ownership, then look up retained (designId,requestId) **before** current-revision/capacity checks. Same original kind/revision returns original run even if the design advanced; changed identity under the key is 409.
2. Coalesce concurrent same-key submissions inside the single API instance until the pending row is committed, with bounded/cleaned-up in-flight bookkeeping. Check kind/revision identity before coalescing. This prevents an identical retry from receiving 429 while its first submission has reserved capacity but is not yet visible in the database. For a new key, capture/validate the expected snapshot and reserve scheduler admission. Durable capacity cannot be consumed by queued previews: evict those previews/reserve durable admission before considering rejection, and preempt a running preview when appropriate. If durable capacity is genuinely full, recheck the key for a concurrent winner before 429.
3. Short transaction: recheck owner/revision and reservation validity and insert pending immutable inputs under the unique key. Return a matching uniqueness winner, release redundant provisional capacity, and enqueue only the insertion winner. No transaction remains open while computing.
4. Return 202/status URL. Browser retains requestId/kind/revision until acceptance is known; a network error or lost POST response retries that same identity, never a new UUID. A new UUID means new calculation intent or deliberate retry of a known failed job. Do not auto-retry unknown acceptance beyond the 24h guarantee; expose that uncertainty and require deliberate new calculation intent. Browser polls conservatively until terminal status; stops polling on navigation/logout. Disconnect does not cancel accepted durable work.
5. Finalize only a still-pending record. Timeout/crash becomes a safe failed record, never fabricated output. Failed-job Retry needs a new UUID. At startup mark interrupted pending work failed. Release capacity after all failures, including DB finalization failure, and reconcile orphaned pending records on recovery/restart.
6. Deletion cancels/drops queued/running work and late results. No multi-instance leases/distributed processing in this phase.

Proposed retention defaults: matching request keys guaranteed for 24h; never prune pending/younger accepted records; keep latest 50 terminal runs/design thereafter. Dashboard counts describe their retained window. The earlier 50-per-design/day and proposed 1000-per-owner/day quotas are removed: rely on existing request throttles, payload limits, per-owner pending limits, queue bounds and retention for this local prototype. Do not introduce rolling accounting that breaks when designs/runs are deleted. Profile storage growth; any additional storage/admission policy needs an explicit documented scope change, not a hidden AI quota.

## 6. Limits and numerical honesty

Starting guardrails below require fixture/profile confirmation; they are not measured performance promises. Reject invalid values rather than silently clamping them.

| Item | Proposed initial envelope |
| --- | --- |
| Graph/import | 50 nodes, 200 edges, 64KiB UTF-8 import; label 1–80/name 1–100 characters; finite coordinates absolute value <=100000 |
| Settings | replicas integer 1–200; finite capacity >0 to 1e9 rps; latency 0–60000ms; ratios 0–1; queue depth integer 1–1e9; client share 0–1e6 |
| Traffic | rps 0–1e7; burst 1–100; read/error shares 0–1; p95 target 1–60000ms; duration 1–1440 minutes; source shapes/presets/regions |
| Work | One worker; at most four waiting jobs/reservations; at most one accepted pending durable job/owner; bounded/expiring preview bookkeeping |
| Deadline | Proposed explicit calculation total 5s including queue wait; shorter preview deadline; terminate/replace CPU-bound worker on timeout |
| Expansion/output | Fixed sample/search budgets and explicit path-expansion cap; graph size alone does not bound exponential paths |

These are API safety envelopes, not replacement UI ranges. Preserve prototype controls/defaults (for example burst 1–4, duration choices 5/10/30/60 minutes and error-budget choices) unless a specific change is agreed. M1 freezes type-specific allowlists/limits against source fixtures and editable-control behavior; Clients capacity is explicitly unbounded in the catalog, never imported as Infinity. M2 profiles representative and worst-supported branching graphs, memory and health/event-loop responsiveness. Too-complex graphs produce structured issues, not silently truncated “accurate” results.

Numerical acceptance:
- Capture full-precision source/port results for six templates, exact issue/status fields and justified per-field tolerance. Initial finite tolerance proposal: absolute 1e-6 + relative 1e-6; widen only with recorded reason.
- Feed both oracles identical normalized inputs. Preserve source-visible array order/labels/properties for seeded timeline parity. Fingerprint covers those fields, normalized traffic and engineVersion, excluding x/y/view state. Do not silently sort arrays/change seeds.
- Explicit finite/unbounded wire states replace Infinity; unexpected NaN fails validation. Zero load must not break UI division/plots.
- Limits distinguish found, failsAtMinimumLoad and notReachedWithinRange, with tested interval/search cap/precision. The source's failure at 1rps does not prove zero capacity; expose minimumTestedRps=1 and unknown lower threshold.
- Queueing approximations/inferred server counts/saturation clamps/lognormal mixtures are not exact measured percentiles. Separate parity, narrow analytic sanity checks and future real calibration.
- timeline() samples independent loads with seeded jitter: label “illustrative sampled timeline.” Limits order is “predicted saturation under unshed demand,” not observed failure sequencing.
- Every result carries revision/fingerprint/engineVersion/tested traffic. Semantic edits immediately mark prior output stale; old responses cannot replace current identities.

## 7. Editor and save/recovery rules

Port the prototype's all-type palette and add/select/move/duplicate/delete operations, graph/properties/edges, zoom/pan/fit, keyboard alternatives, validation and overlay. Preserve edge reversal, nudging and the matching shortcuts from the source. Convert screen to world coordinates correctly at every zoom. Node + incident-edge deletion is one undoable action; coalesce drags and cap local undo history. Local undo is not server version history.

Draft reducer/context lives above AppShell's conditional system screen and is keyed by userId/designId. Refetch never overwrites a dirty draft. Preserve state through session-modal re-login, but **clear on local explicit logout/account switch even if server logout failed**, consistent with Phase 1.

Serialize saves, initially debounce 750ms, save a drag at gesture end. Keep submitted/saved baseline separate from edits made during an in-flight save. A response acknowledges only its submitted state; newer changes remain dirty and use the returned revision.

Run/Limits flush the current draft first and capture its successfully saved revision. Failed save blocks submission without discarding edits. On 409 retain draft, offer confirmed reload/discard or deliberate reapply after inspecting current server state; no automatic graph merge.

Show Unsaved/Saving/Saved/Failed truthfully. Guard dirty in-app navigation and use beforeunload where supported. Memory-only edits cannot survive tab closure/reload during a failed save: warn honestly. Persistent offline recovery is a separate explicit scope decision.

Preview debounces semantic edits, carries editor-session UUID + sequence/fingerprint, ignores stale responses and cancels on abort/disconnect/supersession. Bound server bookkeeping/TTL. Durable Run/Limits preempts preview; preview never cancels durable work. Pause previews during explicit jobs. Preview 429/complexity warnings stay inline; last output is stale, editing remains usable.

## 8. Milestones, dependencies and exit gates

Each milestone is a reviewable coding step; split further if its diff becomes too large. M0 was completed and published on 2026-10-24 (9e8bb00); M1 contracts/fixtures completed locally; see [contract guide](contracts/README.md) and progress report section 11. M2 engine/worker is complete; see [model/execution evidence](SIMULATION-MODEL.md) and report section12. M3–M9 remain Not started. M0 is baseline preparation, not new functionality.

| Step | Context/output | Exit evidence |
| --- | --- | --- |
| M0 Freeze foundation | Read report section 9/Git status/tests; preserve all dirty work; review and commit Phase 1 fixes/tests/docs logically. Publish the actual verified code through the user's chosen Git workflow before Phase 2 implementation | Baseline commit SHA and appropriate Phase 1 gates; accurately recorded remote scope. If publication explicitly deferred, record immutable local baseline; never claim GitHub is current |
| M1 Contracts/fixtures | Depends M0. Read catalog/validation/fixtures and existing errors; freeze schemas/bounds/versions/JSON/idempotency/fingerprints/tolerances; add 409 and generated types/tests | Sample request/response/error per flow; safe empty/cyclic draft cases; all six fixtures fit bounds; coherent API/client contract |
| M2 Engine/worker | Depends M1. Port pure functions/builders/wire adapter; bounded scheduler and interruption/profile tests | Six-template parity + documented exceptions; zero/burst/cache/replica/queue/region/path cases; deterministic output; timeout/crash leaves health responsive; watch and compiled runtime work |
| M3 First real slice | Depends M2. Migrate designs/runs; owned CRUD/revisions, reliable simulation lifecycle and minimum save safety (serialized writes, submitted-state acknowledgments, retained dirty drafts on errors/409, and Run save barrier); template-backed minimal renderer/property form, Results summary and reopen | Two-user/conflict/idempotency tests; first loop in section 1 works with real services; persisted input/result survives restart. No temporary unsafe synchronous API |
| M4 Creation/dashboard | Depends M3. Read prototype SECTION 10–11; blank/six templates/JSON/scripted describe; owned cards/recent runs and confirmed delete | Every creation path creates one valid owned draft or useful error; invalid import creates none; scripted mode explicit; dashboard uses saved summaries, no mass Limits calculations |
| M5 Canvas fundamentals | Depends M3. Read SECTION 12–14; all types, render/select/move/properties/zoom/pan/fit/keyboard alternatives | Zoomed coordinate/focus/save-reopen browser cases; no render/pointer-move request storm or overflow |
| M6 Edges/undo/save safety | Depends M5. Finish connection tools, deletion, undo/redo and section 7 lifecycle | Cyclic draft saves but Run blocks; grouped undo; slow-save/new edits/outage/401/409/re-login/logout/account switch/two-tab conflict preserve correct data |
| M7 Traffic/Results | Depends M2/M3/M6. Read SECTION 15–16; presets/settings, verdict/percentiles/errors/throughput/utilization/paths/timeline; bottleneck selects Edit node | Real traffic/replica changes produce server results; Run flushes save; loading/failure/stale/zero/unbounded states and snapshot reload tested |
| M8 Limits/preview | Depends M2/M6/M7. Limits job/curve/order/headroom and debounced live overlay; scheduler cancellation/priority | Search lower-bound/cap labels correct; Run outranks preview; canceled/late output ignored; pressure does not freeze editor; retry/restart/delete/retention cases pass |
| M9 Acceptance/docs | Depends M4/M8 and all prior gates. Extend existing tests; compare prototype; reassess Phase 1 and update same report | All section 9 evidence; no unresolved mandatory scope; actual outage/recovery; secret/diff review; honest final code/report publication SHAs |

M3 is the first usable checkpoint; M9 is completion. Do not postpone ownership, revision safety or run idempotency to the final audit. Do not recreate existing jsdom/Playwright/client test infrastructure.

~~~mermaid
flowchart LR
  M0 --> M1 --> M2 --> M3
  M3 --> M4
  M3 --> M5 --> M6 --> M7 --> M8
  M2 --> M7
  M2 --> M8
  M4 --> M9
  M8 --> M9
~~~

M4 and M5 may overlap after M3 with disjoint files; contracts/generated types/route registry/editor save state have one owner. Default model settings suit bounded work; independent review is valuable for math, security and worker/save races.

Each fresh coding session reads applicable instructions, this plan/current report and its milestone's prototype sections; inspects dirty work; implements only its agreed gate; records evidence. Revert scoped feature commits or keep unfinished entries as placeholders. Never reset unrelated work or run dropping migrations against user data; test rollback only on disposable databases.

## 9. Definition of done

| Area | Mandatory evidence |
| --- | --- |
| Contract/model | Six parity fixtures, justified tolerance, zero/burst/overload/region/cache/replica/queue, finite JSON, minimum-load/search-cap and branching bounds |
| Data/security | Fresh migrations, two users, all owned reads/writes/validation/run/poll checks; run belongs to URL design; reject injected owner/role; atomic revision races; immutable snapshots and retained-key retries after design change/full queue; accepted-but-response-lost retry reuses its UUID |
| Reliability | Real worker crash/timeout/queue expiry, responsive health, preview preemption/cancel (including a running preview plus full preview queue when Run arrives), DB finalize failure/recovery, deletion/startup reconciliation/retention |
| Editor | All required operations, zoomed drag, grouped undo, serialized saves and late responses, safe invalid drafts, failed-save navigation, session/account/two-tab transitions |
| User journey | Every creation path → edit/save/reopen → traffic → server results → limits → manually improve/rerun; persisted dashboard and honest stale output |
| Browser | 1440/~1024 x light/dark; keyboard/focus/reduced motion; prototype comparison; no unexpected console/overflow; retain Phase 1 auth/palette/help/state regressions |
| Real services | Postgres/Redis healthy; actual dependency/API outage and recovery; expired/revoked sessions. Distinguish real-service checks from existing fake-Redis suites |
| Reporting | Setup/architecture/schema/model-limit docs; same progress report with milestone evidence/history/Phase 1 reassessment; actual code/report publication scope |

Node 22, pinned pnpm versions:
- API: pnpm install --frozen-lockfile; pnpm build; pnpm typecheck; pnpm lint:check; pnpm test --runInBand; pnpm test:e2e on an explicitly isolated database.
- WEB: pnpm install --frozen-lockfile; pnpm gen:api against running API; pnpm typecheck; pnpm lint; pnpm test; pnpm check:routes; pnpm build; pnpm test:browser with documented audit services/browser.
- Add named engine/worker/editor commands only when those scripts exist. Never run truncating e2e against normal data or persist auth traces/tokens/secrets.

A milestone completes only with its evidence/report update. Phase 2 remains Partial if any mandatory flow or failure gate is missing. A polished canvas, model parity or M3 demo alone is insufficient.

## 10. Review, effort and decisions still to freeze

The scope suits the existing stack if staged. Largest engineering risks: editor/save lifecycle and worker/run lifecycle. Largest credibility risk: preserving model behavior without overstating its accuracy. Avoid replacing these risks with new libraries or distributed infrastructure.

| Earlier weakness | Refinement |
| --- | --- |
| Stale Phase 1 blockers/missing test setup | M0 acknowledges local completion/unpublished code; reuse existing tests |
| Large disconnected subsystems before a demo | Explicit M3 template/save/replicas/run/reopen loop |
| Planning decisions described as approved | Recommendations with rationale; no invented approval |
| History/AI/library scope expansion | Explicit route/tab boundaries and minimal snapshots only |
| Simplification could omit race safety | Safe local job protocol retained; no distributed platform |
| Additional daily quotas add accounting and deletion races | Defer daily quota; keep existing throttling, bounded scheduling/payloads and retention, then measure storage |
| Clearing only on confirmed server logout risks cross-account draft leak | Clear on local explicit logout/account switch |
| Vague limits/tolerances | Starting envelope plus fixture/profile gates; no unmeasured performance claim |

**Independent planning review (2026-10-23):** static review found six worthwhile amendments: move minimum save safety into M3, retain request identity after lost acceptance responses, make preview eviction happen before durable admission rejection, align the minimum p95 target with source normalization, preserve missing-coordinate import layout, and defer the unnecessary rolling daily quota. All six are incorporated. A local consistency pass also added same-key in-flight coalescing and preserved zero client-share inputs. This is a reviewed plan, not executed Phase 2 tests.

Initial allowance: **20–32 focused 2–4hour sessions** after the completed Phase 1 repair work. This is a planning judgment, not a date commitment. Re-estimate after M1 and M3. Keep buffers for editor/resilience and numerical interpretation, and preserve a later AI delivery window. If deadline forces reductions, agree explicit descoping and report Partial rather than silently weakening completion.

Freeze before dependent work:
- M0: reviewed baseline commit/publication workflow; preserve local work.
- M1: exact DTO allowlists/bounds, wire examples, tolerance, fingerprint and import/export version rules; idempotency identity.
- M2: measured path/time/memory budgets, shorter preview budget and worker/runtime testing.
- M3: DB failure/restart reconciliation and retention enforcement proof.
- M9: complete evidence, unresolved limits and later-AI capacity.

## 11. History and maintenance

Changes must state why, update dependent gates/tests and preserve earlier decisions. Every phase/milestone completion updates this plan and STRESSFORGE-PROGRESS-REPORT.md; nothing updates or synchronizes automatically.

- 2026-10-22: Original draft/review established draft-vs-run validation, worker priority, retained-key ordering and the 1rps counterexample. Full original retained in the archive.
- 2026-10-23: Refined after Phase 1 local completion and report-only publication; current baseline gate, test reuse, early slice, milestones, default envelope and logout semantics; independent-review amendments integrated. Planning only; no Phase 2 code or performance result.

Historical reference evidence (not rerun as Phase 2 verification): SHA256 e841b1afe3f2897cab9405d86bd4f735f977e5c0ce950ebbab7f621e54f7d78f; all six templates validated/simulated and twelve types present on 2026-10-22. Rounded p95ms: three-tier312.983/fail, content45.739/pass, ingest43.501/strained, checkout1572.243/fail, mvp43.143/pass, media60.175/pass. Capture full precision in M1.

Counterexample: Clients→App, capacity1rps/latency1ms/burst2/readRatio1/p95target300ms/errorBudget0.01 passes0.1rps (p95≈2.126ms) but fails1rps (errors≈0.50001); source findLimits returns0/floor=true. Keep this regression and expose only the tested lower bound.

- 2026-10-24: User approved M0–M1. Published Phase 1 remediation baseline 9e8bb00 to origin/main after fresh gates. M1 preserves the source replica control maximum of 200 (SECTION 14), correcting the proposed 100 limit. No engine implementation authorized at this checkpoint.

- 2026-10-24 M1: canonical schemas/OpenAPI/planned types, six normalized full-precision fixtures and counterexample, request/response examples, fingerprint/import contracts and CONFLICT integration verified. Source Clients servers NaN explicitly maps to not-applicable null; Limits floor/headroom semantics clarified. M2 not started; next approval checkpoint.

Archive formatting note: the original plan text is retained; three Markdown trailing-space hard breaks were normalized when committing the archive on 2026-10-24.

- 2026-10-24 M2 completed after explicit user approval: typed model/builders/wire adapter, six-fixture parity, bounded worker/admission, failure recovery and real-health/source/compiled/watch checks. Bounds frozen and limitations documented in SIMULATION-MODEL.md. M3 not started; await approval for the first usable design journey.
