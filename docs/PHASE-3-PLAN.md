# STRESSFORGE — Phase 3 plan: Improve and history

Prepared: 2026-10-28 (Asia/Dhaka). Status: overall plan proposed; M10 explicitly approved and evaluated2026-10-28. M10 integration gate is NO-GO for the tested configuration; see [results and follow-up](M10-LOCAL-AI-FEASIBILITY.md). The user subsequently approved M11: backend foundation is implemented and verified, with real AI disabled by default; see [M11 guide](M11-AI-FOUNDATION.md). M12–M17 remain unapproved/unstarted. No model download or real-model integration test was performed. Earlier planning observations are retained as history.

## 1. Outcome and scope

Complete the next learning loop: **open a saved design → understand a recorded result → ask local AI for a justified change → inspect and approve the change → save and rerun → compare the actual model outputs → keep or restore a version.** Also support a reviewed text-to-architecture draft, owned-design discovery, notes, printable reports and controlled read-only sharing.

This follows the existing Phase 3 title, Improve and history, in web/src/lib/catalog.ts. A phase limited to AI explanation would be an intermediate milestone, not completion of the current roadmap. Deliver AI first and complete the supporting workflow in later milestones. No requirement silently disappears; any reduction requires an explicit scope decision.

### Sources inspected

- [Overall plan / approved four-role direction](PROJECT-PLAN.md).
- [Phase 2 plan](PHASE-2-PLAN.md), [architecture](ARCHITECTURE.md), [living report](STRESSFORGE-PROGRESS-REPORT.md).
- web/src/lib/routes.ts: Phase 3 Designs, Report, Share settings and Compare destinations.
- web/src/lib/catalog.ts: Phase 3 Improve, History and Notes tab descriptions.
- web/src/components/shell/ai-panel.tsx: currently scripted local responses, with explicit mock labelling.
- SavedDesign entity and [contracts](contracts/README.md): ownership, revisions, JSONB graph/traffic, existing four source kinds, bounded graph input and immutable run snapshots.
- Local Ollama CLI/API, installed model inventory, NVIDIA telemetry and Windows memory/storage measurements.

## 2. Confirmed machine/runtime baseline

| Item | Observed 2026-10-28 | Implication |
| --- | --- | --- |
| Ollama | Installed Windows executable; CLI and localhost:11434 API version0.40.12 agree | No installation required |
| Installed models | qwen2.5:1.5b, ID65ec06548149,986MB; llama3.2:3b, IDa80c4f17acd5,2.0GB | Benchmark these before downloading another model |
| Loaded models | ollama ps and /api/ps empty | GPU placement and response quality not yet verified |
| GPU | RTX2050,4096MiB total,2944MiB free at inspection; driver596.21 | Model fit must include context/runtime overhead; no speed guarantee |
| System RAM | 7.73GB usable;0.78GB free at inspection | Significant current pressure; do not load models until headroom improves |
| C: storage | 474.7GB capacity;217.5GB free | No immediate disk shortage observed |
| CPU | User-supplied i5-12450H,8cores/12threads | Not independently remeasured in this check |

**Candidate default:** existing qwen2.5:1.5b. **Comparison:** existing llama3.2:3b. This supersedes the earlier suggestion to download qwen3:1.7b immediately. Final model choice requires M10 evidence. No AirLLM, paid API, fine-tuning or new hardware purchase is required by this plan.

Proposed starting limits: one model and one inference at a time,2048-token context, compact fact packets and approximately256 output tokens for explanation. Drafts may need a separately measured larger output/context allowance. Benchmark them before expanding limits. Download size is not runtime RAM/VRAM consumption. Close unnecessary applications voluntarily; do not kill unrelated processes, disable services or change global Ollama settings without scope justification.

## 3. Scope boundaries

Included: real local explanation; constrained suggestions and approved application; text-to-graph drafting with review; revision/history/restore; same-input comparison; assumptions/decisions; owned Designs search/sort/filter/duplicate/rename/archive; printable report and user-invoked Save as PDF; read-only share links with scoped snapshots/revocation/opened time; validation, resource limits and failure recovery.

Excluded: deployment or real infrastructure stress generation; model-written simulation numbers; autonomous edits; arbitrary code/tool execution; vector database/RAG; fine-tuning; multi-agent orchestration; team editing; payment/cloud APIs; full administration or classroom management; Instructor/Reviewer workflows in this phase.

