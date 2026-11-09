# Concept help: from 14 fixed answers to about 120 useful ones (plan for approval, nothing built yet)

Written 2026-11-09. Applies to the assistant drawer when no saved result is open (`web/src/components/shell/ai-panel.tsx`, answers in
`web/src/lib/scripted-reply.ts`, tests in `web/tests/concept-help.test.cjs`). Web only: no backend change, no database change, no network call.

## 1. What exists today (checked in the code)

| Item | Today |
|---|---|
| Answers | **15** fixed paragraphs (ai, what-if, ladder, fixes, verdict, targets, utilization, p95, replica, cache, queue, burst, scale, region) plus one fallback |
| Matching | One regular expression per answer; the **first match wins** (`CONCEPTS.find`) |
| Starter chips | 5 |
| After an answer | Nothing: no follow-up questions, no links, no steps |
| When nothing matches | The same long paragraph, whatever was asked |
| Links to the rest of the app | None, although the app already has 8 Learn topics, Examples, the Evaluation pages and per-screen help |
| Honesty | Strong and worth keeping: no model, does not look at your design, says so on every screen |

## 2. Problems this causes for a user (found by reading the code)

1. **Most real questions get the fallback.** Nothing covers 9 of the 12 component types (client, CDN, load balancer, gateway, worker, database,
   storage, external, app on its own), the traffic settings (read share, duration, presets), the graph error messages (cycle, no entry point,
   queue with no consumer, writes to a replica...), saving and conflicts, versions, notes, reports and PDF, sharing, roles, Support, email,
   or troubleshooting.
2. **Broad patterns collide.** "limit" also catches "rate limit"; "fail" also catches "failed to save"; "scale" catches any question that
   mentions "capacity". The first one listed answers, even when the user meant another.
3. **A dead end after every answer.** The user must think of the next question alone.
4. **A useless fallback.** It repeats a list of topics instead of suggesting the closest ones.
5. **No path to action.** An answer says what a Suggested fix is but not where to click, and does not open the Learn topic that already explains it.

## 3. Goal

A user who opens the drawer with almost any question about the tool or the ideas behind it gets **a short correct answer, the steps to do it in the
app, a small example with numbers, and two or three next questions**, and when we truly cannot answer, they are shown the **closest topics** and
can **suggest a topic**. It stays honest: still no model, still no reading of the open design.

Targets (measured, see section 8): about **120 answers** in 10 categories, at least **85% of 150 independently written test questions answered
by the right entry in the top 3**, and 100% of entries reachable by their own example questions.

## 4. Design

### 4.1 Content model (new folder `web/src/lib/concept-help/`)

```
Entry {
  id, category, title,
  questions[]   // 3 to 8 example phrasings, used for matching and shown as "ask this"
  keywords[]    // weighted words and phrases, with a few synonyms
  short         // the answer, at most 70 words
  why?          // why it matters, one or two sentences
  steps?[]      // "In the app": at most 4 numbered steps with the real button names
  example?      // a worked example with numbers, from the same constants the model uses where possible
  related[]     // ids of 2 to 3 follow-up entries (become chips)
  links[]       // { label, href } to a Learn topic, Examples, Evaluation or a screen (checked against the route registry)
}
```

The 14 current answers are kept (same ids) and reshaped into this model, so the existing tests keep passing.

### 4.2 Matching (deterministic, in the browser, no model)

1. Lower-case, strip punctuation, light stemming (plurals, -ing, -ed), small stop-word list.
2. Score every entry: weighted keyword hits, phrase hits, overlap with its example questions, small boost for the screen the drawer was opened on.
3. Tolerate one typo in words of 5 or more letters (edit distance 1).
4. Best entry above a threshold answers; the next two become **"Also related"** chips. Below the threshold: the helpful fallback (4.4).
5. A question with two clear topics ("cache and replica") answers the first and offers the second as a chip.

This replaces "first regex wins", which is the cause of problem 2.

### 4.3 Answer layout in the drawer

Short answer, then **Why it matters**, **In the app** (numbered), **Example**, then **Related** chips and **Open** links. Streaming effect and
reduced-motion behaviour are kept. Long answers fold the Example and Steps behind a "More" toggle so the drawer stays readable.

### 4.4 Empty state and fallback

* Empty state: **6 category chips** and **12 popular questions** (today 5) instead of one paragraph, plus **Browse all topics** (a searchable list inside the drawer).
* Fallback: "I could not match that. Closest topics:" with the 3 nearest entries as chips, the category list, and **Suggest a topic**, which opens the existing
  problem-report dialog with the category "idea" and the question text only if the user chooses to send it. Nothing is sent automatically.

### 4.3b Optional second step: screen-aware ranking (no model, no design reading)

The drawer already knows which page is open. On Results prefer result topics; on Canvas prefer canvas topics; on Support prefer Support topics.
It never reads the design, so the "does not look at your design" statement stays true. (Reading a result is already done by the separate, grounded
"Explain this result" feature.)

## 5. Content catalogue (the part that makes it "fruitful")

About 120 entries. Every one has at least 3 example questions, and numbers are checked against the code.

