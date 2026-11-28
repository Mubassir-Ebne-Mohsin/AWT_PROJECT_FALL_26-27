# Region Lab v1 — draft contract reference

Date2026-11-27. Read [scope](REGION-LAB-SCOPE.md) for mathematical semantics, support matrix and release gates. These files are documentation-only executable proposals. No current application module imports them.

## 1. Authority and versions

docs/region-lab/contract.cjs defines strict draft schemas using the repository's existing Zod dependency, plus cross-field semantic checks. docs/contracts/region-lab-v1.schema.json and region-lab-v1-run.schema.json are derived structural JSON Schemas (2020-12); refinements and resource/ownership checks are not expressible completely in generated JSON Schema. Implementations must apply both layers. Draft OpenAPI3.1 derives its schemas from the same source and labels every endpoint planned. Do not merge these drafts into phase2/phase3/current OpenAPI until the implementation stage.

schemaVersion=1 describes serialization. engineContract=region-lab-event-v1-draft describes proposed behavior. A real released engineVersion is assigned only when an implementation meets its tests. Changing request semantics or seed/event behavior requires a model version; adding support for currently rejected knobs requires a contract revision and migration/import policy. Never reinterpret a historical run using a later engine.

## 2. Scenario fields

| Field | Meaning |
| --- | --- |
| regions | Unique active abstract region identifiers;1–3 |
| profiles | Embedded immutable typed profile versions;1–36 |
| graph.nodes | Up to36 regional nodes; one client origin per region and one primary |
| graph.edges | Up to120 acyclic operation-scoped service edges |
| network | Exactly one directed link per ordered region pair, including local |
| workload | Global baseline, arrival model, schedule, regional shares and operation mix |
| routing | Exactly one route per origin/operation; explicit primary and fallback candidates |
| outage | Null or a declared application-deployment outage fitting the measured window |
| targets | Global request SLOs and optional regional overrides |
| runOptions | Baseline/outage/paired, unsigned32-bit seed and1–5 repetitions |

Distribution objects are constant(valueMs), exponential(meanMs), or lognormal(meanMs, coefficientOfVariation). All ms values are sampled elapsed service/propagation times, not percentiles. Mean and CV parameterization must be converted explicitly; geometric mean is not accepted as meanMs. Constant processing demand must be positive; zero propagation/hit/ack delay is allowed. Distribution tails are never clipped to the UI's stated mean bound: deadlines/budgets handle large draws, and out-of-range observed metrics fail explicitly rather than silently clamp. The selected HDR range covers successful root latencies up to the maximum root deadline; failed/late/background durations are separate diagnostics.

shareBps: integer basis points,10000=100%. errorBudgetRatio: fraction,0.01=1%. baselineRps is requests/second before operation/regional allocation. Schedule multipliers are linearly interpolated with knots at0 and durationSeconds. UI percentage/millisecond displays are presentation conversions, not separate stored authorities.

Profiles: fixed service pools have serviceSlotsPerReplica and waitingCapacity; cache/CDN add hit parameters; DB has read/write service distributions; replica has apply time; queue has bounded depth/ack/overflow/redelivery; storage adds aggregate bandwidth; gateway/external add token-bucket admission. Service slots are request execution concurrency. Local token buckets start full, refill at rateLimitRps up to rateLimitBurstRequests, consume one token per admitted call and reject immediately when empty. Queues have one logical buffer; worker pooling is explicit. Network bandwidth sharing and storage bandwidth both constrain different links/resources and must not be applied twice to the same resource.

profileId+profileVersion resolves one matching component type. Custom profiles are user assumptions. For reference/measured profiles the server resolves against the registry and rejects a modified payload or unknown version; a client-supplied origin=measured does not establish trust. The final immutable resolved snapshot includes the full profile, registry digest, evidence provenance and engine version. Pure contract checks cannot verify registry authenticity or ownership; those are server checks.

## 3. Validation layers

Layer1: strict JSON, bounded finite numbers, discriminated component/profile types, legal units and no unknown fields. Layer2: unique identifiers, complete matrices, matching profile types, normalized allocations, acyclic graphs, operation dispatch weights, data paths, safe retries, valid outage targets and deadlines. Layer3 at implementation: operator profile authenticity, ownership/revisions, full semantic reachability/terminal legality, worker→queue ownership, replica write denial, asynchronous graph rules and resource-cost admission. Layer4 at worker: event/memory/time/result budgets and numerical invariants.

Stage1 checker verifies a documented subset of layer2. It is not an implemented API security/semantic validator. A structurally valid document may still be rejected at layers3/4. Unreachable/dead nodes, unused profiles and fallbacks without a surviving destination produce actionable warnings or errors according to the scope rules. A dead primary or unresolved data path is never repaired automatically.

