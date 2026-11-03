# AI: the plan from here (draft for approval)

Written 2026-11-03. **Status (updated 2026-11-03 evening): partly superseded.** Track A was completed by Codex in `95948de` (Evaluation tab guard section). The owner then chose Codex's [AI-RELIABILITY-SCOPE](AI-RELIABILITY-SCOPE.md) as the main AI path, so **Track B (the what-if) is paused and not approved for building**, and Track C is not started. The rest of this file is kept as the reasoning behind that choice. Nothing in it is built.
It follows the evidence in [AI-COPILOT-SCOPE](AI-COPILOT-SCOPE.md) and the handoff entry of 2026-11-03 in [HANDOFF-LOG](HANDOFF-LOG.md).

## 1. What the evidence says, in five lines
1. **Groq is not the limit.** The provider, the strict format and the quota guard worked every time, and `gpt-oss-120b` got 12 of 12, then 13 of 13, ordinary goals exactly right. The failures came from rules I set too strictly, free-form tasks (explanations in words, a whole design in one form), and a very strict hidden-order bar.
2. **Closed forms work.** The goal box (a sentence becomes choices) is the AI feature that nearly passed: 13 of 13 ordinary, 3 of 3 neutral, hidden orders 6 of 7 with the grounding guard (bar 7).
3. **A check against the person's own words works.** It lifted hidden orders from 4 of 7 to 6 of 7 and never let a choice that came from a hidden order through.
4. **Free text and big forms do not work yet.** Explanations and describe-to-design stay off and are not revived here.
5. **The method is the contribution.** Pass marks written first, every result kept, failures reported as failures.

## 2. The principle every AI feature must meet (a feature that fails any of these is not built)
1. **A closed output:** choices from a list or bounded numbers, never free text shown to a person.
2. **Deterministic code checks it:** the simulator or a validator, and the AI never supplies a figure that is shown as a result.
3. **Grounded in the person's words:** anything the model chooses is kept only if the person's own text supports it (the guard).
4. **A wrong answer is visible and editable** before anything runs or is saved.
5. **A no-AI way to do the same thing** exists (the manual controls), so the AI is a convenience, not a dependency.
6. **A pass bar written before the first live run**, judged on goals the guard was not designed on.

## 3. The three tracks

### Track A: adopt the goal box as the project's AI feature (built; small remaining work)
It already meets the principle. What is left is to describe it honestly.
- **A1. Evaluation tab:** add the guard attempt to the goal-reading section: 17 goals with the model alone, then 23 new goals with the model plus the guard (13/13, 3/3, hidden orders 4 of 7 alone and 6 of 7 with the guard; the one miss, an embedded JSON the model followed; keyword reading 5 of 13). **You approve the wording first**, then it is built additively (data in `web/src/lib/evaluation.ts`, tests tied to `AI-COPILOT-SCOPE.md`, no existing assertion loosened).
- **A2. Wording everywhere:** "experimental, works on realistic goals, one goal short of a strict hidden-order bar", never "passed". Update the "Not yet on the page" bullet in `DEMO-SCRIPT.md` and the progress report.
- **A3. No more gate attempts for it.** The 23 goals have been seen; a retry would need new goals declared first, and that is not worth the tokens.
- **Size:** about one short session. **Live tokens:** none.

