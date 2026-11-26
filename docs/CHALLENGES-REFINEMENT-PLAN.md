# Challenges refinement — proposed scope and content plan

Date: 26 November 2026 (Asia/Dhaka). Status: **CH-1/CH-2 approved and implemented locally; verification and activation details are in [CHALLENGES-FOUNDATION.md](CHALLENGES-FOUNDATION.md). CH-3/CH-4 remain future scope.** The original planning pass changed no application code or data; the approved implementation adds contracts, a migration and opt-in fixtures without changing the owner database. This plan adapts the existing STRESSFORGE dark/light design language, shared component icons and compact architecture thumbnails.

## Recommendation

Build a clear practice loop: **Discover → Understand → Edit a private copy → Submit saved inputs → Understand the outcome → Try again**. Begin with catalog/detail/attempt presentation, then add validated lessons and enforceable exercise rules. Keep queue-health and regional-traffic reasoning as guided labs until their learning objectives can be assessed honestly. Reuse the existing simulator, challenge/attempt/submission services, private progress, Learn topics and Instructor workflow. No new service, animation library, model call, monetary cost engine, XP or leaderboard.

## 1. Confirmed current implementation

- `web/src/components/learner/challenges.tsx` contains the catalog, detail and private-attempt/submission UI. The catalog shows only title, repeated summary and two targets. It uses `card` but no matching `.card` selector was found in `web/src/styles`; explicit route-loaded challenge styles and computed-style browser checks are needed.
- `web/src/app/challenges/page.tsx` renders this catalog. Current public `PublicChallenge`/list responses expose only id/title/summary/goal (`attempts.schema.ts`, `learner-challenges.service.ts`). Traffic, preview, difficulty, hints and prerequisites are not currently supplied publicly. Do not render invented values from titles.
- `demo-challenges.ts` seeds four examples: Flash sale, p95 under 100 ms, Cross-region and Launch at 10x. All share a generic description. Seeding deliberately does not overwrite existing published rows.
- `challenges.schema.ts` and `challenges.service.ts` already freeze published traffic, starting graph and goal; authoring supports owned drafts/publishing/archiving/duplication. Public wording can change. Learners receive private copies, with saved-revision/idempotent submissions, interruption recovery and Instructor feedback. The existing limit is 20 graded submissions per challenge.
- `judge-challenge.ts`: pass is **p95 <= target AND error rate <= budget**, inclusive. It does not currently judge component budget, regional shares, required topology, queue backlog or utilization. A challenge can meet its goal while the simulator calls the design strained; these are different facts, not interchangeable labels.
- Existing Progress reads saved submissions; public catalog reads remain public. Preserve ownership, role checks, Instructor feedback, archived-history semantics and guest login return paths.

Sources: the files above; `web/src/lib/api/attempts.ts`, `challenge-presentation.ts`, Instructor challenge form/detail, engine catalog/builders/routing/compute/templates and `docs/R5-INSTRUCTOR-SCOPE.md`. Earlier work and protected audit artifacts remain untouched.

## 2. Proposed user experience

### Catalog

Use the same page width and visual language as Designs/Learn. Three cards per row on wide laptops, two on narrower laptops/tablets, one on phones; cards should be compact and readable, not a giant scrolling diagram. Suggested preview height 112–128px. Each card contains:

1. Small component/topic glyph, difficulty text and category.
2. Bounded SVG thumbnail of the **frozen starter**, with a text alternative. It is not a solution or a live workload animation.
3. Clear title, two-line real-world scenario and one learning objective.
4. Actual fixed traffic and target chips: baseline rps, burst, read share; p95 and error budget. Full shape/duration in details.
5. Skill tags (maximum three visible), genuine estimated effort labelled as editorial, and required Learn links in details.
6. Signed-in state: Not started, In progress or Passed; separately show latest submission state/result when available. Use existing server progress, never infer success from a clicked button.
7. One clear action: View challenge, Continue attempt or Review attempt. Card title is a link; avoid nesting controls inside a whole-card link.