Client nodes are origins, not graph dispatchers. Outgoing request edges from clients are rejected to prevent duplicate traffic generation; routing controls their entry. An app/cache may dispatch synchronous downstream work or enqueue asynchronously; direct async database calls are rejected. Reads can end at the primary or a read replica; writes only at the primary. Cache hits may finish early without invoking a miss path. A worker's synchronous job execution is separate from the acknowledged parent request and retains its own delivery attempt record.

## 4. Planned API

All paths below are under /v1/region-lab and require the existing bearer session. Every identifier lookup is owner-scoped. Read-only operator reference profiles may be shared; user experiments, embedded custom profiles and results are private.

| Method/path | Input | Result / semantics |
| --- | --- | --- |
| GET /profiles | Optional component filter, limit≤36 | Supported immutable reference/measured profiles; no owner data |
| GET /experiments | Opaque cursor, limit1–20 | Summary rows only, nextCursor; no per-card graph fetch |
| POST /experiments | name, description, optional owned sourceDesign reference, full scenario | 201 experiment revision1; registry-resolved validation, no numerical run |
| GET /experiments/:id | ID | Owned current revision and resolved editable configuration |
| PATCH /experiments/:id | expectedRevision and at least one mutable field | 200 new revision;409 if stale; historical inputs stay intact |
| DELETE /experiments/:id | expectedRevision query | 204 after active-run absence;409 until active work is cancelled/terminal |
| POST /experiments/:id/duplicate | expectedRevision, new name | 201 independent experiment revision1; no copied completion claim |
| GET /experiments/:id/versions | beforeRevision, limit1–20 | Owned immutable versions, nextCursor |
| POST /validate | Full scenario | Validation issues with severity/code/path/nodeIds, supported capability list and admission estimate; no numerical run |
| POST /experiments/:id/runs | expectedRevision, requestId UUID | 202 accepted queued record;200 existing matching idempotent record |
| GET /runs/:id | ID | Current lifecycle record; no fresh computation |
| POST /runs/:id/cancel | No body | 200 terminal record or202 cancellation requested; idempotent |
| GET /runs/:id/results | scenario=baseline/outage, repetition0–4, view=regions/components/timeline, cursor, limit≤120 | Paged recorded numerical results;409 until completed |
| GET /runs/:id/export | No body | Versioned JSON with recorded inputs, profiles, provenance and results |
| GET /runs/:id/report | No body | application/pdf from the same recorded run; no recomputation |

Success JSON uses {data:...}; paged data uses {items:[...],nextCursor:null|string}. Existing {error:{code,message,details}} envelope remains. Use current top-level codes (including VALIDATION_FAILED/CONFLICT) and namespaced rule details. Draft HTTP mapping:400 malformed syntax;401 anonymous;404 absent/other-owner;409 revision/idempotency/lifecycle conflict;422 scenario/capability/admission rejection with field/rule issues;429 submission/concurrency limits;503 unavailable execution dependencies. The implementation must match existing shared exception behavior when integrated; no parallel auth/error stack.

List cursors are bounded opaque server-generated values, owner/query scoped; deterministic createdAt/id order. Poll accepted statusUrl while visible using bounded backoff; hidden pages pause polling. Never persist access tokens in links, exports, traces or diagnostic artifacts.

## 5. Copy/import behavior

An existing Design reference is checked against an owned retained revision. Existing design parameters do not automatically establish a calibrated profile. Show a conversion report for capacity/latency/replicas, origins, data placement and unsupported features; require explicit mapping/confirmation before saving a valid Region Lab scenario. sourceDesign is provenance, not permission to alter or read another user's design. Do not mutate the original design or fabricate a completed run. Back-export to the legacy canvas is deferred until it can report every unsupported mapping without loss; Region Lab JSON/PDF are supported report targets.

## 6. Idempotency, revisions, hashing and lifecycle

The owner and requestId identify a submission for account lifetime. Same ID and normalized submission identity returns its original run; changed experiment/revision/normalized input returns409. The minimal request-id ledger survives experiment deletion, preventing a replay from creating fresh work; deleting the account removes it. PATCH uses optimistic concurrency and creates a new immutable experiment version.

On run acceptance, lock/check expectedRevision and persist the server-resolved immutable snapshot, mode, derived repetition seeds, model/profile/network evidence, authoritative budgets and normalized hash. inputHash = SHA256(UTF-8 JSON with recursively sorted object keys, preserved array order and finite ECMAScript JSON number serialization). Normalize semantically unordered collections before hashing: regions, profiles(id/version), nodes/edges(id), network(from/to), operation IDs, routing(origin/operation), target regions and affectedNodeIds. Preserve fallback priority and ordered schedule knots. Metadata names/timestamps/coordinates are excluded from numerical inputHash; store the complete source snapshot separately. Golden vectors are mandatory before cross-language use.