The four account roles remain **User, Instructor, Reviewer and Admin**. Existing code currently implements only user/admin enum/hierarchy. Instructor/Reviewer are a later dedicated role/permission milestone with explicit grant-based access, not silently added to the existing rank hierarchy. Phase 3 sharing provides an owner-controlled read-only boundary; an Instructor/Reviewer label alone must never confer design access. Full four-role delivery remains a project requirement before claiming those features complete.

## 4. Proposed milestones and observable gates

### M10 — Hardware/model feasibility and evaluation baseline

**Checkpoint2026-10-28:** benchmark evaluation completed; current configuration fails the integration gate. Both installed models completed the eight core cases across separately preserved attempts, plus two small draft probes. Factual/schema failures, a cold timeout and resource exhaustion prevent model/budget approval. Prepared server-grounded diagnostic was not run. See [M10 results](M10-LOCAL-AI-FEASIBILITY.md).

- Read installed /api/show metadata, model capability/licence details and local runtime options before choosing parameters.
- Use synthetic or oracle-derived simulation summaries, not private user data. Test both installed models sequentially; record cold start, warm response latency, tokens/second, GPU placement, RAM/VRAM and core-app responsiveness with Postgres/Redis/API/web running.
- Begin with at least8 representative prompts per candidate: healthy, strained, failed, no identified bottleneck, shared-database dependency, obsolete result, missing inputs and malicious component-label instructions. Include a small structured draft probe.
- Suggested initial UX targets: warm concise explanation within30s and cold within60s, no out-of-memory failure or unresponsive core app. These are proposed acceptance targets, not observed performance. Revisit transparently after measurements; do not claim success by quietly extending budgets.
- Save new, timestamped evidence under a Phase3-specific audit folder. Never overwrite historical M2/M3/etc artifacts. Do not run the legacy profiler against its default output paths.
- Gate: select the model/configuration and approve measured request budgets. If neither model meets safe quality/performance, report a feasibility gap; do not silently substitute scripts or a paid provider.

### M11 — Contracts, local provider and revision foundations

**Checkpoint2026-10-28:** explicitly approved after M10. Implemented canonical contracts, opt-in local adapter, bounded durable job lifecycle, owner checks/provenance, memory gates and atomic design versions. Backend201 unit/76 e2e pass; frontend build/types/lint pass. Actual inference remains disabled and M10 is not retroactively passed. See [M11 evidence and decisions](M11-AI-FOUNDATION.md).

- Define versioned Zod/OpenAPI AI request/result contracts and generated frontend types first; inspect Nest aliases/conventions before naming implementation files.
- Add an AiModule/provider adapter to the existing Nest backend using native fetch to a fixed, validated local Ollama base URL. Browser calls Nest, never Ollama directly. No new runtime SDK is needed initially.
- Separate provider readiness from the existing core /health status: Ollama down disables AI, not saving or simulation. Do not load a model just to answer a health request.
- Enforce owner checks, bounded payload/output, total request deadline, one global active inference and one owner request; reject excess work with429 instead of an unbounded queue. Explicit cancellation must abort upstream and keep resources accounted for until settled. For the adopted durable202 job protocol, a disconnected browser/lost acknowledgement does not cancel accepted work; replay the same requestId or explicitly cancel. Verify upstream idle before releasing capacity.
- Adopt bounded asynchronous AI job status/polling if measured timings exceed normal API request budgets. Specify ownership, expiry, retry and restart-interruption behavior before implementing that lifecycle. No unlimited prompt/chat retention.
- Persist model identifier/digest, prompt/schema version, referenced design revision and run/input fingerprint with accepted artifacts. Define retention and snapshot reference protection explicitly.
- Introduce immutable design-version support before applying AI changes; safe migrations/backfill establish a baseline for existing designs. Do not invent historical edits unavailable from current data.
- Gate: provider failures, malformed/truncated output, missing model, busy state, cancellation, cross-account access, restart and migration compatibility tested. Existing core flows still work with Ollama stopped.

### M12 — Explain recorded results

Detailed proposal: [M12 explanation scope](M12-EXPLANATION-SCOPE.md). M12A covers disabled-by-default functional integration; M12B requires real-model acceptance after the open M10 follow-up. Neither implementation nor inference is approved by this planning checkpoint.

