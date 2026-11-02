# AI Design Copilot: scope after P0 verification

Refines [AI-COPILOT-PLAN](AI-COPILOT-PLAN.md) (approved 2026-11-02). P0 was read-only: no code changed, no model called. Where this document and the plan differ, this document wins. Status: **approved by the owner 2026-11-02: all seven decisions in section 7 as recommended.** P1 note: demo mode and the task-generic gate harness move to P2 and P3, when there are recorded responses and cases to use them on.

## 1. What P0 found (verified in the code)

| # | Finding | Where | Effect on the plan |
| --- | --- | --- | --- |
| 1 | A keyword-rule "Describe your system" path already exists: `prepare` with `source: "scripted"` calls `scriptedDraft(text)`, which builds a design through `buildFromSpec(BuilderSpec)` and returns a prepared design plus a list of assumptions. The UI is `components/creation/describe.tsx`, labelled "Scripted mock". | `designs/creation.ts`, `designs/scripted-draft.ts`, `creation.schema.ts` | **F1 becomes a drop-in: a model fills the same `BuilderSpec` the scripted code fills.** The scripted draft stays as the labelled non-AI path and becomes F1's baseline, so the gate can report "AI versus keyword rules" and never falls back silently. |
| 2 | The Compare endpoint refuses to subtract anything when the traffic differs (`TRAFFIC_DIFFERS`), by design. | `designs/design-versions.service.ts` | **The plan's F3 was wrong** to reuse Compare. A what-if changes traffic, so Compare would say "not comparable". F3 needs its own small side-by-side view that shows both runs and subtracts nothing. F2 is unaffected: a fix changes the graph at the same traffic, so Compare works. |
| 3 | `POST /simulation/preview` accepts any snapshot (graph and traffic), persists nothing, returns the run summary, and is admitted at lower priority than saved runs (it can be cancelled or told the machine is busy). Saved runs (`/designs/:id/simulate`) always use the saved revision and cannot take a traffic override. | `simulation/preview.*`, `worker/simulation-executor.ts` | F3 and F2's candidate checks use the preview path, not saved runs. They must handle "busy" and "superseded" as ordinary outcomes (retry message), not errors. |
| 4 | The graph schema supports what F2 needs: per-node `replicas` (1 to 200), `capacity`, `latency`, `hitRatio` on cache and CDN, and nodes of 12 types including `cache`, `replica` and `queue`; builder helpers exist (`addNode`, `clone`, `nextId`). Applying a change is `PATCH /designs/:id` with `expectedRevision`, which creates a new revision; History and Restore already exist. | `graph.schema.ts`, `engine/builders.ts`, `designs.controller.ts` | F2 can be built entirely from existing operations. |
| 5 | `designs.source` is a closed set (`blank, template, import, scripted`) enforced by a database CHECK constraint, the contract enum, the entity type and the generated web types. | `CreateDesigns` migration, `api.schema.ts`, `design.entity.ts` | Recording an AI-created design honestly needs the value `ai`: an additive contract change, a migration (drop and recreate the CHECK) and regenerated types. Needs you to run `pnpm migration:run` on your database. |
| 6 | The Groq adapter and `AiService` are specific to explanation jobs (fixed prompt, result schema, evidence ids, durable job rows). The quota guard, provenance fields, hosted-data wording and the gate harness are generic. | `groq.provider.ts`, `ai.service.ts` | New tasks need a small synchronous task path beside the job path: one generic "structured request" method on the adapter and a thin task service reusing `AiQuota`. The explanation code and its tests stay untouched. |
| 7 | Stale text: the AI panel still says "Real AI answers about your designs arrive in phase 3". | `components/shell/ai-panel.tsx:96` | To be corrected when the Copilot UI lands. |

## 2. F1: Describe-to-design (revised)