Header: concise introduction, genuine attempted/passed counts for the account, and a Continue your latest available attempt shortcut when its design still exists. Search title/summary, category and difficulty filters, state filter for signed-in users, sort by recommended order/difficulty/title and a visible Reset. Existing 200-item public cap must not be labelled a complete global count; initial filters can be client-side over the bounded returned set. Add pagination/query contracts only if the catalog actually outgrows this bound.

No-results, no-published-content, loading skeleton, signed-out and retry states must be deliberate. On errors keep filter inputs and previous data when safe. On account switch cancel/clear owner progress; guests see no private history. No per-card detail/graph request.

### Detail and attempt workspace

Provide a short scenario, learning outcomes, starter thumbnail, complete frozen traffic, target checklist, allowed changes, protected properties, prerequisites, optional hints and Start/Resume. Display the current 20-submission limit. Keep the edit-workspace link prominent; explain that normal design runs are practice and only **Submit saved revision** judges the challenge's frozen traffic.

Use a compact attempt summary plus submission timeline. For a completed result show target vs actual, metric units and differences, checked revision, engine version and timestamp. Separate **Meets challenge goal / Not yet** from **Model state: pass/strained/fail**. Pending, failed infrastructure work and interrupted submissions are not failed learner solutions or zero metrics. Preserve existing recovery identity/idempotency and unset-draft guard. Reuse existing comparison/report links only when a compatible stored run actually exists; do not construct fake run IDs from submission IDs.

Offer three progressively revealing hints: observation → concept → practical direction. Opening hints has no hidden score penalty. Keep full answer graphs out of public JSON/JavaScript; this is guided learning, so hints may reveal a direction but must not leak a supposedly hidden benchmark answer. A verified solution walkthrough is a later explicit choice, not a prerequisite of this release.

### Visual/accessibility requirements

Component SVG glyphs rather than third-party vendor logos; cobalt actions and separate semantic green/amber/red statuses; visible focus rings and readable light/dark contrast; stable card footers; keyboard filters and CTAs; focusable preview explanation if needed, no hover-only information; reduced-motion support. At 320/390/768/1024/1440, no horizontal overflow or hidden primary actions. Distinguish data loading from an empty result. Reuse the topology projection/thumbnail primitives where suitable, importing styles explicitly at the challenge routes.

## 3. Proposed content format

Each official challenge needs: stable key/version, authored summary and briefing, objective, category, editorial difficulty/effort, prerequisites and topic tags, frozen starter graph/traffic/goal, typed allowed edits, three hints and a private reference solution. Difficulty and estimated minutes are recommendations, not measured outcomes. Existing/custom Instructor challenges can have nullable discovery metadata and a neutral Unclassified fallback.

Standard grading remains p95/error unless a new explicit exercise rule applies. Reference graphs and measured expectations are dev/test assets only. Published content is versioned; never rewrite legacy four IDs, snapshots, targets or graded history through a seed script. New rows get new stable IDs; seeding is explicit, idempotent and opt-in, not a read-page side effect. The current test fixture reference graphs were independently built; before promotion to production content, preserve original starter node IDs when applying edits and verify the final rule-valid snapshots again.

## 4. Offline-calibrated proposed content

All values below are **mathematical estimates from reference-port-v1**, calculated locally on 26 November. They are not deployed challenges, production benchmarks or proof of anti-shortcut rules. Full inputs, output summaries and runnable probe: `docs/audit/challenge-plan-2026-11-26/`. Exactly 24 bounded offline calculations ran, with no DB, network or model. Common defaults: 10 modeled minutes, steady with one burst, 1% error budget, US East unless stated; catalog capacity/service-time defaults apply unless a fixed override is stated. References all returned 0% modeled request errors. All reference graph validations succeeded.