queued→running→completed|failed|cancelled. queued→cancelled is allowed. Terminal records cannot re-enter running. A user retry after failure creates a new explicit requestId. No silent compute retry after a worker loses its lease; mark interrupted and offer explicit retry. Durable dispatch reconciliation may redeliver the same queued ID but a DB claim/lease prevents concurrent execution.

Paired mode stores both scenario results; baseline/outage mode stores only its requested side. A worker dying after DB commit cannot publish another result. Cancellation and completion use an atomic terminal transition: the first successful commit wins and subsequent calls return that state. Account cleanup fences jobs before deleting data. Active runs block experiment deletion; the UI offers cancel first. Terminal/pruned results have explicit retention notices; never show an expired result as missing input=zero.

## 7. Result contract and interpretation

Run record schema discriminates queued/running/completed/failed/cancelled and forbids results on failure/cancellation. progressRatio reports monotonic completed simulation work and is not a time-to-finish promise. Queued=0, completed=1. An engine deadline/event/memory failure cannot masquerade as completed partial results.

Every summary records unique offered/successful/failed/unresolved roots, client attempts, percentile values/statuses, error denominator and optional compatible HDR histogram (ms,0.001–60000ms,3 significant digits,HDR v2 base64). Backend decoding validates payload length, format, range, bucket counts and merge compatibility; structural schemas alone do not validate encoded histogram bytes. A histogram is required whenever successfulRequests>0; null is allowed only when there are no successful observations. Encoded integer ticks are microseconds (encodedTickToMs=0.001), while API/display values are milliseconds. The checker uses an explicitly marked structural placeholder to exercise schema branches; engine-stage codec validation must reject that placeholder. No completed calibrated claim from example records.

The draft source enforces conservation, attempt bounds, error-rate denominator, unavailable percentile nulls, sample minima, percentile order, histogram count consistency, indeterminate unresolved work and matching completed sides. Worker validation against the authoritative snapshot must also verify target verdicts, per-region totals, histogram quantiles, timestamps, repetition seeds, response-size budgets and engine capabilities.

Results endpoint uses the same summary type for regions, per-component diagnostics and time buckets with actual counts. Request outcome buckets are keyed by origin arrival interval; those root outcomes may be finalized during drain. Processing-time queue/pool diagnostics are sampled from state changes in each interval and labelled separately. Error rates are never divided by time or attempts. Phase labels derive from scheduled/observed transitions. No interpolated jitter or timeline bins marketed as measurements.

Per-repetition summaries and result pages are mandatory. A single summary on the run record corresponds to repetition0 only and is labelled as such; it must not silently pool repetitions. The UI initially selects repetition0 and offers each recorded repetition. Across-repetition ranges are a separately labelled derived view, not a confidence claim. Paired baseline/outage must share the same repetition index/seed policy. A future aggregate summary contract may expose uncertainty explicitly.

Comparability means matching the baseline foundation (architecture, profiles, network, workload, targets, seeds and engine), with outage applied only to its side. Hash equality is not assumed between baseline/outage since outage/mode differ. Expose reasons instead of subtracting incompatible results. Never average regional p95/p99 or assume100ms+100ms p95 yields200ms p95.

## 8. Proposed implementation locations

During later stages, add backend src/common/contracts/region-lab/{scenario,profile,run,api}.schema.ts; src/modules/region-lab/{controllers,services,entities,worker}; separate engine/event modules; dedicated reversible migrations. Adapt the existing auth/DTO/OpenAPI/error conventions. Frontend: a dedicated region-lab route group/shell, components/region-lab, lib/api/region-lab and scoped styles; maintain the signed-in route registry and verification-evidence links. These are proposed paths, not created application files.

## 9. Reproduction and stage1 limits

From STRESSFORGE root after existing backend dependencies are installed:

    node docs/region-lab/verify-contract.cjs
    node docs/region-lab/write-openapi.cjs --check

After an intentional contract change regenerate explicitly:

    node docs/region-lab/verify-contract.cjs --write
    node docs/region-lab/write-openapi.cjs --write

Checker verifies schema/example parity and positive/negative structural/semantic cases. Its --fault-disable-semantics option deliberately bypasses cross-field checks and must fail the malformed-shares case; it never changes an application file. No builds, UI screenshots, migrations, live calls, DB jobs or accuracy benchmarks are needed or claimed for this documentation-only stage. Server checks and numerical acceptance remain future implementation work.