- Replace the scripted explanation path with real, visibly identified local AI for the open saved design/run. Show what revision/run/model was used and clearly distinguish stale results from current inputs.
- Send a bounded server-derived fact packet: recorded verdict/metrics, selected component/path evidence, traffic, assumptions and numerical-model limitations. User text/labels are untrusted data.
- Use structured evidence references; the server validates references and inserts factual numeric values. Reject unsupported identifiers/metric claims; JSON validity alone is not factual correctness.
- Keep explanations concise: observation, evidence, implication, uncertainty. No request for hidden chain-of-thought. A null bottleneck must remain null; do not manufacture a culprit.
- No saved result means a useful instruction to run the model, not a fabricated explanation. Do not silently trim essential evidence to fit a small context: summarize transparently or reject an unsupported request size.
- Gate: real evidence-grounded answers, accessible pending/cancel/error/retry states and stale-request protection; unavailable AI leaves results readable.

### M13 — Improve: propose, preview, approve and rerun

- Start with small allowlisted edits supported by the catalog, such as replica/property changes. Validate ranges, target IDs and applicability; no arbitrary model-generated JSON Patch or executable code.
- Present concise rationale, exact graph/property diff, assumptions and current revision. Preview does not save. Keep unsaved drafts intact and reject stale proposals rather than merging silently.
- User explicitly approves application. Save with the existing expected-revision/conflict rules and idempotency safeguards, then run the numerical model through its existing bounded scheduler.
- Compare before/after on the same traffic and model version; show improvements, regressions and no-change honestly. Rank by measured improvement only after evaluating candidates; predicted suggestions cannot claim measured gains.
- Keep, revert or try another creates/uses explicit immutable versions. Restore creates a new current revision; it never rewrites previous evidence.
- Gate: no unauthorized/automatic mutation, recoverable409/429/503/lost-save responses, double-click safety, valid undo/restore and correct links to recorded results.

### M14 — Real text-to-architecture drafting

- Upgrade /new/describe to a local AI draft/assumption review while preserving blank/template/import routes and the explicitly labelled scripted option, if retained.
- Begin with a small published graph budget (proposed10nodes/20edges) appropriate to measured hardware. Existing manual graph limits remain unchanged. Larger AI requests get clear validation feedback; limits cannot be implied as arbitrary underlying model support.
- Validate full node/edge/type/property/traffic contracts plus semantic runnable checks. Use deterministic layout rather than trusting coordinates invented by the model.
- Show assumptions and unsupported requirements. Save only after user review. Do not silently turn an invalid draft into a different architecture.
- Extend persisted source/provenance schemas and source enum through a safe migration rather than calling genuine model output scripted. Audit and preserve existing scripted designs.
- Allow at most one explicit bounded repair attempt for invalid output; otherwise return readable failure with retained input. No endless repair loop.
- Gate: schema/semantic failures, prompt injection, request length, foreign IDs, edit/review/save and outage recovery all covered.

### M15 — Designs, History, Notes and Compare

- Complete /designs with owned search, honest filters and sort, duplicate/rename/archive. Mark designs with no result separately; a missing Limits run has no known breaking point. Archive is reversible and does not silently delete evidence.
- History shows available immutable versions and recorded runs; retention is explicit. Legacy baseline is labelled as an imported current snapshot, not reconstructed history. Restore and compare operate only on authorized retained snapshots.
- Notes hold AI assumptions and explicit user decisions linked to versions. AI text is not silently promoted to an accepted user decision.
- Compare two owned designs/versions using identical traffic/model version; mismatches require an explicit rerun or clear incomparability. Include topology/property diff and measured-model metrics. Do not subtract incomparable results.
- Gate: pagination/empty states, retained-version integrity, cross-account isolation, archive/restore conflicts and same-input comparisons verified.

### M16 — Report and controlled read-only sharing

- Build report from an explicitly selected recorded revision/result: graph, traffic, numerical outputs, assumptions, decisions and model limitations. Keep measured model outputs separate from AI commentary; disclose whether Limits was run.
- Use print CSS and the browser's print/Save as PDF flow first, with readable pagination and monochrome output. This is an explicit simplification from the placeholder's direct Download as PDF wording; no automated export engine is promised.
- Owner may issue/revoke a high-entropy read-only snapshot link for design-only or design-plus-report; hash bearer secrets at rest, suppress them in logs/referrers and exclude them from analytics/indexing. Track last-open time with minimal metadata, not visitor profiling.
- Public share endpoints return purpose-built safe DTOs, never owner email, credentials, private notes or unrelated runs. Define which notes are shareable before implementation. No edit, run, AI or role privileges follow from possession of a link.
- Sharing a snapshot does not expose future owner changes. Revocation is checked server-side on each read; a recipient can still retain copies already viewed/exported. Limit caching and explain that boundary accurately.
- Gate: token unpredictability/storage, scope/revocation, expired/missing links, foreign owner operations, DTO leak checks, print pagination and functional report links tested.

