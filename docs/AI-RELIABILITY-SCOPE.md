# AI goal reliability — proposed implementation scope

**Date:** 2026-11-03 (Asia/Dhaka). **Baseline:** `1e955b2`, branch `codex/phase2-contracts`.
**Authorization:** the user approved writing this plan and rubric, not implementing them or making live requests. No new model call, provider change, key operation or feature activation is authorized by this document.
**Course decision:** the user reports that faculty requires more reliable AI. The experimental demo and its READY check do not satisfy that outstanding requirement. Faculty acceptance of a successful future capability remains a separate decision.

## Recommendation and bounded outcome

Improve the existing English-language **AI goal reader for verified fixes**, not explanations or describe-to-design. A person states architectural constraints/preferences; the system proposes a precise, editable interpretation; the person confirms it; the existing simulator generates/verifies candidate fixes. Applying a fix remains an explicit draft action, followed by save, run and Compare. AI interprets intent; the server remains the numerical authority.

This is the smallest existing AI path with promising ordinary-language results, not a claim that a small goal box will automatically satisfy faculty's meaning of central AI. Demonstrate a complete natural-language-to-verified-fix workflow and have that role reviewed before declaring course acceptance.

**Target behavior:** preserve genuine wishes in the presence of irrelevant/instruction-like text; distinguish app copies from database read replicas; handle negation, permissions and conflicting preferences; ask for clarification rather than silently inventing intent. A clarification is correct for a genuinely ambiguous goal, not a way to avoid a clear goal that the model misunderstood.

## Confirmed baseline and failure mechanisms

Sources: [Copilot results](AI-COPILOT-SCOPE.md), [previous guard rubric](AI-FIX-INTENT-GUARD-RUBRIC.md), stored `docs/audit/ai-gate/*intent_v2*/run.json`, and inspected code below.

- Latest judged guard attempt: 13/13 ordinary, 3/3 neutral, 6/7 hidden-order goals; required 7/7 hidden-order, therefore NO-GO. Model alone was 4/7 on hidden orders. Prior results and pass marks stay unchanged.
- In the recorded JSON case the model followed embedded fields and missed the legitimate preference. The guard removed the unsupported fields but could not add the missing preference; the final neutral result was wrong.
- `wishClauses` drops an entire sentence when an instruction marker is present. `groundIntent` can only remove model fields, and kind/preference matching is based on word patterns. This suggests clause-scope and ambiguity problems; it does not prove any proposed repair works.
- `AiFixIntentService.interpret` currently runs the raw-goal task, then grounds its answer. The transport is six closed fields, with a 200-character request limit. The frontend applies a returned filter to the choices; new refusal/clarification states must preserve the user's current choices.
- The successful three-request demo preflight at `1e955b2` establishes those examples worked on that occasion, not general reliability.

## Implementation boundaries

| Area | In scope | Preserve / excluded |
| --- | --- | --- |
| Meaning | The existing four exclusion kinds and four preference values; ordinary English paraphrases, scoped negation, mixed text, ambiguity and neutral requests | No new graph/component kind, monetary cost model, multi-language support or arbitrary architecture commands |
| Input handling | Separate genuine wishes from quoted/structured/fake-authority material while retaining valid nearby clauses; bounded processing of the existing 200-character input | No blanket promise of injection immunity; no silent truncation; no increasing limits without justification |
| AI interpretation | One bounded structured call per explicit reading request, compact evidence of which input supports a proposed choice, actual model/prompt/schema provenance | No model-generated metrics, graphs, execution instructions, SQL, free-form advice or unsupported provider fallback |
| Validation | Schema and semantic checks, field-scoped supporting evidence, explicit ambiguity/unsupported/error outcomes | Do not turn keywords into a hidden complete substitute for the model and call that AI success |
| Clarification | Short server-written questions/choices for ambiguity; cancelling or refusing keeps prior controls intact | No unbounded conversation, automatic resubmission or invented model-authored explanation |
| User control | Proposed interpretation and explicit confirmation before changing choices; visible manual fallback; stale/cancelled replies cannot overwrite newer goals or manual edits | No automatic save, application of a fix, calculation or autonomous design changes |
| Evaluation | Offline unit/integration/UI tests, fair no-model baselines, fresh reserved corpus, one separately authorized bounded live gate | No reuse of the seen 17/23 goals as new acceptance evidence; no change to historical gate reports |
| Other AI features | Keep disabled | No explanation retry, drafting retry, F3b, model shopping, fine-tuning, RAG service or paid upgrade |

“Cheapest” can only mean the existing **lightest-change proxy**, explicitly disclosed; it cannot imply measured currency costs. App copies/database replicas with unresolved scope must produce clarification, not an arbitrary exclusion.

## Intended processing sequence (subject to implementation review)

1. Validate request, authentication, task readiness, length and rate/quota admission using the existing task service.
2. Preserve original input for transient interpretation only. Segment/annotate relevant clauses without treating typed code, JSON or fake roles as trusted instructions. Keep source offsets or validated quote references for grounding if needed. Do not store ordinary users' raw text in telemetry.
3. Ask the fixed structured task to propose only the supported filter/preference and a bounded interpretation outcome. Treat all user text and model output as untrusted. Prompt delimiters alone are not a security guarantee.
4. Independently check field meaning and grounding. A cited span must actually be in the person's input and support that particular scope/negation. Reject contradictions, unsupported fields and invalid provenance. Evidence must not merely exist somewhere in the text.
5. If important meaning was lost or remains conflicting/ambiguous, return clarification rather than a neutral success. Deterministic repair may contribute, but it is logged and evaluated against the same pipeline without a model. Do not replace a missing preference silently just to make a test pass.
6. Render interpretation and clarification from server-owned labels; let the person confirm/edit. Only a confirmed interpretation changes the filter. Existing fix generation, numerical verification and draft/save/run behavior stay unchanged.