- **Endpoint:** the existing `POST /designs/prepare` gains `source: "ai"` with the same `text` field (1 to 500 characters here, since the model call is paid in quota). The response is the existing prepared design (design plus assumptions), so the existing preview card, validation and Create button are reused unchanged.
- **Model output (strict, all fields required, no nullable unions, because Groq strict mode's handling of unions is unverified):**
  `region` (3 values); `appReplicas` (1 to 50); `includeCdn`, `cdnHitRatio` (0.3 to 0.9); `includeGateway`; `includeLoadBalancer`; `includeCache`, `cacheHitRatio` (0.3 to 0.95); `includeDatabase`; `dbReadReplicas` (0 to 5); `includeQueue`, `queueWorkers` (1 to 20); `includeStorage`; traffic: `rps` (1 to 1,000,000), `readRatio`, `burst` (1 to 20), `sloP95Ms` (10 to 10,000), `errorBudget` (0.001 to 0.1), `durationMin` (1 to 120), `shape` (3 values); `rationale` (at most 200 characters).
  The number paired with an `include…` flag is ignored by the server when the flag is false.
- **Server:** maps the output to `BuilderSpec`, builds with the existing `buildFromSpec`, then validates with the existing `createDesignSchema`; anything outside the ranges is refused, never clamped silently. The rationale may only contain numbers that appear in the user's text or in the returned fields. The assumptions list says "Suggested by a hosted AI model (Groq); review before creating" plus the rationale, marked as model text.
- **Fallback:** none silent. If the model is unavailable the user sees that, and the scripted "keyword rules" path is still offered as its own labelled button, as today.
- **Gate:** 20 prompts as in the plan; the scripted draft is run on the same prompts and judged in the same blind sheet. Pass bar unchanged (18 of 20 sensible and valid, 100% valid or cleanly refused, 0 injection followed, each within 10 s). The report also states AI versus scripted.

## 3. F3: Natural-language what-if (revised)

- **Endpoint:** `POST /ai/tasks/what-if` with `{ designId, expectedRevision, text }` (1 to 300 characters). Returns the interpreted change and its preview result.
- **Model output (strict):** `rpsMultiplier` (0.1 to 20), `shape` (`keep`, `steady`, `ramp`, `spike`), `changeReadRatio`, `readRatio`, `changeDuration`, `durationMin`, `rationale` (at most 120 characters). Traffic only; the graph is never touched.
- **Server:** copies the saved revision's traffic, applies the change, validates with `trafficSchema` (out of range is refused), runs the preview path against the saved graph, and returns the summary together with the saved run's summary.
- **View:** a new side-by-side card, "Same design, different load", titled with both traffic settings, showing p95, error rate, verdict and bottleneck for each, with **no difference column** (the same rule Compare follows). The interpreted change is shown as editable fields; changing them re-runs the preview without another model call. Nothing is saved unless the user chooses **Save these traffic settings as a new revision** (existing PATCH).
- **Gate:** 16 prompts, 14 of 16 correct direction and size, 100% valid or cleanly refused, 0 injection followed.

## 4. F2: Verified fix suggestions (revised)

- **Candidate operations (v1, deterministic, no model):** at the bottleneck node of a saved Fail or Strained run: add one replica; double the replicas (capped at 200); double the capacity; add a cache in front of the database when the bottleneck is the database and no cache exists (using the catalog's default hit ratio, stated as an assumption); add a database read replica when the bottleneck is the database and the read ratio is at least 0.5. At most 6 candidates; each is validated with `graphSchema` and the engine's own validator before it is simulated.
- **Verification:** each candidate is simulated through the preview path at the run's own traffic; only candidates that improve the verdict, p95 or error rate are kept, ranked by verdict, then p95, then error rate; the top 3 are shown. Every number comes from the engine; a test asserts that each displayed number equals a fresh simulation of that candidate.
- **Apply:** one click patches the design (`PATCH` with `expectedRevision`), producing a new revision; the user then runs the test and uses the existing Compare view (same traffic, so it is comparable).
- **AI layer (smaller than planned):** only an intent parser. The user can type a goal; the model returns `priority` (`latency`, `errors`, `fewestChanges`) and one `avoid…` boolean per operation (`avoidReplicas`, `avoidCapacity`, `avoidCache`, `avoidDbReplica`). It only filters and orders the deterministic candidates. **No model-written sentence about a candidate:** the wording of each suggestion is fixed server text, which removes the figure-fabrication risk that failed the explanation gate.
- **Gate:** deterministic core: all 6 templates, Fail and Strained cases, never worse than reported, identical on re-run. Intent parser: 12 goals, 11 of 12 correct.
- **If busy:** previews can be cancelled or refused when the machine is busy; the panel then says "Calculation capacity is busy, try again" and keeps what it had.

## 5. Shared groundwork (P1), now specific

1. `StructuredRequest` method on the Groq adapter (messages, hand-written strict schema, parser) reusing the existing transport, bounds, error mapping, `observe` callback and usage reporting; a test ties each task's transport schema to its server schema, as for explanations.
2. `AiTaskService` (synchronous, owner-scoped): feature check, quota `reserve`/`settle`, abort on client disconnect, provenance recorded per call (provider, model, tokens, latency), the hosted-data notice text per task.
3. Feature switches `AI_FEATURES=describe,whatif,fixes` (default empty), in readiness.
4. `designs.source` gains `ai`: contract enum, entity type, migration (additive, with `down`), regenerated web types; the dashboard tag "AI draft".
5. Demo mode: recorded real responses (kept in the audit folder from the gate runs) replayed through the same validators, labelled "Recorded response", enabled only by an explicit setting.
6. The gate harness becomes task-generic (cases plus a checker per task), keeping the explanation harness and its tests.

## 6. Order and size (estimates, not promises)

P1 groundwork (about one session, no model call) → P2 F1 with live gate (one to two sessions) → P3 F3 (one) → P4 F2 core with no AI (one to two), then its intent layer (half) → P5 Evaluation tab → P6 regression and rehearsal. Every step committed separately and pushed only on your word; live runs only on your go.

## 7. Decisions needed now

1. **Add `ai` as a design source, with a migration** you run on your database (finding 5). Recommended: yes. Alternative: record AI drafts as `scripted` (dishonest, so I advise against).
2. **F3 shown as a side-by-side with no difference column**, not through Compare (finding 2). Recommended: yes.
3. **F2: AI only parses intent, no model-written candidate wording** (section 4). Recommended: yes. Alternative: add one-sentence wording later if F2 is solid.
4. **F1 fills the whole builder spec**, not just a template choice. Recommended: yes (richer, and the scripted draft already shows the shape).
5. **User text sent to the hosted provider** (still pending from the plan): up to 500 characters for F1 and 300 for F3, with a visible notice, no account data. Recommended: approve.
6. **Order:** F1, F3, F2. Alternative: F2 core first since it needs no AI.
7. **Keep user prompt text in provenance?** Recommended: no, store only the length and a hash; the gate runs keep their own synthetic prompts.
