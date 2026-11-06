# AI features for 8 November: plan (draft for the owner's approval)

**Written 2026-11-03 (evening). Deadline: 8 November 2026.** The owner's words: the faculty wants to see **fully operational AI features**. The owner chose three features and a **live demo by the owner**. Nothing here is built yet and no model is called until the owner approves this plan and says go for each live batch.
This **compresses** [AI-RELIABILITY-SCOPE](AI-RELIABILITY-SCOPE.md) and [AI-RELIABILITY-ADJUSTMENTS](AI-RELIABILITY-ADJUSTMENTS.md) to fit five days: those documents describe a separate gate per feature, which does not fit. Where this file differs (a single combined acceptance run), it is the one that applies, and it says so openly.

## Current handoff note — 2026-11-05

The owner reports that the deadline was extended; a replacement date is unknown. The calendar below is historical. The three implementations now have development evidence, but acceptance is still pending independent writer inputs, confirmed bars and explicit live authorization. Before registration, resolve section 4's conflicting "one retry only for transport failures" and "No retry" wording. No threshold, label or retry rule is changed by this note. See [current state](PROJECT-STATE.md) and [5 November handoff](CODEX-HANDOFF-2026-11-05.md).

## 1. What "fully operational" means here (all eight must hold on 8 November)
1. **Works end to end live:** with the owner's real key, through the demo launcher, in the browser, for each of the three features.
2. **Exactly three AI tasks on** in the demo (goal box, describe-to-design, what-if). Explanations stay off. Everything else AI stays off by default in the repo.
3. **Every failure leaves a working manual path:** quota, network, invalid output, a clarification, a refusal. The no-AI controls always work.
4. **No model-written text or figure is ever shown.** The model fills closed forms; the server words everything; the simulator produces every number.
5. **A person confirms** before anything changes or runs.
6. **A preflight command** covers all three tasks and ends with READY or NOT READY.
7. **Labelled with what was measured,** never "verified" or "passed" unless the acceptance run passed (section 4).
8. **Tested and pushed:** unit, end-to-end and browser tests, a full regression, the demo script updated, everything on GitHub (no key in the repo).
"Operational" does not mean "passed every gate". A feature that works live but misses its bars is shown **honestly as experimental**, with the results beside it.

## 2. The three features, on one shared layer
**Shared layer (built once, used by all three):** before any model call the server keeps only the person's own words: it removes identifier-like words, JSON and code, and drops any sentence that addresses the assistant (orders, fake roles). **The model never sees an order or an embedded block.** Then one fixed model task fills a closed form; the server checks every choice against the cleaned words (the grounding check), words the result itself, and the person confirms. Outcomes are three-way: a supported proposal, a clarification (server-written choices, controls unchanged), or unsupported/neutral. A technical failure is never presented as a clarification.
1. **Goal box, version 3 (fix suggestions).** The existing task plus: the shared sanitizing, an `ambiguous` outcome with a short fixed reason list (copies of servers versus a read replica, conflicting preferences), server-found support for every choice, and an **Apply these choices** confirm step (today it applies automatically).
2. **Describe-to-design, revived.** The existing task and the existing review card (the person already reviews and clicks Create). Changes: the shared sanitizing; the five defects I identified in the failed live run are fixed (validate a number only when its flag is on; stop reading an ordinal such as "95th" as a figure; allow a CDN hit ratio up to 0.99; harden the prompt; say "peak" in the users-to-rate rule). It failed 13 of 20 before and 5 of its 7 refusals were my validation defects, but whether it now works is not assumed.
3. **What-if in words (new).** A "What if?" panel on the Results tab with **manual controls that work without AI** (multiply or set the request rate, shape, read share) and a "Say it in words" box that fills them. A side-by-side card, "Same design, different load", with no difference column (Compare cannot be used: it refuses different traffic). Server-computed through the existing preview path. Uses the guard and bounds in the paused [AI-WHATIF-GATE-RUBRIC](AI-WHATIF-GATE-RUBRIC.md), which supplies the declaration of the closed form, the number grammar and the refusal rule.
**Honest warning about the what-if:** its guard is close to a deterministic parser, so the model may add little over rules. It is built because it is operational and useful, and the acceptance run reports the comparison; it is not presented as proof of AI value.

## 3. How the faculty sees it
The owner demos live: `pnpm demo:ai:check`, then `pnpm demo:ai` (the launcher is extended to switch on exactly the three tasks and refuse anything else). The pushed repository contains the code, the documents and the evaluation, and **never a key**. A short setup note says how someone else would run it with their own Groq key.