Keep completion budgeting explicit: the earlier 120-token cap cut off reasoning despite a short JSON answer. Inspect actual supported output/reasoning limits, use the existing adapter budget as the initial candidate unless justified, and freeze the budget before evaluation; never infer an adequate cap just from the visible form size.

Choose the smallest compatible contract after inspecting callers. A clarification/status or evidence representation may require additive Phase 3 DTO changes and regenerated types; preserve existing clients or use an explicit version. Do not modify the frozen Phase 2 contract or add routes beyond the existing registry without a separate scope decision. Actual internal module boundaries are implementation choices, not facts established by this plan.

## Existing integration points to inspect before editing

Paths below are repository-relative and confirmed to exist; they are starting points, not a directive to modify every file.

- `nest-boilerplate/nest-boilerplate/src/modules/ai/tasks/fix-intent.ts` — task prompt, strict form, server labels.
- `.../src/modules/ai/tasks/fix-intent-guard.ts` and its spec — current remove-only grounding and clause parsing.
- `.../src/modules/ai/tasks/fix-intent-rules.ts` — baseline to preserve and compare fairly.
- `.../src/modules/ai/ai-fix-intent.service.ts`, `ai-task.service.ts` and `ai-tasks.controller.ts` — admission, provider invocation and owner/task integration.
- `.../src/common/contracts/phase3/ai-tasks.schema.ts` — request/response boundary and 200-character limit.
- `.../src/modules/ai/evaluation/intent-gate.ts`, `intent-cases.ts`, `intent-cases-v2.ts` — historical gates; do not overwrite them. New grouping/scoring should be separate or explicitly versioned.
- `web/src/lib/ai-fix-goal.ts` and `web/src/components/workspace/suggested-fixes.tsx` — local error scope, availability, experimental copy, filter state and new confirmation/clarification UX.
- `docs/AI-COPILOT-SCOPE.md`, the pre-registered rubrics, canonical contracts/generated types, Evaluation data/page and demo docs — update only after new evidence exists, preserving earlier results.

## Stages and approval boundaries

| Stage | Work and exit evidence | Authorization |
| --- | --- | --- |
| Plan review | This scope and the proposed rubric; agree task boundaries, score thresholds and who authors/reviews the holdout | Current work: complete for review |
| Offline implementation | Versioned candidate, development-only cases, contract/UI/error tests, mutation checks, baseline comparison and recorded candidate hash; no real calls | Requires approval of this scope; not started |
| Corpus registration | New case texts and exact labels, independent review, deterministic baseline scores, shuffled repeat schedule and immutable manifest; candidate frozen before implementer sees reserved texts | Must be complete and committed before live approval; not written in this planning session |
| Live gate | One fixed model/candidate, 48 fresh goals x 2 trials; at most 96 candidate calls plus at most 3 separately budgeted preflight calls, quota permitting | Requires a separate explicit live go with run ID, hashes and budget; not authorized now |
| Integration closure | If gate passes: same-account live UI rehearsal, manual fallback and fault tests, full regression, accurate Evaluation/report updates | Passing the gate does not authorize automatic release/default changes; get user release decision |

If the gate fails, stop the attempt, publish the result and retain the previous off-by-default behavior. Do not immediately retry another model or change goals/pass marks. The next attempt would need a new declared rationale and unseen corpus.

## Verification required before closure

- Backend unit tests: clause retention/removal, app-vs-database scope, negation, contradictions, missing/false evidence, unexpected fields, UTF-8/length boundaries, fake role/JSON content, neutral/clarification outcomes, quota/timeout/cancellation, returned model/version validation. No real calls in automated tests.
- Real PostgreSQL/Redis integration: authentication/ownership, role independence, task switches, quota admission/release and failure accounting, provenance, no mutation of design/run state, no raw goal/key leakage.
- Frontend/component tests: explicit confirmation, clarification, unsupported and technical-failure outcomes, retained manual choices, changing text while a response is pending, manual edits after a request, out-of-order replies, cancellation, double click, keyboard/accessibility and focus.
- Deliberate breaks: bypass semantic grounding; accept a quoted unsupported choice; drop a genuine mixed-text clause; swap app/database kinds; accept a conflicting preference; apply stale/unconfirmed result; lose manual controls on 429/network failure; ignore an incorrect model/version. Each must fail a meaningful test, then be restored.
- Canonical Phase 2 check unchanged; additive Phase 3 and generated types match; backend/web build, non-mutating lint, type check and appropriate full unit/e2e gates pass. Run one heavy workload at a time.
- Browser checks: 1024/1440 light/dark plus narrow layout, manual fallback with AI off, local quota/network/invalid-output failure UI, all roles' unchanged permissions; full installed-Chrome regression after final application changes, and a separate dev-only state run.
- Before a release claim: the frozen live gate passes every row in the rubric, ordinary-language value is demonstrated beyond the fair no-model baseline, and one separately authorized live browser story reaches an explicitly confirmed filter and simulator-verified fix. A backend preflight alone cannot close the milestone.

## Definition of done and decision after this plan

A versioned goal-reading candidate passes the proposed/frozen reliability gate and baseline-value test; all integration/regression/mutation gates pass; the complete live UI flow is observed; defaults, privacy and numerical authority remain intact; documentation distinguishes verified facts from remaining limits. Course acceptance is still for faculty, not inferred from technical counts.

Review the [proposed rubric](AI-RELIABILITY-GATE-RUBRIC.md). No fresh holdout has been created, no new live run has been registered and no implementation has started. Approval of implementation is the next decision; approval of a live run comes later.
