# AI Design Copilot: plan (draft for approval)

**P0 done (2026-11-02): see [AI-COPILOT-SCOPE](AI-COPILOT-SCOPE.md), which corrects this plan** (F3 cannot use the Compare view; F1 builds on the existing scripted draft; F2's AI part is intent-only; a migration is needed for a new design source).

Status: **draft, nothing built, no model called.** Follows the NO-GO on AI-written result explanations ([AI-RESUME-SCOPE](AI-RESUME-SCOPE.md), 2026-11-02), which stays in force: the explanation feature is not revived here.

## 1. Idea in one paragraph

Stop asking a model to write free text about results. Ask it only to turn a person's words into a small, strictly validated structure (a template choice, traffic settings, a goal), then let the application's own validators and its own simulator do the real work and produce every number. The model proposes; the server checks; the simulator measures; the user confirms. Nothing is saved or applied without a click, and every change goes through the existing revision history, so it can be undone.

## 2. Rules this plan keeps (carried over, unchanged)

1. AI is off by default; each feature has its own switch and stays off until it passes its own written gate.
2. The model never supplies a number that is shown as a result. Figures come from the simulator or from the user's own input.
3. Every model output is a strict schema (enums and bounded numbers) validated on the server again; invalid output is refused, not repaired silently.
4. The model proposes, the user confirms; no automatic apply, no automatic save.
5. Only the minimum is sent to the hosted provider, only on an explicit click, with a plain notice (see decision 3 below: this plan adds one new kind of data).
6. No silent fallback between providers; quota guard and per-person daily cap stay (already built).
7. Each feature's pass bar is written before its first live run; every result, including failures, is kept; a failed feature stays off.
8. Lessons applied from the explanation attempt: the model is shown exactly what production sends (one shared builder, pinned by a test); comparisons are computed by the server and given to the model as facts; list lengths and ranges are enforced by us, never assumed from the model; raw replies are kept for every run.

## 3. The four pieces

### F1. Describe-to-design ("start from a sentence")
- **User sees:** on New design, a box: "Describe the system you want to test". They type, for example, "a student portal, about 5,000 users, mostly reads, must stay under 300 ms". A card appears: the suggested template, the traffic settings, a one-line "why" (marked AI-written), with every field editable. **Create design** uses the existing create-from-template path.
- **Model output (strict):** template id (one of the 6 existing templates), traffic fields within tighter ranges than the schema allows (rps, readRatio, burst, sloP95, errorBudget, durationMin, shape), and a short rationale. Nothing else.
- **Server checks:** the template id exists; traffic passes the existing `trafficSchema`; the rationale may mention only numbers that appear in the user's text or in the returned fields; input limited to 500 characters; text that is empty, off-topic or tries to give the model instructions gets a clean "could not suggest" result (and is counted in the gate).
- **Why it counts:** natural language to a validated architecture, end to end, using the real design pipeline.

### F3. Natural-language what-if
- **User sees:** on a result, "Ask a what-if": "what if traffic doubles on Black Friday?". They see the interpreted change as editable chips (traffic x2, shape: spike), then **Run** gives a new run and the existing Compare view shows before and after.
- **Model output (strict):** a change to traffic only: multiplier on rps within 0.1 to 20, optional shape, optional readRatio, optional duration. Nothing that edits the graph.
- **Server checks:** bounds; the change is applied to a copy of the current traffic and run through the existing simulate or live-preview path (the exact path, and whether a temporary traffic override is already supported, is verified in step P0; if not, the run is made against a new revision the user confirms).
- **Why it counts:** the model interprets, the simulator answers; the comparison is the app's own.

### F2. Verified fix suggestions (the headline)
- **Deterministic core (no AI, shippable on its own):** after a Fail or Strained run, the server builds a small list of candidate changes at the bottleneck using operations the graph schema already supports (for example more replicas, more capacity, a cache or split where the schema allows; the exact set is confirmed in P0), simulates each with the real engine (at most 6 candidates, inside the existing run budgets), and ranks them by the measured p95 and error rate. The result is "Try this: +1 app replica, p95 800 to 240 ms", where both numbers come from the engine.
- **AI layer on top:** (a) the user can type a goal, "reduce latency without adding another database", and the model returns a strict intent (priority metric, operations to avoid) that only filters and orders the candidates; (b) optionally one plain sentence per candidate, figure-checked against the engine's numbers. The model cannot add a candidate or change a figure.
- **Apply:** one click creates a new revision of the design with that change (existing patch and history path); Restore and Compare already exist, so it is reversible.
- **Why it counts:** AI plus the project's own simulator in a closed loop, and because the core is deterministic the feature still works if the model fails its gate.

### F4. Honest AI evaluation (Evaluation page tab)
- Shows what was measured: the local-model NO-GO, the hosted explanation NO-GO with the invalid first run disclosed, and the new gates for F1, F3 and F2's intent parser, each with method, counts and raw results. This is the evidence of engineering method, and it is what the faculty can inspect.

## 4. Shared groundwork (built once)

- An `AiTask` pattern on the existing provider, quota guard, provenance and hosted-data wording: one strict transport schema, one server validator, one gate definition per task. The explanation code stays but unused.
- A per-feature switch (`AI_FEATURES=describe,whatif,fixes`), all off by default; readiness says which are available.
- The hosted-data notice generalised: names what is sent for each feature (F1 and F3 send the user's own typed sentence).
- A **demo mode**: saved real responses replayed through the same validators, clearly labelled "Recorded response", so a failed connection or an empty quota cannot sink a presentation. It is never presented as live.

## 5. Gates (pass bars written now, before any run)

Same method as before: synthetic or invented prompts, raw replies kept, blind judging by a written rubric with Claude judging and you checking a random third, every result committed whether pass or fail.

| Feature | Cases | Pass bar |
| --- | --- | --- |
| F1 | 20 prompts: 12 ordinary (across all 6 templates), 3 ambiguous, 2 empty or off-topic, 3 injection attempts | At least 18 of 20 sensible and valid (right template for the description, traffic consistent with the text); 100% of outputs pass server validation or are cleanly refused; 0 injection followed; each answer within 10 s |
| F3 | 16 prompts across spike, growth, read-heavy shift, nonsense, injection | At least 14 of 16 correct direction and size of change; 100% valid or cleanly refused; 0 injection followed |
| F2 intent | 12 goals | At least 11 of 12 correct filter or priority; and a hard, non-statistical check: every improvement figure shown equals a fresh re-simulation of that candidate |
| F2 core | all 6 templates, Fail and Strained cases | Suggestions never make the metric worse than reported; figures identical on re-run (the engine is deterministic) |

A feature that misses its bar stays off, and F2's deterministic core still ships.

## 6. Order of work and commits

| Step | Content | Needs your go |
| --- | --- | --- |
| P0 | Read-only verification of the unknowns above (editable operations in the graph schema, temporary-override support for what-ifs, existing prepare and create path) and a final scope with the exact schemas | Approve this plan, then the scope |
| P1 | `AiTask` groundwork, feature switches, generalised notice, demo mode, tests; no model call | No |
| P2 | F1: backend, validators, UI, browser tests, gate harness (fake provider); then the live F1 gate | Live gate run |
| P3 | F3: same shape | Live gate run |
| P4 | F2: deterministic core and UI first (no AI), then the AI intent and wording layer; then the live F2 intent gate | Live gate run |
| P5 | F4 Evaluation tab with measured results; you read the wording before it ships | Wording |
| P6 | Full regression, demo rehearsal script, docs and handoff | No |

Each step is committed separately, pushed only when you say so, with the protected audit file never staged.

## 7. Demo script (about 6 minutes)

1. Type a sentence on New design, show the suggested template and traffic, create it. (F1)
2. Run the test, show a Fail, open **Suggested fixes**, show three candidates each with before and after figures from re-simulation, apply one as a new revision, show Compare. (F2)
3. Ask "what if traffic doubles?", show the interpreted chips, run it, show Compare. (F3)
4. Open Evaluation, show the honest results including the earlier NO-GO and how the gates work. (F4)
5. If the network is down, switch to recorded mode (labelled) and run the same flow.

## 8. Costs and limits

Free Groq tier only, no card, no paid upgrade, no second account. Each task call is small (about 500 to 700 tokens), so the free quota supports hundreds of demonstrations a day; the existing guard stays at 80% of the published limits with a 50-a-day cap per person. A model change (`gpt-oss-120b`) is allowed only if `gpt-oss-20b` fails a gate, and then as a recorded comparison.

## 9. Risks

- **A model may fail a gate.** Then that feature stays off; F2's core still ships; the Evaluation tab says so.
- **Injection through the typed sentence** is the new risk surface. Mitigation: strict schema, enum and range output, server validation, nothing executed, and injection cases are in the gate. No general injection-resistance claim will be made.
- **Scope size.** F2 is the largest. If time is short, order F1, then F2 core, then F3.
- **Unknowns in P0** (graph operations, what-if override) could change F2 and F3 details; the plan is meant to be adjusted by P0's findings, not to be treated as final.
- **Faculty perception is a guess.** If you have the marking criteria, tell me and I will reorder the work to match.

## 10. Decisions needed

1. **Package and order.** Recommended: F1, F3, F2 (core first), then F4. Alternative: F2 core first (no AI, de-risks the headline).
2. **Provider.** Recommended: Groq free tier, `gpt-oss-20b`, as before.
3. **New data category.** F1 and F3 send the user's own typed sentence (500 characters at most, no account data, a visible notice, a warning not to type secrets; Groq's retention terms apply and Zero Data Retention is on for your account). Recommended: approve with the notice. Alternative: a per-account opt-in in Settings.
4. **Never auto-apply.** Recommended: confirm every change (default).
5. **Per-feature gates** as in section 5. Recommended: approve as written. Alternative: looser bars (I advise against).
6. **Demo mode** with recorded, labelled responses. Recommended: yes.
7. **Rule-based result summary** in the interface (the earlier open question). Independent of this plan; recommended: show it, labelled "Rule-based summary, no AI".
8. **Live runs.** Live gate runs only on your explicit go each time (as now).