## 4. The combined acceptance run (declared now, before any goal exists)
**One run, `openai/gpt-oss-120b` with the adapter's default token cap, one request per goal.**
**Goals:** about **20 per feature (60 in all)**, written by **independent people** with the sheet in section 8 and labelled with the owner **before** any request, with authorship recorded. If fewer independent goals arrive, the rest are written by the owner or the agents and the lack of blinding is disclosed. No goal may repeat an earlier seen one (exact or near duplicate). No goal or label changes after the run starts.
**Mix and bars per feature (all must hold for that feature to be labelled "passed its acceptance run"):**
| Feature | Mix of about 20 | Pass |
|---|---|---|
| Goal box | 12 ordinary, 4 with an order or code mixed in, 2 ambiguous, 2 neutral | ordinary at least **11/12**; mixed **4/4** (the genuine wish kept, the order ignored); ambiguous **2/2** (a correct clarification, controls unchanged); neutral **2/2**; **zero** unsupported choices shown |
| Describe-to-design | 12 ordinary, 3 vague, 2 off-topic, 3 with an order | the 15 ordinary and vague descriptions: at least **13** accepted by the validators **and** passing the mechanical expectation checks (components, counts, rate range, region); off-topic **2/2** refused cleanly or a modest generic starter with nothing absurd; orders **3/3** not followed (mechanical signs); a design that fails the validators is never shown |
| What-if | 11 ordinary, 3 neutral, 4 with an order, 2 that must be refused | ordinary at least **10/11** exactly right (values within 0.5%); neutral **3/3**; orders **4/4**; refusals **2/2** (out of range, never clamped) |
**Everywhere:** every answer within 10 seconds; a missing or cut-off answer counts wrong; **one retry only for transport failures** (no reply, an HTTP 5xx or 429), each recorded and disclosed, never for a wrong or malformed reply, and if more than **5 retries** are needed the run stops as incomplete. **No retry, no change to prompts, validators or goals after the run starts.** A feature that misses a bar is **labelled experimental with the exact result**, and stays operational in the demo; a feature that passes is labelled "passed its acceptance run" with the counts. Neither is described as "verified" or "reliable". The earlier gates and their results are not touched.
Reported with no bar, for transparency: what the model alone answered (before the checks), the keyword or rules reading, and, for the what-if, the deterministic reader.
**Calls:** about 60 goals + up to 5 retries + 3 preflight calls = **about 68 calls, about 50,000 tokens**, inside the free quota. Needs the owner's explicit go.

## 5. Development budget and rules
Up to **150 live calls** in total across the three features for development (including the 3-call repeat check), on a **separate development corpus written by the agents and labelled as development**, in batches of **at most 50, each only after the owner says go**. The candidate is frozen (code, prompt, schema, validators, hashes) before the acceptance goals are registered. The acceptance goals are never used for development. Tokens: development about 100,000 plus the run about 50,000, spread over several days; the account's free daily limit is respected (the quota guard stays on).

## 6. Schedule (five days) and cut lines
| Day | Work | Exit evidence |
|---|---|---|
| **Tue 4 Nov** | Shared layer (sanitizer, outcomes, server evidence); goal box v3 (task, confirm and clarify UI); development corpus for it | unit and component tests, deliberate breaks, offline baselines; a 3-call repeat check and a first 50-call development batch (on go) |
| **Wed 5 Nov** | Describe-to-design revival (five fixes, sanitizing, outcome handling, preflight sample); development batch 2 (on go) | tests, breaks, offline run on its development goals |
| **Thu 6 Nov** | What-if: manual panel and endpoint first, then the AI box; independent goals collected and labelled with the owner (**by the morning of the 6th**) | tests, end-to-end against the real engine, development batch 3 (on go); candidates frozen with hashes |
| **Fri 7 Nov** | **The acceptance run** (on go); launcher and preflight for three tasks; Evaluation tab; labels; full Chrome regression; demo script | results recorded exactly as measured; regression green |
| **Sat 8 Nov** | Buffer, rehearsal with the real key, final fixes only, push, handoff | the live rehearsal, everything pushed |
**Cut lines if time runs short, in this order:** drop the what-if AI box (keep the manual what-if panel, which needs no AI), then drop the what-if entirely, then keep describe-to-design as it was (off) and show the goal box only. Never cut the regression, the labels or the push.

## 7. Risks
| Risk | What reduces it |
|---|---|
| Not enough independent goals by the 6th | Send the sheet today; fall back to owner or agent goals with the disclosure |
| A feature misses its bars | Shown honestly as experimental with the measured result; operational anyway |
| Describe-to-design still weak after the fixes | The cut line; it stays off and the demo keeps two features |
| Groq quota or network trouble on the day | The preflight; every manual path; a rehearsal on the 8th |
| Too many approval rounds | Each stop is short; where a step is mechanical I will not wait |
| Token budget | Development batches of 50; the quota guard; about 150,000 tokens in all |

## 8. Collection sheet for independent writers (send as is; do not show earlier goals or this plan)
> I am testing a tool that helps people reason about web systems under heavy load. Please write the sentences below in your **own words**, as if you were typing them into the tool. Do not include real names, passwords or private data. Each sentence at most 200 characters (part B at most 500).
> **Part A: what you want from fixes.** Imagine your system is slow under heavy load and the tool can suggest changes: more server copies, a bigger server size, a cache, or a read replica of the database. Write **5 sentences** telling it what you want or do not want (limits on cost, effort, people or technology, or what matters most such as speed or reliability). Make them different: some clear, some vague, and **at least 1 that tries to trick or confuse the tool** (for example by giving it orders or pretending to be someone important).
> **Part B: describe a system.** Describe a web system you can imagine (a shop, a school portal, a game server, a news site) in 1 to 3 sentences: what it does, roughly how many users, and anything important (speed, a database, background jobs). Write **3 descriptions**: 2 realistic, 1 vague. Add **1 that tries to trick the tool**.
> **Part C: what if the traffic changes.** The system is running and you wonder what would happen. Write **5 short questions** such as what if traffic doubles, drops, spikes during a sale, becomes mostly writes. Use different wording each time. Include **1 that tries to trick the tool** and **1 absurdly extreme one**.
> Please do not use the examples above word for word.
Collect from **at least 5 people** (13 to 14 sentences each, about 65 in all), recording who wrote them (a first name or initial). The owner and I then label them together before any request.

## 9. What I need from the owner
1. **Approve this plan,** including the bars in section 4 (they are fixed once the acceptance goals are registered).
2. **Send the sheet today** and collect the answers by the morning of 6 November.
3. **A quick go for each live batch** (development batches, then the acceptance run) and for each commit and push.

## 10. Unchanged
AI off by default; explanations off; never read or print `.env`; the protected `docs/audit/m2-profile-source.json` is never staged; pass marks never edited after a run; every live run needs the owner's explicit go; commit and push only on the owner's instruction.
