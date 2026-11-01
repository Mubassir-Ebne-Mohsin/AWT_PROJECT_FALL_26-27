# AI resume scope: real explanations from a hosted model (M12B), on Groq's free tier

Prepared 2026-11-01. Status: **all ten decisions approved 2026-11-01 ("Approve all", as recommended).** Commit one (provider interface, reviewed Groq adapter, settings, tests) is built; commits two to five are not. Nothing is enabled and no hosted call has been made. The user chose, on 2026-11-01, to proceed with **Groq's free tier and `openai/gpt-oss-20b`** after comparing options (a ChatGPT Pro subscription does not include API access, so it is a development aid and not the app's AI). This is the explicit instruction that [AI-DEFERRAL-PLAN](AI-DEFERRAL-PLAN.md) requires before AI work resumes. It narrows that plan to **M12B only**: making "Explain this result" work with a real model and proving it on evidence. M13 (fix suggestions) and M14 (drafting from words) stay parked until M12B has a result and each has its own scope.

## 1. Where AI stands today (verified in the code)

| Piece | State |
| --- | --- |
| M10 local models | NO-GO: `qwen2.5:1.5b` gave the required shape in 1 of 8 cases and passed 0 of 8; `llama3.2:3b` gave the shape in 8 of 8 and passed 0 of 8 ([M10](M10-LOCAL-AI-FEASIBILITY.md)). The eight cases (healthy, strained, failed, no bottleneck, shared database, obsolete result, missing inputs, malicious label instructions) and their results are preserved and are the benchmark here |
| M11 backend (durable jobs, readiness, owner checks, versions) | Committed. `AI_ENABLED=false` by default |
| M12A (verified facts, evidence endpoint, typed server-checked claims, explanation drawer) | Committed (`fe5c01a`, `4ad4481`, `4aa48c1`). Provider-independent. The UI shows nothing unless the backend reports AI enabled |
| Provider used by the service | **Ollama only.** `ai.service.ts` calls `OllamaProvider` directly (`metadata`, `idle`, `generate`, `unload`), so Groq cannot be plugged in without an abstraction |
| Groq transport | A 119-line draft in `groq.provider.ts` with an 89-line spec, **written by Codex, uncommitted, not wired in**. It uses a fixed HTTPS origin, rejects redirects, asks for a strict JSON schema, bounds the request (12 KB) and response (64 KB), maps 429 with `Retry-After`, requires `finish_reason: stop` and checks the returned model name. It needs review before it is trusted |
| Real-model gate, quotas, provenance, hosted-data wording | Not built |
| Free-tier limits | The roadmap (from Groq's own docs, 2026-10-29) lists 30 requests a minute, 1,000 a day, 8,000 tokens a minute and 200,000 a day for the model. A later search found a source that lists no daily token cap, so **the account's own limits page is the authority** |

## 2. What this slice delivers

1. A **provider interface** with an Ollama adapter (existing behaviour, unchanged) and a Groq adapter, chosen by configuration (`disabled`, `ollama`, `groq`), never switching silently.
2. **Quota and concurrency control** so a free account is not exhausted: one generation at a time, a bounded queue, a shared daily budget kept in Redis with a safety margin, `Retry-After` honoured, and plain inline errors in the explanation drawer.
3. **Honest provenance and wording:** every explanation records provider, requested and returned model, prompt and schema versions, usage and latency; the drawer says it is hosted by Groq and what leaves the machine.
4. A **rule-based explanation baseline**, written from the same verified facts, so the model is compared with something and the evaluation can say "better or worse than a simple rule".
5. An **evaluation harness** that runs the eight cases, three generations each, through any provider and records every result, including every failure.
6. The **real-model gate** run on synthetic cases, and the Evaluation page's AI tab updated with the measured results.

## 3. Decisions needed (recommendation first)

1. **Scope.** Recommended: M12B only (explanations), as above. Alternative: also scope M13 and M14 now (more to review at once, and neither can be judged before the gate shows whether the model is good enough).
2. **What is sent to Groq.** Recommended: only the bounded fact bundle that `grounding.ts` already builds and the drawer already shows (numbers and component names for one run), on the user's explicit "Explain" click, with a one-line notice "Sent to Groq (hosted): the facts shown below". No raw design JSON, no account data. Alternative: an extra per-account opt-in in Settings, AI usage (stricter, more clicks).
3. **Account and key.** Recommended: you create a free Groq account (no card), put `GROQ_API_KEY` in the **backend** `.env` yourself, and tell me what the console says for the model's availability and limits (never the key). I never read, print or log `.env` values. A paid upgrade, auto-recharge or a second account to get around limits is out of bounds.
4. **The Codex draft.** Recommended: review `groq.provider.ts` and its spec line by line, fix what is wrong, and commit it with tests under this scope (it already follows the right security shape). Alternative: rewrite it from the roadmap (slower, same result).
5. **Provider abstraction.** Recommended: a small interface (`readiness`, `identity`, `generate`) with the two adapters; Ollama-specific memory guards stay inside the Ollama adapter; no silent fallback between providers. Alternative: drop Ollama entirely (smaller, but loses the offline option).
6. **Quota policy.** Recommended: one active generation, a short queue, use at most 80% of the published per-minute and per-day limits (read from configuration so they can follow what your console shows), no automatic retries of a generation after an ambiguous failure, and a per-user limit so one person cannot spend the budget. Alternative: no shared budget (simplest, but a free account can run dry mid-demo).
7. **Rule-based baseline.** Recommended: build it now for the comparison, and decide after the gate whether to show it in the UI as a clearly labelled fallback ("Rule-based summary, no AI"). Alternative: skip it (then the evaluation has nothing to compare the model against).
8. **The gate.** Recommended: the thresholds already written in the roadmap. Every accepted explanation passes identity, schema and claim checks; at least 90% of the 24 answers (8 cases x 3 generations) are judged useful; zero accepted answers contain a fabricated critical figure or bottleneck; each answer arrives within 30 seconds. `gpt-oss-20b` first; `gpt-oss-120b` only if 20b fails, and then as a measured comparison. Synthetic evidence only. Rejections are kept and counted, never hidden. Alternative: looser targets (I advise against: the gate is what stops a hosted model being turned on because it is fast).
9. **Who judges "useful".** Recommended: the deterministic claim check runs automatically; a written three-question rubric (is it about this result, does it name the real bottleneck or say there is none, is every number one of the supplied facts) is applied by me to all 24 answers with the model's identity hidden, and you check a random third of them blind; where we disagree you decide. Alternative: you judge all 24 (about twenty minutes, fully independent).
10. **Slicing.** Recommended: five commits, pushed only when you say so. (1) provider interface, Ollama adapter, reviewed Groq adapter, settings, tests on a mocked transport (no key and no network needed); (2) quota, concurrency, error mapping, provenance and the hosted-data wording; (3) the rule-based baseline and the evaluation harness, tested with a fake provider; (4) the live gate run (needs the key and your go for that run), with every result committed; (5) the AI tab on the Evaluation page and the docs. You read the AI tab wording before it ships.

## 4. Test plan

- **No network in tests.** The Groq adapter is tested with an injected transport: a valid reply, a missing key, 401, 429 with and without `Retry-After`, 5xx, a timeout, a body over the bound, invalid JSON, a refusal, a wrong returned model, `finish_reason` other than `stop`, a redirect, and a request over the size bound.
- **The service:** with `AI_ENABLED=false` or provider `disabled` nothing AI-related renders and core saving, simulation and health work (the existing e2e check stays); no silent switch between providers; one active generation; the shared budget refuses cleanly and recovers; a retry after a lost acknowledgement does not submit twice; restarts leave jobs interrupted, not half-done.
- **Grounding and claims** (unchanged from M12A): stale and missing-input results are rejected before any provider call and recorded as application validation, not model reasoning; a model answer with a figure that is not in the facts is rejected.
- **The baseline:** same facts in, same sentences out, and every figure in it is one of the facts; tested against the eight cases.
- **The harness:** a fake provider that is right, wrong and slow proves the gate arithmetic (counts, percentages, thresholds) before any real call.
- **Browser:** the drawer with AI off, on, busy, over quota, offline and session-expired, at four widths, keyboard and reduced motion; unsaved edits stay untouched.
- **Deliberate breaks:** claim check off, a figure accepted that is not a fact, redirect followed, response bound removed, model-name check removed, a retry that resubmits, the budget ignored, a silent provider fallback.
- **The live run:** only after you confirm the key is in place and say go; sequential, within the limits, synthetic cases, every request and response kept.
- The usual gates: type check, lint, all unit and e2e tests, both contract checks, the full Chrome regression, commit by path, the protected audit file never staged.

## 5. Not in scope

M13 and M14; paid plans, extra accounts or any cost; sending a private design or any account data; changing the simulation engine; a general chatbot ("AI assistant" panel stays scripted and labelled); using a ChatGPT login to power the app.

## 6. Risks

- **The model may not pass.** `gpt-oss-20b` is much larger than the local models that failed, but it is untested here. If it fails the gate, the result is a written NO-GO with the numbers, then `gpt-oss-120b` as a comparison; the rule-based baseline remains useful either way.
- **Free-tier limits can change or differ from the docs.** Hence the configurable limits, the safety margin and the console check.
- **Data leaves the machine.** Only the bounded facts, only on an explicit click, with a notice; Groq's own retention terms apply (the roadmap notes up to 30 days for abuse and reliability exceptions) and the notice says so.
- **Prompt injection through labels.** A component label is user text. The malicious-label case is in the gate and the claim check rejects figures that are not facts, but no general injection-resistance claim will be made.
- **Two agents share this tree.** Codex wrote the draft and a checkpoint in the report that conflicts with the "AI parked" decision. This scope replaces that ambiguity: while it runs, `modules/ai` is changed by one agent at a time, and any Codex work there is recorded in the handoff log first.

## Commit one result (2026-11-01): the provider interface and the reviewed Groq adapter
**Built:** `provider.ts` (the `ExplanationProvider` interface, the shared prompt, the explicit "digest unavailable" marker for hosted models), `groq.provider.ts` (reviewed and rewritten), `provider.factory.ts` (the provider the configuration names, never a silent fallback), new settings `AI_PROVIDER`, `GROQ_MODEL`, `GROQ_API_KEY` (the key lives in its own token, never in the settings object that readiness and logs can reach; `.env` is git-ignored and `.env.example` has an empty placeholder). `OllamaProvider` implements the same interface with its behaviour unchanged. `AiService` depends on the interface: the host-memory guards, the memory monitor and the "idle" check apply only to a local model, and a hosted model is recorded with an explicit "hosted-model-digest-unavailable" marker rather than an invented digest. Defaults are unchanged: Ollama, AI off.
**What the review of the Codex draft found and changed:**
1. The schema sent in strict mode was generated from the application schema, whose `claims` is optional; Groq's strict mode says optional fields are not supported, so it would likely have been rejected. It is now written by hand (every property required, no extras) and a test ties it to the application schema.
2. The draft did not check that cited evidence ids were among those supplied (the Ollama path does). Added.
3. Reasoning text came back in every reply by default. Now `include_reasoning: false` and `reasoning_effort: low`; `max_completion_tokens` raised from 1,024 to 2,048 because Groq's docs do not say whether reasoning tokens count against it.
4. A hosted model other than the configured one was reported as bad output; it is now reported as a changed model.
5. 401 and 403 are now distinguished from other failures; the upstream message is never repeated; a deadline or cancel during the read is no longer disguised as bad output.
6. The draft built its own messages; every provider now gets the same instruction and facts, so the gate compares models and not prompts. Temperature 0 and a seed (best effort) added for repeatability.
**Evidence:** AI unit specs 36 for the adapter, 4 for selection, 11 for settings, with all the Ollama specs unchanged; backend unit 327 pass (2 old opt-in skips); full e2e 259 pass in 19 suites; the 21 existing AI e2e tests pass unchanged and 6 new ones cover a hosted provider (ignores host memory pressure and is not aborted by it during a 5.6 second generation, records the explicit digest marker, never touches the local runner, provider outage frees the slot, changed model, missing key); both contract checks identical; type check and lint clean; **29 deliberate breaks, 27 caught first time, 2 survivors** (a refusal alongside valid content; the response size bound, which my test had satisfied by sending invalid JSON), both fixed with new tests and then caught.
**Unverified until the live run (a mocked network cannot answer these):** that Groq accepts the schema as written; that the model name it returns equals the one requested; whether reasoning tokens count against the output limit; whether `seed` is honoured. The account limits the user reported (30 requests a minute, 1,000 a day, 8,000 tokens a minute, 200,000 a day for `gpt-oss-20b`) match the scope's assumptions, and commit two will use 80% of them.
**Not done:** quota and concurrency control, provenance fields and the hosted-data wording (commit two), the rule-based baseline and harness (commit three), the live gate (commit four, needs the key and the user's go), the AI tab (commit five).
