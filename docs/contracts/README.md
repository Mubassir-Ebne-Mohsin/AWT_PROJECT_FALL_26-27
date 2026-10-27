# Phase 2 contracts — M1

Approved scope: M0–M1 on 2026-10-24. These files prepare future implementation; no designs, simulation, preview or dashboard endpoint is mounted by M1.

## Authority and generation

The backend's src/common/contracts/phase2 Zod schemas are the single source for payload shapes and runtime cross-field validation. openapi.ts describes HTTP operations and exports their schemas without registering controllers. Generated phase2.openapi.json is OpenAPI 3.1; web/src/lib/api/phase2-schema.d.ts is generated with the existing pinned openapi-typescript. They describe planned operations. The existing schema.d.ts and pnpm gen:api continue to describe the actual running Phase 1 API.

From the backend, using Node 22 and its pinned pnpm:

~~~powershell
pnpm contract:phase2
pnpm contract:phase2:check
pnpm fixtures:phase2
pnpm exec jest --runInBand --runTestsByPath src/common/contracts/phase2/contracts.spec.ts
~~~

From web:

~~~powershell
pnpm gen:phase2
~~~

[examples.json](examples.json) contains schema-validated source-derived payloads for catalog/templates, create/read/list/save, validation, run acceptance/polling/completion/failure, Limits, preview, dashboard and conflict details. These are documentation examples, not observed Phase 2 HTTP responses.

Error example: {"error":{"code":"CONFLICT","message":"Design changed since it was loaded","details":{"reason":"REVISION_MISMATCH","currentRevision":2}}}. Malformed input uses422 VALIDATION_FAILED with fields/path messages; missing/expired session401, foreign design403, absent design404, admission pressure429 and temporary compute/service failure503 preserve the Foundation error envelope.

Run node docs/contracts/capture-reference.cjs from the root only when deliberately refreshing oracle fixtures; --check verifies them without writing. This requires installed backend dependencies. Inspect changes before committing. No network/provider is used. M3 must derive DTOs from these schemas, compare mounted OpenAPI operations against this contract, and regenerate the normal API types. Planned types must not be substituted for evidence that a route works.

Zod refinements (unique ids, valid references, source/template consistency, nonempty PATCH, run/result identity and interval relationships) cannot all be expressed by generated JSON Schema. Runtime validation and focused tests remain required; a generated TypeScript type alone does not prove valid input.

## Frozen input rules

- Stored snapshot: schemaVersion:1, graph:{nodes,edges}, complete traffic. Stored nodes require id/type/label/x/y/props; edges require id/from/to. Twelve types and three source regions only. No owner/role/id/timestamps in create/patch payloads.
- IDs: 1–64 ASCII characters, initial letter, then letters/digits/_/-. Reject Object.prototype property names, duplicate ids across nodes/edges, duplicate directed connections, self and dangling edges.
- Safe drafts may be empty, disconnected or cyclic. Semantic runnable validation is separate and blocks calculation rather than saving.
- Props are type-specific and optional within a required props object: Clients region/share only; CDN replicas/capacity/latency/hitRatio; ordinary components replicas/capacity/latency/region; cache adds hitRatio; queue adds maxDepth; storage/external add share. Omitted properties retain source effective defaults; do not inject all catalog defaults into source-seed input.
- Bounds: 50 nodes, 200 edges, 64 KiB raw UTF-8 import, labels 1–80, names 1–100, description <=2000, |coordinates|<=100000, replicas integer1–200. Preserve the prototype's 200 maximum; the proposed 100 was corrected after SECTION 14 inspection.
- Capacity >0..1e9; latency0..60000ms; ratios0..1; queue depth integer1..1e9; Clients share0..1e6. All numbers finite.
- Traffic: source preset/shape enums; rps0..1e7, burst1..100, readRatio/errorBudget0..1, sloP95 1..60000ms, durationMin1..1440. These are API safety bounds, not changes to the prototype's narrower controls.
- Imports use a flat nodes/edges/traffic document: explicit schemaVersion:1 or versionless legacy input. Unknown declared versions and unknown fields/properties fail. Missing edges means []; node labels/props/coordinates and edge ids may be absent. M2/M4 must fill source defaults, collision-free ids and deterministic layout before validating a stored snapshot. Explicit invalid positions fail rather than being replaced. Import ownership/history/server fields are never accepted. Re-export format is the flat version-one import document, not a database record.
- Stored source is blank/template/import/scripted. templateId must be one of the six ids only for template source, otherwise null. All creation paths submit the same validated snapshot shape; no hidden real AI operation.

## Identity, saving and errors

PATCH includes expectedRevision and at least one editable field. Server revision increments atomically. A stale save returns 409 CONFLICT with details:{reason:"REVISION_MISMATCH",currentRevision:N}. A run key reused with another kind/revision returns details:{reason:"REQUEST_ID_REUSED"}. Details expose no foreign design data.

The actual Phase 1 filter/OpenAPI/client gain CONFLICT/409 in M1. It stays inline, preserves credentials and never opens an unrelated system screen. Existing error codes/envelopes remain.

Fingerprint is lowercase SHA256 of normalized schemaVersion, engineVersion, traffic, and source-ordered semantic node/edge arrays. It excludes x/y/edge ids and presentation state, includes labels/properties and excludes design name/description. Object keys are canonicalized; array order is preserved. Schema parsing normalizes property key order before the source/port are evaluated so identical identity cannot produce different seeded timelines merely from JSON key insertion order. Explicit versus omitted defaults remain distinct. Never hash user-supplied arbitrary objects before schema validation.