### M17 — Integrated acceptance and course demonstration

- Complete the normal loop across real Ollama, owned designs, AI explanation, proposal approval, model rerun, history/compare/notes, print and share/revoke.
- Real model evaluation: at least24 fixed cases, three generations each for the selected configuration. Separate schema acceptance, evidence accuracy, readable explanation and domain usefulness. Record seeds/settings/model digest; low temperature is not a determinism guarantee.
- Proposed quality gate:100% accepted outputs pass schema/reference/metric checks; at least90% rubric-passing useful explanations; zero accepted critical fabricated metric/bottleneck claims, unauthorized changes or private-data disclosures. First-pass schema rate is measured separately; fail-closed rejection must not be counted as a useful answer.
- Browser matrix:1024/1440 light/dark,390 mobile, keyboard and reduced motion. Include real Ollama stop/restart, model unavailable, held generation/cancel, concurrent requests, stale revisions and retained user inputs.
- Run backend build/lint/unit/e2e; frontend build/lint/types/unit and affected browser suites; regenerate/compare live API types; regress Phase1 auth and Phase2 graph/save/run/preview/limits. Verify bounded local responsiveness during inference.
- Update this report, architecture, exact Windows run instructions, AI limitations, test evidence and faculty demo steps. No phase-complete verdict while a required milestone remains unverified.

## 5. Architecture and safety decisions

Browser → authenticated Nest AI endpoint → owned fact/snapshot service → local provider adapter → Ollama. Numerical SimulationModule remains the sole authority for metrics. Existing Postgres stores authorized snapshots/artifacts; Redis continues session/throttle duties. Ollama is optional and local-only, not a new internet-facing service.

Use existing envelopes:422 for invalid input/output with stable detail reasons;401/403/404 for auth/ownership;409 for stale revisions;429 for admission;503 for unavailable/timed-out local inference. Final mappings and OpenAPI examples must be agreed in M11; do not expose raw provider stacks or model prompts in public errors. No secrets, passwords or access tokens enter prompts. Treat generated prose as plain escaped text, not HTML.

Initial requests should be structured, validated responses with progress/pending UI. The old Improve placeholder promises streaming: real token streaming is optional only after bounded cancellation and validation are proven. No fake typing stream or unvalidated actionable token output is required. This is an explicit proposal to prioritize correctness over the placeholder choreography.

## 6. Planning review

**Strengths:** builds on working engine/ownership; uses already installed free models; makes AI central through explanation, proposed changes and drafting; retains the original Improve/history/report/share commitments; keeps the four-role expansion visible.

**Main risks:** low available RAM; small-model factual/graph accuracy;2048-token budgets cannot contain arbitrary50-node graphs; versions/sharing introduce independent persistence/security work; inference may compete with simulation; generated changes may not improve results.

**Mitigation:** M10 is a go/no-go before provider implementation, not a claim that installation proves feasibility. Ground metrics in server evidence, limit candidate edits/graphs, approve mutations, compare actual model results, bound all work and retain drafts. Report model quality limitations openly.

**Delivery recommendation:** approve and execute one milestone at a time, beginning with M10. Explanation is the first useful AI slice; M12 completion is not full Phase3 completion. Schedule/re-estimate after M10 and M13 rather than promising a fixed completion date. If the deadline requires an AI-only phase, explicitly move remaining registry commitments to another phase before changing the completion criteria.

## 7. Approval and continuity

This plan is proposed. M10 was subsequently approved and local generation was evaluated; see its checkpoint above. The user explicitly authorized M11 foundation despite the failed M10 inference gate; this does not authorize enabling unreliable real inference. Later milestones still require approval, and the real-model quality/memory follow-up remains open. The original planning checkpoint performed no downloads, migrations or endpoint changes. M11 subsequently added the documented migration and endpoints under explicit approval; real-model downloads and user-role changes were not performed. Earlier inspection-only statements are historical. GitHub publication is separate.

Future phase work must update [the same living report](STRESSFORGE-PROGRESS-REPORT.md), preserve earlier history/accepted exceptions, record fresh verification evidence and reassess affected previous auth/ownership/simulation requirements. Updates do not happen automatically.

## Primary runtime references checked

- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs): JSON schema output plus independent Zod validation.
- [Ollama chat API](https://docs.ollama.com/api/chat): generation options, structured format and timing metrics.
- [Ollama FAQ](https://docs.ollama.com/faq): context setting and ollama ps GPU-placement inspection.

These document capabilities, not measured suitability of the installed models. Verify exact installed model/runtime behavior in M10.