| Category | Entries | Examples of what is covered |
|---|---|---|
| A. Basics | 10 | What a design and a model are; what the tool can and cannot tell you; requests per second; latency; throughput; p50, p95, p99; error rate; target; error budget |
| B. Reading results | 14 | Verdict; pass, strained, fail and the exact rule (80% of target, 75% utilisation); utilisation; bottleneck; p95 against average; timeline; per-component table; queue backlog, lag and overflow; cross-region links; "out of date" result; engine version; a run that failed |
| C. Components | 16 | Each of the 12 types: what it does, when to add it, common mistakes; plus load balancer against gateway, app against worker, cache against CDN, primary against replica |
| D. Traffic settings | 10 | Request rate; burst; read share and write share; duration; shape (steady, ramp, spike); presets; p95 target; error budget; why the peak matters |
| E. Patterns and trade-offs | 16 | More servers against a cache against a replica; scaling up against out; queue against direct call; CDN for static content; cache hit rate; single point of failure; replica lag; regions and latency; what the model does **not** cover (sharding, circuit breakers) |
| F. Using the app | 20 | Four ways to create a design; canvas basics; autosave and conflicts; versions, restore and compare; notes; Check graph; run test; live preview; Limits; load ladder; what-if; fixes; report and PDF; share links; reviewers; templates; examples; Learn; challenges; progress |
| G. Account, roles and Support | 10 | Sign up and password rules; the five roles; export and delete; report a problem; notifications and muting; email notifications; suspended account; session expired; rate limits |
| H. Troubleshooting | 12 | Run failed or timed out; cannot reach the server; save conflict; a 403 page; the graph errors one by one (cycle, no entry point, entry not connected, edge into entry, unreachable, queue with no consumer, writes to a replica, no write target); import failed; PDF diagram too small |
| I. AI and honesty | 6 | What each AI feature does and why it is off by default; quota and privacy; "is this assistant AI?"; how accurate the model is |
| J. Glossary | 10 | SLO, throughput, concurrency, TTL, replication lag, saturation, horizontal and vertical scaling, idempotency, round trip, load balancer |
| **Total** | **~124** | |

### Quality bar for every entry

1. Correct: every number or rule is taken from the engine or the app (region round trips, 75% and 80% thresholds, limits of 50 components,
   200 connections and 200 copies, the 5 second run limit, the 2x, 5x and 10x ladder, replicas replaying writes at a quarter of the cost).
2. Short first: the answer fits in 70 words; detail sits under "More".
3. Actionable: names the real buttons and screens; ends with a next step.
4. No jargon without a link to the glossary entry.
5. Honest: says "not modelled" where the tool does not model something, and never claims a measurement.

## 6. Files

| File | Change |
|---|---|
| `web/src/lib/scripted-reply.ts` | Keeps `scriptedReply()` and `CONCEPTS` as thin wrappers so nothing else breaks |
| `web/src/lib/concept-help/` (new) | `types.ts`, `match.ts`, one `entries-<category>.ts` per category, `index.ts` |
| `web/src/components/shell/ai-panel.tsx` | Empty state, category chips, related chips, links, browse list, fallback, "Suggest a topic" |
| `web/src/styles/*.css` | Small additions for the answer sections and chips |
| `web/tests/concept-help.test.cjs` | Existing tests kept; new tests added |
| `web/tests/concept-help-match.test.cjs` (new) | Matching, collisions, typos, numbers |
| `web/tests/browser/concept-help.spec.ts` (new) | Drawer behaviour in Chrome |
| `docs/HANDOFF-LOG.md` | Entry for the change |

No change to the backend, the database, the contracts or any existing route.

## 7. Phases (quality decides the length)

| Phase | Work | Estimate |
|---|---|---|
| 1 | Content model, matching, drawer layout, first 40 entries (categories A, B, D, H and the existing 15) | about 1 day |
| 2 | Remaining entries (C, E, F, G, I, J), related chips, browse list, helpful fallback, "Suggest a topic" | about 1 to 1.5 days |
| 3 | Test set of 150 questions, tests, Chrome checks (1024 and 1440 wide, light and dark, keyboard, reduced motion), lint, build | about 0.5 to 1 day |

## 8. Verification

* **Self-retrieval:** every example question returns its own entry as the top result (100%).
* **No collisions:** no entry's example question returns a different entry first; checked automatically.
* **Independent test set:** 150 questions written separately in ordinary wording (not copied from the entries). Reported as a measured top-1 and top-3
  hit rate, with the failures listed. Target 85% in the top 3; the real number is reported, not rounded up.
* **Numbers:** a test compares each quoted number with the constant it comes from.
* **Links:** every link target exists in the route registry.
* **Honesty tests kept:** no answer claims a model, a measurement or knowledge of the open design.
* **Browser:** the drawer in Chrome at both widths and themes, keyboard only, reduced motion; screenshots reviewed.
* **Regression:** full web unit tests and the existing browser suite stay green.

## 9. Risks

| Risk | Handling |
|---|---|
| Keyword matching can still mis-route | Scoring instead of first match, "Also related" chips, a measured test set, and a suggest-a-topic path |
| 120 answers is a lot to keep correct | Numbers come from constants and are tested; entries have owners by category |
| The drawer becomes crowded | Short answer first, detail behind "More", at most 3 related chips |
| It starts to look like AI | The "Scripted mock" label, the no-model statement and the honesty tests stay |

## 10. Non-goals

No language model, no server call, no chat memory, no reading of the open design (that is "Explain this result"), no translation in this change.

## 11. Decisions needed from you

1. Is about **120 answers** the right size, or do you want a smaller first release (the top 60) and the rest later? *Recommended: 120, in the phase order above.*
2. Keep the **"Scripted mock"** label? *Recommended: yes, it is the honest description.*
3. Add **"Suggest a topic"** (opens the existing problem report with the category "idea", sent only if the user presses Send)? *Recommended: yes.*
4. Add **screen-aware ranking** (uses only which page is open)? *Recommended: yes, in phase 2.*
5. Any categories to **drop or add** (for example "Exam help for the course concepts" or Bengali)? *Recommended: none now.*

Nothing is committed or built until you approve this plan.