Run submission: expectedRevision + UUID requestId. Identity is designId/requestId with original kind/revision; authorize before lookup. Retained matching retries return the same run before current-revision/capacity checks. Concurrent same-key requests coalesce until commit; database uniqueness remains final authority. New intent/new deliberate failed-job retry gets a new UUID; a lost response retries the original UUID. HTTP202 is new/pending, HTTP200 retained terminal replay; statusUrl is the relative /v1/designs/{id}/runs/{runId}. Preserve uncertainty after 24h rather than automatically submitting a new key.

Run pending/completed/failed records include immutable snapshot, revision, fingerprint, engineVersion and timestamps. Pending has null result/failure/completedAt; completed has matching-kind result and completedAt; failed has safe failure/completedAt and null result. M3 supplies atomic persistence/scheduling; M1 schemas do not implement it.

Existing foreign design UUID returns403, absent404 (intentional existence disclosure matching prototype); no owner/name/graph detail. DELETE returns204 without envelope. Other successes use {data}; listing uses {data,meta:{page,pageSize,total}}, defaults1/20, maximum pageSize50. Dashboard arrays bounded10 each; counts explicitly describe the retained window. General designs/library pages remain later-phase placeholders.

## Result and Limits wire rules

Metrics retain source field names/units (latency milliseconds, lag seconds, throughput requests/second, fractional errors/utilization). The API removes redundant source byId, replaces a duplicated bottleneck object with bottleneckId, and emits flows as bounded from/to/rps arrays. Source validation msg/fix/level map to message/repair/severity; optional named-path seq is replaced by steps.

Infinity is never JSON null: permitted unbounded capacity/saturation/queue-lag values use {kind:"unbounded"}; finite ones use {kind:"finite",value:N}. Unexpected NaN/-Infinity is a computation failure.

One source exception was observed during full oracle capture: Clients servers is NaN (Infinity capacity multiplied by zero service time). Clients have no service pool: API servers:null is explicitly not applicable; all other node types require a finite positive integer. Do not change source files or silently make all NaNs null. This and the source Limits floor correction are mandatory M2 parity exceptions.

Limits states:
- found: passingRps/failingRps bracket the threshold, with at at failingRps.
- failsAtMinimumLoad: minimumTestedRps:1 and lowerThreshold:"unknown"; it does not claim zero capacity. Headroom is unknown/null.
- notReachedWithinRange: no observed failure up to maximumTestedRps; headroom is a lower bound (or null at zero current load), never proof of infinite capacity.

All states expose tested range/search iterations; 24 binary-search iterations maximum, 45 curve points. M2 still profiles/freezes expansion and runtime budgets before implementing them. Source ramp samples outside the chosen M2 search range must be bounded/rejected honestly, not silently represented as fully tested coverage.

Simulation includes up to6 named paths and48 timeline points labelled "illustrative sampled timeline". Limits order is labelled "predicted saturation under unshed demand". Calculations are approximate model outputs, not infrastructure measurements.

Preview carries editorSessionId/monotonic sequence/full bounded snapshot; response echoes identity and fingerprint/version with validation and nullable summary. Invalid runnable graphs return useful validation; malformed input422. Superseded/canceled/pressure failures remain inline. Preview persistence, cancel/priority scheduling and editor behavior are later milestones, not M1 claims.

## Reference evidence and tolerances

reference-fixtures.json contains six full-precision source input/output sets: validation, simulation, paths, Limits and seeded timeline, plus the 0.1rps-pass/1rps-fail counterexample. Provenance hashes the unmodified engine and exact template section after LF line-ending normalization (stable across Windows checkouts); source Infinity/NaN are tagged as {$number:"Infinity"} / {$number:"NaN"} for evidence only. These oracle tags are not API values.

Both oracle and future port receive the same schema-normalized inputs. Compare all finite numeric fields using |actual-expected| <=1e-6 +1e-6*|expected|; statuses/ids/issues/order/labels exact. Record justification for any widening. Source defects are retained, with explicit expected wire exceptions above. This establishes a regression oracle, not successful TypeScript-port parity, worker performance or real calibration.

## Maintenance

Change canonical schemas first; regenerate OpenAPI/types; inspect diffs; update fixtures only intentionally; test runtime refinements and caller behavior. Update docs/PHASE-2-PLAN.md and the same docs/STRESSFORGE-PROGRESS-REPORT.md at each milestone. Preserve earlier history, record actual commands/results and reassess affected Phase 1 requirements. Nothing updates automatically.

## M2 provider progress (2026-10-24)

The typed engine/wire adapter and controller-free worker module now implement these calculation shapes and pass source parity. See [model documentation](../SIMULATION-MODEL.md). All HTTP operations in phase2.openapi.json remain planned until M3; no schema shape or generated type changed in M2. Memory-only scheduling does not provide database idempotency/durability.

## M3 live subset (2026-10-24)

Owned design CRUD/validation/simulation/run polling, catalog/templates and dashboard are now mounted. Live /docs-json uses their canonical schemas with implemented operation markers and OpenAPI3.1; web schema.d.ts is regenerated from it. Preview and Limits HTTP operations remain planned/unmounted; phase2.openapi.json and phase2-schema.d.ts remain the full planned contract. See [M3 guide](../M3-SAVED-DESIGNS.md).


## Current mounted subset through M8 / M9 reassessment

The earlier M2/M3 paragraphs are historical. Prepare, saved Limits and transient Preview are now mounted alongside the Designs/simulation operations. Live docs-json generation exactly matches web/src/lib/api/schema.d.ts in M9; canonical contract/fixture checks pass. M9 reliability fixes change deadlines/availability handling and refresh operation ordering, not public DTO shapes or model formulas. See [M9 guide](../M9-ACCEPTANCE.md) and report section21 for final acceptance status.