| ID | Challenge / suggested level | Fixed baseline rps / burst / reads | p95 target | Starter p95 | Reference p95 | Current-goal feasibility |
| --- | --- | --- | --- | --- | --- | --- |
| C01 | Rescue the single-server launch · Beginner | 600 / ×1.5 / 80% | 150 ms | 2068.67 ms | 42.72 ms | starter fails → reference passes |
| C02 | Cache a busy catalogue · Beginner | 2,000 / ×1.5 / 95% | 150 ms | 615.61 ms | 40.21 ms | starter fails → reference passes |
| C03 | Scale reads without moving writes · Intermediate | 2,000 / ×1.5 / 95% | 150 ms | 615.61 ms | 43.77 ms | starter fails → reference passes |
| C04 | Put a breaking-news site behind the edge · Intermediate | 3,000 / ×2 / 95% | 200 ms | 1814.20 ms | 45.14 ms | starter fails → reference passes |
| C05 | Remove a cross-region detour · Intermediate | 500 / ×1.2 / 80% | 150 ms | 198.80 ms | 43.63 ms | starter fails → reference passes |
| C06 | Serve a photo feed under load · Intermediate | 2,000 / ×2 / 95% | 200 ms | 1961.69 ms | 73.31 ms | starter fails → reference passes |
| C07 | Fix the API gateway chokepoint · Intermediate | 800 / ×1.5 / 80% | 150 ms | 584.67 ms | 47.19 ms | starter fails → reference passes |
| C08 | Scale the load-balancing tier · Intermediate | 1,000 / ×1.5 / 80% | 200 ms | 324.56 ms | 45.86 ms | starter fails → reference passes |
| C09 | Acknowledge notifications before delivering them · Advanced | 500 / ×1.5 / 20% | 100 ms | 325.11 ms | 39.46 ms | starter fails → reference passes |
| C10 | Drain the background queue · Advanced lab | 1,000 / ×2 / 20% | 200 ms | 39.59 ms | 39.59 ms | NOT suitable for current-goal grading; see lab rules |
| C11 | Weighted regional clients · Guided lab | 500 / ×1.2 / 80% | 250 ms | 244.57 ms | 232.21 ms | NOT suitable for current-goal grading; see lab rules |
| C12 | Marketplace capstone (all 12 types) · Advanced capstone | 3,000 / ×2.5 / 85% | 500 ms | 1240.44 ms | 63.19 ms | starter fails → reference passes |

### Learner briefs, starter parameters and reference directions

Reference directions below are implementation-planning material; they are not a public solution payload.

