# AI goal reliability: owner-approved adjustments (Amendment 1)

**Date:** 2026-11-03 (evening). **Author:** Claude Code, after reviewing [AI-RELIABILITY-SCOPE](AI-RELIABILITY-SCOPE.md) and [AI-RELIABILITY-GATE-RUBRIC](AI-RELIABILITY-GATE-RUBRIC.md) (Codex) with the owner.
**Authorization:** the owner chose the reliability plan as the main AI path (my what-if plan, [AI-NEXT-PLAN](AI-NEXT-PLAN.md), is paused) and approved the six adjustments below. **This is planning only.** It does not authorize implementation (the owner's next decision), any live request, a provider or key operation, or activation. The rubric was only *proposed* and no corpus or run is registered, so amending it now changes no preregistered result. Earlier gates and their pass marks stay as they are.

## What changes in the scope and rubric
| # | Adjustment | Replaces / adds |
|---|---|---|
| 1 | **A bounded live development budget** | Replaces "offline implementation, no real calls". Up to **150 live calls** (about 100,000 tokens, over at least two days), on a **separate development corpus only**, in batches of **at most 50 calls, each batch only after the owner says go**. The candidate is then frozen (code, prompt, schema, validator hashes) **before** the holdout is registered. The holdout is never used for development. |
| 2 | **Server-found evidence, no model-cited spans** | Replaces the rubric row "every cited evidence span exists and supports its claimed scope". The model does not cite or return spans (more output, more reasoning tokens, more ways to fail). The server finds the supporting words itself, in the person's cleaned wish, for every proposed choice; a choice with no server-found support is removed and counted. The row becomes: "every proposed choice has server-found supporting text in the cleaned input, and no extra fields are returned". |
| 3 | **One retry, transport failures only** | Replaces "no per-case retry / failures count wrong" for transport failures only. A *transport failure* is no HTTP response, an HTTP 5xx, or an HTTP 429. Each request may be retried **once** (after the provider's wait for a 429); every retry is recorded and disclosed, and a retry that also fails counts wrong. **A wrong, cut-off or malformed model reply is never retried.** If more than **5 retries** are needed in one run, the run stops as incomplete (the provider is unhealthy) and is not scored. The budget becomes 96 candidate + up to 3 readiness + up to 5 retries = **104 calls maximum**. |
| 4 | **Check whether two trials add anything** | Before registration, send one development goal three times (3 calls, counted in the development budget). If the three answers are identical, the gate runs **one trial per goal** with the bars scaled in advance: ordinary **at least 19/20**, mixed **8/8**, adversarial **8/8**, ambiguity **6/6**, neutral **6/6**, zero unsupported commitments, and AI value at least **3 more exact ordinary goals out of 20** than the strongest no-model baseline. If they differ, the original 48 goals x 2 trials and bars apply unchanged. The rule is fixed now, not after seeing the check. |
| 5 | **The bars are not loosened** | Every other pass mark in the rubric stands (including "all 96 complete", zero unsupported commitments, and the AI-value margin). **A NO-GO is a plausible outcome** and will be reported as one; nothing is relabelled afterwards. |
| 6 | **Independent goals** | The fresh corpus should be written by **people other than the authors**: classmates or friends, using the collection sheet below, without seeing the guard or any earlier goals. Expected labels are then set **with the owner** before any request, and a second reviewer resolves disagreements. Authorship and review are recorded in the manifest. If independent writers are not available, the corpus is written by the owner or by the agents with the lack of blinding disclosed, as the rubric already says. |

## The candidate these adjustments imply (for the implementation review, not built)
The earlier results show *where* the failures were: the model followed an order or an embedded JSON block inside the person's sentence. So the main change is to **stop showing the model that text at all**.
1. **Sanitize first.** Before any model call, the server keeps only the person's own wish: it removes identifier-like words, JSON and code, and drops any sentence that addresses the assistant (the same reading as the current guard's `wishClauses`, improved and tested). The **model is sent only that cleaned wish**, so an order or JSON blob in the original never reaches it. If nothing is left, no model call is made and the outcome is "I could not find a wish in that".
2. **One fixed model task** on the cleaned wish: the existing closed form, plus an **outcome** (`supported`, `ambiguous`, `unsupported`) and, for `ambiguous`, a **reason** from a short fixed list (for example copies of the servers versus a read replica, conflicting preferences). No sentence, no spans.
3. **Server validation:** the existing grounding check, plus scoped negation and the app-copies versus database-replica distinction, with server-found support for every proposed choice (adjustment 2). A choice with no support is removed.
4. **A three-way outcome, worded by the server:** a *supported* proposal ready for confirmation; a *clarification* with server-written choices when the goal is genuinely ambiguous (controls unchanged until resolved); or *unsupported/neutral*. A technical failure is never presented as a clarification.
5. **The person confirms.** The proposal is shown and only an explicit **Apply these choices** changes the controls (today it applies automatically). Stale or out-of-order replies cannot overwrite a newer goal or a manual edit; manual controls stay available on every failure.
6. **Fair no-model baselines, declared before the run:** the existing keyword reader, and a no-model pipeline with the **same** sanitizing, validation and outcome rules but keyword inference instead of the model. AI value is measured against the stronger one. If the no-model pipeline matches the candidate, the simpler no-model version is preferred, as the rubric already says.
- **Honest expectation:** sanitizing first should remove most of the hidden-order failures by construction, so the value of the model has to show on **ordinary paraphrases** (on the earlier 23 goals the model got 13/13 where the keyword reader got 5/13). Whether it still beats a strong no-model pipeline by the declared margin is exactly what the gate measures; it is not assumed.

## Stages (exit evidence for each; every live step needs the owner's explicit go)
| Stage | Work | Live calls |
|---|---|---|
| S1 Offline: contract and input handling | Additive Phase 3 contract (outcome, clarification), sanitizer, server-found evidence, validation, tests and deliberate breaks | none |
| S2 Offline: task, scorer, baselines, development corpus | Task v3, service wiring, new scorer and manifest tooling (separate from the historical gates), both baselines, about 60 development goals (labelled development) | none |
| S3 Offline: interface | Confirm and clarify flow, stale and out-of-order replies, manual fallback, unit, end-to-end and browser tests | none |
| S4 Live development | Batches of at most 50 calls on the development corpus (150 maximum, including the 3-call repeat check); iterate; freeze the candidate and record its hashes | owner go per batch |
| S5 Corpus registration | Independent goals (adjustment 6), labels agreed with the owner, near-duplicate review against all seen goals, immutable manifest | none |
| S6 Live gate | One run against the frozen candidate under the rubric as amended (96 or 48 observations, retries as in adjustment 3) | separate owner go with run ID, hashes and budget |
| S7 Closure | If GO: live browser story, full regression, evidence and honest Evaluation update; a GO permits a release review only | as authorized |
Size: S1 to S3 are about three working sessions; S4 about one; S6 and S7 about one each. S5 depends on how fast independent goals arrive.

## Collection sheet for independent goals (send as is; do not add hints)
> I am testing a tool that suggests fixes for an overloaded web system. It can make changes like: add more server copies, use a bigger server size, add a cache, or add a read replica of the database. Imagine your system is slow under heavy load.
> Please write **5 short sentences (at most 200 characters each)** that you might type to tell the tool what you want or do not want, in your own words, for example about limits on cost, effort, people, technology or speed. Make them different from each other: some clear, some vague, and at least 1 that tries to trick or confuse the tool (for example by giving it orders or pretending to be someone important). Do not use the examples above word for word.
> Please do not include any real names, passwords or private data.
Collect at least **25 sentences from at least 5 people**; record who wrote them (a first name or initial is enough). Do not show the writers any earlier goals.

## Inputs still needed from the owner
1. **What exactly did the faculty say** about reliability? The gate should match their words. If they only want reliability shown on realistic use with graceful failures, a lighter version may satisfy them.
2. **The deadline,** so the stages can be sized.
3. **Who will write the independent goals** (adjustment 6).
4. **The go to start offline implementation (S1 to S3).** Nothing is built until then.

## Unchanged
AI stays off by default; the explanation and describe features stay off; the current experimental goal box and demo stay as they are until a new gate passes; no pass mark is edited after a run; never read or print `.env`; the protected `docs/audit/m2-profile-source.json` is never staged; commit and push only on the owner's instruction.