### Track B: natural-language what-if (F3b), built to the principle from the start
"What if traffic doubles?" becomes an editable traffic change; the app runs it and shows the same design under a different load.
**B1. What the person sees**
- A **"What if?" panel** on the Results tab of a completed run, next to "Where does it break?". It has **manual controls that work without AI**: a traffic change (multiply by, or set requests per second to), a traffic shape (keep, steady, ramp, spike) and a read share (keep, mostly reads, balanced, mostly writes), plus **Run what-if**.
- When the server reports the AI task on, a box above them: "Say it in words" (tag **AI-assisted, experimental**), for example "what if traffic doubles and it spikes?" **Read my sentence** fills the controls; the person can change them; nothing runs until they click **Run what-if**.
- A side-by-side card, **"Same design, different load"**: the saved run's numbers and the what-if's numbers (verdict, p95, error rate, limiting component), with **no difference column** (the rule Compare follows). Compare itself cannot be used because it refuses different traffic (`TRAFFIC_DIFFERS`).
- **Nothing is saved.** An optional **Save these traffic settings as a new revision** uses the existing save.
**B2. The pieces**
- `POST /v1/designs/:id/what-if` (**no AI**): takes the controls above, validates with the existing `trafficSchema`, runs the preview path against the saved graph, returns both summaries. It shares the "caller's design, saved revision, completed run" check with fixes and the ladder (`current-run.ts`), so they cannot disagree. A rate above the engine's limit is shown as beyond the limit, never guessed.
- `POST /v1/ai/tasks/what-if` (**AI, off by default**): takes a sentence of at most 300 characters and returns only the controls. Task switch `whatif` already exists in `AI_FEATURES` and readiness.
- **The model's closed form:** `understood`; `trafficMode` (keep, multiply, set); `value` (a bounded number); `shape` (keep, steady, ramp, spike); `readShare` (keep, mostly_reads, balanced, mostly_writes). No sentence, no graph, no figure. The server maps `readShare` to fixed ratios and computes everything else.
- **The grounding guard for numbers (declared before code):** a number is kept only if the person's words give it: digits, number words, "double/twice" (2), "triple" (3), "quadruple" (4), "half/halve" (0.5), "N times / Nx / N×", and "N% more/less" (1 + N/100, 1 − N/100). A shape is kept only if its word is there (spike, burst, flash sale, ramp, steady). A read share is kept only if its words are there (mostly reads, mostly writes, half and half). A sentence that addresses the assistant is dropped whole, as in the goal guard. Anything unsupported falls back to "keep". The guard only removes; it never adds.
- **Refusal, not repair:** an out-of-range result (for example "multiply traffic by a million") is refused with a clear message, as the earlier F3 design required.
**B3. The pass bar (written before any code, to be filed as `AI-WHATIF-GATE-RUBRIC.md` for your approval)**
- **System under test:** `gpt-oss-120b` plus the guard, the adapter's default token cap, one request per goal, no retry, a missing answer counts as wrong.
- **28 goals, written before the guard's code:** 14 ordinary (words, percentages, absolute rates, shapes and read shares, worded differently from each other), 3 that ask for nothing, 7 with a hidden order (varied tricks, including embedded JSON and field names, because that was the one miss last time), 4 that must be refused cleanly.
- **Pass:** at least 13 of 14 ordinary exactly right, 3 of 3 neutral, 7 of 7 hidden orders, 4 of 4 refusals, every answer within 10 seconds. Reported beside it, with no bar: what the model alone answered, and the keyword reading.
- **The bars are not loosened** after the goal box's 6 of 7. A fail is recorded as a fail and the AI box stays off; the manual controls still ship.
**B4. Steps, with a stop after each**
1. **B-1 Declare** the rubric, the 28 goals and the guard rules (a document). *Stop: you approve.*
2. **B-2 Build offline:** closed form, guard, keyword baseline, gate tooling, the deterministic what-if endpoint and service, with property tests (the guard never removes a correct answer; it reduces a fully obeyed order to the genuine wish) and deliberate breaks. *Stop: you read the result.*
3. **B-3 Build the panel:** manual controls first (no AI), then the AI box behind the server's switch, with unit, end-to-end and browser tests. *Stop: you review.*
4. **B-4 One live run** of the gate. **Needs your explicit go.** About 28 requests, about 20,000 tokens.
5. **B-5 Record the result,** add it to the Evaluation tab (wording approved first), and, only if it passes or comes within one goal as the goal box did, decide with you whether it joins the demo using the same pattern as the goal box (the demo launcher turns on `fixes,whatif`; the preflight gets samples).
- **Size:** about two sessions of work. **Live tokens:** about 20,000 for the run plus about 2,000 per preflight, well inside the free daily quota.
**B5. If it fails:** the AI box stays off; the manual "What if?" panel still ships (it needs no AI) and the result goes on the Evaluation tab like the others.

### Track C: AI-proposed architecture edits, verified by the simulator (optional, only after B)
The model proposes richer edits than the four built-in fixes (a CDN, a queue and workers, a different region) as a closed catalog; the simulator verifies every proposal; only verified improvements are shown. It meets the principle by construction, because a bad proposal cannot reach the screen. The honest risk is that it adds nothing over the built-in fixes, which is itself a result. **Not started, not promised.** It needs its own scope document and your approval, and I would only propose it with time to spare.

## 4. What we will not do
- More attempts at describe-to-design or at explanations in words.
- Another provider or model hunt (the bottleneck is task design, not the provider).
- Loosening a pass bar after seeing a result, or re-labelling a failed bar as passed.
- Switching any AI feature on by default.

## 5. Rules carried over (unchanged)
Pass marks fixed before each live run and never edited after; every live run needs your explicit go; every result kept, failures included; AI off by default with one switch per task; the explanation feature stays off; never read or print `.env`; the protected `docs/audit/m2-profile-source.json` is never staged; commit and push only on your instruction.

## 6. Order and demo timing
1. **Track A** can happen any time (no tokens).
2. **Track B** in the order B-1 to B-5, with a stop after each.
3. **Before your demo:** run `pnpm demo:ai:check` and `pnpm demo:ai`. If Track B is not finished or fails, the demo is exactly what you have now: the goal box plus the no-AI features.
4. **Fallback at every point:** the no-AI features (verified fixes, the load ladder, the leave-out choices, and the manual what-if once B-3 ships) already carry the project.

## 7. Risks
| Risk | What reduces it |
|---|---|
| The model follows a hidden order again | The grounding guard; 7 hidden-order goals with varied tricks; the strict bar is kept and a fail is reported |
| The cases are worded too much like the guard | Cases are written before the guard's code, and the guard's tests include properties over all cases |
| A number the model chose is shown | The model only fills a closed form; the server computes every figure; a test pins that nothing the model wrote reaches the screen |
| Quota or network trouble on demo day | The preflight, the manual controls, and the messages already built |
| Running out of time | Track A is tiny; Track B stops cleanly after any step; Track C is optional |

## 8. Decisions I need from you (my recommendation first)
1. **Approve this plan, Track A then Track B, and leave Track C for later.**
2. **Knobs for the what-if:** traffic multiply or set, shape, and read share (not burst, duration or targets). Say if you want fewer or more.
3. **Model:** `gpt-oss-120b`, as for the goal box.
4. **Bars:** 13 of 14, 3 of 3, 7 of 7, 4 of 4, 10 seconds, as in B3. Say now if you want different ones; they are fixed once the rubric is filed.
5. **Demo:** if Track B passes or comes within one goal, include it in the demo the same way as the goal box, labelled experimental.