- **C01 — Rescue the single-server launch (10–15 min).** A small shop's launch overwhelms its application tier. Starter Client → App ×1 → Database. Objective: meet 150ms without changing workload or per-instance performance. Reference App ×3, all else unchanged. Allowed edit: app replicas 1–3 only. Hints: inspect application utilization; explain replicas vs per-instance capacity; add a small replica pool. Learn: app servers, scaling, utilization.
- **C02 — Cache a busy catalogue (15–20 min).** Repeated catalogue reads saturate the database. Starter Client → LB → App ×8 → DB; 95% reads. Add a cache with 85% hit ratio and the model's supported miss path, retaining primary writes. Keep app capacity/replicas and DB properties fixed. Hints: identify DB read load; what repeated reads can skip; place cache at the app data path. Learn: caching, read/write share, bottlenecks. The reference uses the builder's implicit cache-miss routing; document it rather than drawing an unsupported connection convention.
- **C03 — Scale reads without moving writes (15–25 min).** Same workload as C02, but cache is unavailable. Add two read replicas connected through the supported primary/replica relationship. Preserve writes and replication overhead; keep core node properties fixed. Hints: distinguish reads/writes; read pools; inspect replay load as well as request traffic. Learn: databases, replicas, read/write routing. This intentionally teaches a different solution to the same initial bottleneck.
- **C04 — Breaking-news edge delivery (15–25 min).** A content site's twofold surge overloads App ×4 despite an 80% internal cache. Starter Client → LB → App ×4, Cache 80%, DB. Add an 80% CDN in front of the origin; retain writes/origin path and existing cache. Hints: an app-side cache still requires an app request; edge hits bypass more work; check remaining origin writes. Learn: CDN, caching, burst behavior.
- **C05 — Remove a cross-region detour (10–20 min).** US East clients/LB/database call application servers in EU West. The app pool has four replicas and is not saturated. Move application compute to US East, leaving client locations and traffic fixed. Hints: low utilization does not imply low latency; inspect region crossings; remove the unnecessary round trips. Learn: regions and p95. Do not claim this single-region repair is a universal global-locality solution.
- **C06 — Photo-feed reads under load (20–25 min).** A photo-feed app ×3 serves a 60% object-storage read share and is overwhelmed. Add CDN 80% plus app cache 80%, preserving storage share and the origin data path. Learn: object storage, CDN and cache. Copy must say photo-feed reads; the current storage model does not represent real upload transfer size, bandwidth or durability.
- **C07 — API gateway chokepoint (15–20 min).** Starter Client → Gateway → LB → App ×4 → DB. Gateway capacity is a fixed 500 rps per replica, with the default 3ms service time. Increase gateway replicas from 1 to 4; do not silently replace its capacity or bypass it. Learn: gateway, saturation and moving bottlenecks.
- **C08 — Scale the load-balancing tier (15–20 min).** A constrained load balancer serves an otherwise adequate App ×4/DB design. LB fixed capacity 1,000 rps per replica; increase replicas 1 → 3. Reference meets the 200ms/1% goals but remains model-strained because the DB is at about 83.3% utilization. Explicitly show **goal met ≠ comfortable headroom**. Learn: load balancers, utilization and headroom. No new cost/currency score.
- **C09 — Acknowledge notifications before delivery (20–30 min).** A poorly designed notification endpoint waits on its email provider on every request. Client → App ×3 → DB plus synchronous email API (100% modeled call share, fixed capacity 1,000 rps, 180ms). Change the response contract to accepted-for-background-processing; move writes/jobs through Queue → Worker ×4 → DB/email provider. Keep the external service limits fixed. Reference queue is clear (400 average / 600 peak jobs/s, 1,000 jobs/s drain). Do not generalize this to asynchronous payment completion or claim queued jobs were delivered from frontend latency alone.
- **C10 — Drain the background queue (20–30 min; extension-gated).** App ×5, queue depth 500,000, Worker ×1, DB; 1,000 rps, ×2, 20% reads. Worker ×8 fixes it. The broken starter already meets current request targets: p95 39.59ms, 0% request errors, but backlog 330,000 messages and lag 1,320s; reference backlog/lag zero. It **must not** be published as an ordinary p95/error challenge. Add explicit engine-recorded queue-health goals (for this case backlog=0, overflow=0, finite lag=0 at the model's stated evaluation point), or keep it a Learn-guided lab. These are modeled values, not a wall-clock “wait ten minutes and see” promise.
- **C11 — Weighted regional clients (15–25 min; guided experiment).** Two clients: US East weight 1, Asia South weight 3; shared baseline 500 rps ×1.2, reads 80%, App ×3/DB. Compare US East vs Asia South service placement while retaining both entry points and weights. Observed global p95 is 244.57 vs 232.21ms: both meet 250ms. Do not invent a tight target just to manufacture a fail or equate weights with independent per-client rps. Teach aggregate rate splitting and why a distant minority can still determine tail latency. Assess through a separate future conceptual check, not the current numerical pass badge.
- **C12 — Marketplace capstone (30–45 min).** All 12 types, one US East entry point: CDN70%, gateway, LB, App ×2, Cache85%, primary DB + two read replicas, queue + Worker ×4, Object storage15%, synchronous payment API4% at 150rps/180ms. Traffic 3,000 rps ×2.5, 85% reads, two spikes, 20 modeled minutes; target500ms/1%. Reference changes only App ×10 and Worker ×8. It meets the request goals but is still model-strained (external API about81% utilization); highlight that limitation instead of promising production readiness. All 12 types are present; it is not a multi-region proof or an availability/failover experiment.

### Release content selection

First release: C01–C06, after rules and fixture calibration. Second release: C07–C09 and C12. C10/C11 remain planned labs, not ordinary graded challenge rows. Existing four challenges stay available and retain their original data/history; optionally label them Legacy practice when this is based on explicit metadata. Do not silently replace or rename a previous benchmark. Summary counts must state which published/available set they cover.

## 5. Prevent trivial or misleading solutions

Adding descriptions without rules makes every exercise solvable by setting enormous capacities, zero service time, 100% cache hit or skipping the modeled service. For new official exercises, add a small **typed server-side rule layer**, not prose-only instructions:

- The server uses the frozen challenge workload/goals, never the learner's modified traffic. Preserve existing behavior and test it again.
- Per-exercise allow-list of editable existing node properties and allowed new component types/edges; immutable required original nodes/types and relevant demand shares/regions. Positions and labels may change without changing semantics. Prohibit missing/unreachable required components and forbidden bypasses.
- Preserve catalog/fixed per-instance capacities and latency unless that property is explicitly part of the exercise. Bound allowed cache/CDN hits; forbid zeroing payment/storage shares to manufacture a win.
- Enforce aggregate per-type replica limits across all nodes, not merely a per-node maximum that can be bypassed by adding more nodes. Explain these as exercise constraints, not measured financial budgets.
- Freeze rules with the challenge version and snapshot their evaluation in each submission. Legacy/custom challenges default to their existing p95/error-only rules; no retroactive regrading.
- Rule rejection must have typed field/node issues and preserve the draft. Constraint handling must fit the submission contract: decide and document whether invalid edits block submission before durable judging; do not invent extra graded attempts or silently change the 20-attempt limit.
- Queue-health rules need explicit canonical fields/units and server grading, evaluated from the recorded model result. No UI-only queue-pass badge. Reject missing/non-finite metric assumptions; infinity does not become zero. Model saturation/availability/resilience claims are separate.

Allow multiple valid solutions within each exercise's stated rules; a reference is proof of solvability, not a graph-matching answer key. Some focused introductory exercises intentionally permit only one class of edit. Baseline and reference must be rechecked with the rule layer and stable IDs before release. Staff solution data stays out of public APIs/bundles.

## 6. Data and API changes (proposed, not implemented)

Reuse the existing challenge rows and public /challenges routes. Add a small optional discovery/content payload (category, difficulty, editorial minutes, learning outcomes, prerequisites, display tags, hints, pack key/version) and separate versioned rule payload to the challenge model via additive migration; finalize whether explicit columns or validated JSON after inspecting repository conventions. Validate every field with canonical Zod and maximum lengths. Existing null metadata renders honestly, not as fabricated Easy/10 minutes.

Extend published public projection with only approved metadata, fixed traffic and a bounded frozen topology preview (<=50 nodes/200 edges, labels/types/coordinates only). Never expose reference answers, private draft graphs, Instructor emails, submissions, provider identities or unrelated account data. Preserve owner/role authorization and archived-row visibility. Keep one catalog request plus at most one account progress request; no graph query per card. Use existing safe DTO/schema/Phase3 generation conventions; do not regenerate the main schema.d.ts.

Instructor form: optional metadata, preview, hints, explicit exercise rules and publish preflight. Existing Instructor functionality remains; normal custom challenges need not use the official pack restrictions. Require server-validated graph/targets plus explicit reference solvability verification for the shipped official pack; do not pretend private arbitrary Instructor challenges have verified solutions if no reference was supplied. Existing published traffic/goal/starting snapshots and newly introduced rules must stay frozen; cosmetic metadata changes must not rewrite graded requirements or history.

## 7. Delivery stages and acceptance

| Stage | Scope | Acceptance / dependency |
| --- | --- | --- |
| CH-1 Discovery and presentation | Explicit challenge styles, compact cards/icons/preview, real traffic projection, search/filter, truthful account status, detail/attempt layout | Existing four work unchanged, desktop/mobile/light/dark/keyboard/empty/outage states; only actual data displayed. No grading change |
| CH-2 Rules and first content pack | Versioned metadata/rules, authoring/preflight, six official C01–C06 fixtures, deterministic hints and Learn links | Every starter valid and fails; at least one rule-valid reference passes; shortcut tests fail. Migration up/down/preservation and contracts verified on isolated DB |
| CH-3 Advanced practice | Four advanced C07–C09/C12; queue-health rule for C10 if approved; C11 as separately labelled conceptual practice | Explain strained-but-goal-met cases; queue backlog cannot pass queue-health objective; global tails not misrepresented |
| CH-4 Integration and polish | Progress/Continue, archived attempts, feedback, reliable busy/retry/partial states, final screenshots/docs | Full affected learner/Instructor/auth/ownership journeys and saved-progress correctness; honest living-report status |

Recommended approval boundary: CH-1 and CH-2 first, not an all-at-once rewrite. Implementation must confirm exact migration/contracts and check for obsolete tests before editing them; owner approval remains required for wrong pinned assertions. Proposed work preserves existing route patterns unless a concrete additional route is later approved.

## 8. Test plan

1. Content/model: deterministic replay of every full snapshot; baseline fails + reference passes for graded cases, finite metrics and units, valid directed graphs, immutable traffic, unchanged reference model assumptions, all 12 component types covered across pack and C12. Deliberately break references; ensure each exercise detects its intended problem rather than a different accidental bottleneck. Do not auto-update expected numbers to hide engine regressions.
2. Rules/security: edit capacity/latency/traffic outside allow-list; delete/disconnect required nodes; set protected shares to0, cache/CDN to1; add unlimited duplicate replica pools; use prototype keys/unexpected fields/cycles; arbitrary other-owner design/attempt/challenge IDs; learner attempts Instructor routes; old submissions never regraded. Private reference solutions never appear in public DTO/JS.
3. Grading: inclusive exact threshold; p95 passes/errors fail and reverse; fractions vs percent; strained simulator with challenge-goal pass (C08/C12); queue backlog still current-goal pass but queue-health fail (C10); pending/error/interrupted not a numeric fail or0; stale saved revision and late edits cannot change the judged snapshot.
4. API/data: additive migration old rows up/down/preservation; opt-in idempotent pack seed and no overwrite of legacy four; frozen published rules/traffic; bounded public preview; account-isolated progress; archived/removed attempt recovery; request-id duplicate/network ambiguity and20-submission limit; final contract/type parity.
5. Browser: catalog layout and filters at320/390/768/1024/1440, dark/light/reduced motion and keyboard; card layout computed style actually loaded; empty/no matches/retry; guest → login → same challenge; start/resume → edit → save → submit → recorded result → progress; hints do not erase drafts; feedback remains; account switching never leaks state; no actual model call.
6. Deliberate faults: remove card CSS; show another account's progress; permit learner traffic instead of frozen traffic; bypass one rule; hide/falsify queue backlog; treat strained as automatic fail; leak private solution. Each must fail a meaningful test. Restore only applied faults; never weaken existing assertions.
7. Required commands when implementing: backend/frontend build/lint/type checks, targeted plus relevant full unit/e2e suites, canonical Phase3 parity, route inventory, affected Chrome plus independent production smoke. Isolated Postgres/Redis, one worker on this8GB laptop, snapshot existing audit images before broad suites. No owner DB writes or live AI/provider calls.

## 9. Feasibility review and exclusions

High value/low risk: proper scoped cards/styles, actual traffic/targets, search, previews, descriptive briefs, hints and Learn links. Medium effort: canonical metadata projections and account progress integration. Highest correctness risk: enforceable edit rules and async objectives; tackle in their own tested stage. Reuse installed libraries and server data; no dependency necessary in the proposed scope.

Avoid for now: leaderboards/competitive scoring, timed exams, arbitrary currency budgets, certificates/XP/streak duplication, real-infrastructure fault injection, invented failover/resilience metrics and AI-generated challenge grading. The simulator models queues/latency/throughput, not complete network or production reliability. Do not equate satisfying this model's targets with real production capacity.

Offline preflight is promising for ten numerical exercises, not a completed feature or user usability study. A small learner trial should validate difficulty/wording/editor discoverability before calling editorial estimates accurate. Update this same scope, PROJECT-STATE, HANDOFF-LOG and STRESSFORGE-PROGRESS-REPORT after each approved stage, preserve earlier history, record exact evidence and reassess affected requirements; updates are not automatic.
