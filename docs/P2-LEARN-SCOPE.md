# P2 scope: Learn (concept pages with live mini-demos)

Prepared 2026-11-01. Status: **all nine decisions approved 2026-11-01 ("Approve all", as recommended).** Commit one (shared model, fixtures, parity tests) is built; commit two (pages, demos, checks, progress) is not. Needs no AI and no new backend route. Details slice P2 of [PHASE-4-5-SCOPE](PHASE-4-5-SCOPE.md), where decisions 1 to 3 (content in code, demos share the simulator's formulas, progress kept in the browser) are already approved.

## 1. Where the code is today (verified)

- `/learn` and `/learn/:topic` are one-line placeholders. The registry already has both routes, so **no new routes; the registry stays at 40.**
- The eight topics exist as a fixed list in `web/src/lib/catalog.ts`: p95 latency, Caching, Queues, Read replicas, Load balancing, Utilization (ρ), CDNs, Regions and latency.
- Already linking to topics: the command palette, the help drawer's concept chips, and the top bar. The How it works page links to `/learn`.
- The route pattern accepts any topic name, so today `/learn/anything` shows a placeholder titled "Anything". It should be a 404.
- The simulator's formulas live in the backend (`nodeModel` and the percentile functions in `distributions.ts`, `queueStats` in `simulate.ts`, constants in `catalog.ts`: round-trip times 75, 190 and 115 ms between regions, replica write cost 0.25, one-minute bursts, status thresholds at 75% and 100% utilization). The web app cannot import them.

## 2. What a learner gets

Each topic page has: a plain-words explanation (about 150 to 250 words), **one live mini-demo** with sliders, a "where you will see this in the app" box, and a **two-question check** with an explanation after each answer. `/learn` lists the eight topics as cards showing which ones you have opened and passed.

| Topic | Mini-demo | Formula it must match |
| --- | --- | --- |
| Utilization (ρ) | load and capacity sliders show ρ, status (healthy under 75%, warning, failing at 100%) and waiting time | utilization, `STATUS`, single-server wait S·ρ/(1−ρ) |
| Queues | arrival rate and worker rate show backlog, lag and whether the queue absorbs a burst or grows | `queueStats` (drain, backlog, lag, one-minute burst) |
| p95 latency | share of slow requests slider: p50 barely moves while p95 jumps | percentile of the model's mixture distribution |
| Caching | hit-ratio slider shows load left on the database and its utilization | reads times (1 − hit ratio) |
| Read replicas | replica count slider shows read capacity and the write cost of replaying writes | replica write cost 0.25 |
| Load balancing | replica count slider shows load per replica; says plainly that the model assumes an even spread | per-replica load = total ÷ replicas |
| CDNs | CDN hit-ratio slider shows traffic reaching the origin | CDN default hit ratio and origin load |
| Regions and latency | pick two regions to see the added round trip | `RTT` table (75, 190, 115 ms) |

Every demo is labelled **model estimate**, never measurement.

## 3. Keeping the demos honest (the main design problem)

The demos must give the same numbers as the real simulator, or they would teach the wrong thing. The web app cannot import the backend, so:

- A small pure file, `web/src/lib/learn-model.ts`, holds the few formulas the demos need.
- A **fixtures file** (`docs/contracts/learn-fixtures.json`) is generated *from the backend engine* for a grid of inputs, in the same style as the existing reference fixtures.
- A backend test fails if the engine and the fixtures disagree. A web test fails if `learn-model.ts` and the fixtures disagree. So neither side can drift without a red test.
- Numbers quoted in the prose (75%, 0.25, 75/190/115 ms, one minute) are checked by tests against `catalog.ts`, the way P1 ties text to the code.

## 4. Progress marks

- Kept in the browser only (approved decision 3): which topics you opened and your quiz result, stored per signed-in account on that device, with a separate bucket for guests. Nothing is sent to the server.
- A "Clear my learning progress" button on `/learn` empties the current bucket.
- Unreadable or tampered stored data is ignored and never breaks the page.
- Showing concepts on `/progress` is P6, not here.

## 5. Decisions needed (recommendation first)

1. **How demos stay in step with the simulator.** Recommended: generated fixtures plus tests on both sides (section 3). Alternative: copy the formulas and trust them; faster but can silently drift.
2. **Demo size.** Recommended: one small demo per topic, computed in the browser, no account and no API. Alternative: embed the real simulator on a template; much heavier and needs sign-in.
3. **The check.** Recommended: two multiple-choice questions per topic, answered once per visit with the explanation shown after each; no scoring across topics, no leaderboard. Passing means both right; a wrong answer can be retried.
4. **Guests.** Recommended: guests read everything and get progress marks in a guest bucket on their device. Alternative: marks only after sign-in.
5. **Unknown topics.** Recommended: `/learn/anything-else` is a 404 (only the eight topics exist).
6. **"Where you will see this".** Recommended: plain text naming the screen (for example "the Results tab shows utilization per component") plus links that need no ids: `/how-it-works` sections and `/new/template`. No links into a specific design.
7. **Load balancing honesty.** Recommended: the page states that the model spreads load evenly across replicas and does not model uneven traffic or sticky sessions.
8. **Who writes the wording.** Recommended: I draft the eight explanations and sixteen questions as typed data for you to review before they ship; it is course content, so your edits win.
9. **Slicing.** Recommended: two commits. First the shared model, fixtures and parity tests; second the pages, demos, checks and progress. Pushed only when you say so.

## 6. Test plan

- **Parity:** the demo model equals the backend engine on the fixture grid, including the edges (zero load, load at and past capacity, one replica, hit ratio 0 and 1, same-region round trip of zero).
- **Prose:** every number quoted in the explanations equals the value in `catalog.ts`; no sentence promises measured performance.
- **Components:** each slider changes the output text; outputs stay finite at the extremes; the check marks right and wrong answers and shows the explanation; passing needs both right; progress is saved per bucket, survives a corrupt value, and clears.
- **Browser (four projects, four widths, guest):** every topic loads with one heading and no API calls; a demo is operable by keyboard alone and its result is also in text, not only a bar or colour; the check works; the "opened" mark and a pass survive a reload; unknown topic is a 404; no horizontal overflow at 320, 390, 1024 and 1440 px.
- **Deliberate breaks:** each must fail a test: a wrong constant in the demo model, a changed threshold, an unknown topic accepted, progress written to the wrong bucket, a quiz answer key flipped, an explanation number that disagrees with the catalog.
- The usual gates: type check, lint, all unit tests, full Chrome regression, commit by path, protected audit file never staged.

## 7. Not in scope

Content editable by Instructors or Admins, server-side progress, certificates or grades, the concepts list on `/progress` (P6), videos or images beyond simple inline figures, any AI explanation, and a topic beyond the eight already listed.

## 8. Risks

A demo that disagrees with the simulator would mislead learners; section 3 is the guard. Explanations can drift from the model over time; the quoted-number tests catch the measurable ones. Course wording is subjective, which is why decision 8 puts it in your hands.

## Commit one result (2026-11-01): shared model and parity
**Built:** `web/src/lib/learn-model.ts` (pure, no imports); `docs/contracts/learn-fixtures.json` (113 KB, generated by running the real `simulate`, `quantile` and `rtt` on 228 small designs and inputs); the generator `src/script/learn-fixtures.ts` with `pnpm fixtures:learn` and `pnpm fixtures:learn:check`; a backend spec that fails if the stored fixtures differ from what the engine produces now; a web test that fails if the model differs from the fixtures or quotes a constant that is not in the engine source.
**Correction to section 2:** the Utilization demo uses the engine's real waiting formula, which depends on the number of parallel servers (the wait is S times rho to the power sqrt(2(c+1)) minus 1, over c times (1 minus rho)), not only the single-server S x rho / (1 - rho) written in the table. The single-server form is the c = 1 case, and the lesson text will say so. It also includes the engine's saturation clamp and full-queue penalty.
**Model assumptions the demos state:** the tier in front is never the limit (the first queue fixtures broke this: at 2,000 rps with a x4 burst an under-sized app sheds work before it reaches the queue, so the fixtures size the app tier up); the balancer spreads load evenly.
**Finding about repeatability:** the same engine can print a last digit different in different processes (V8's `Math.pow` can differ between interpreter and optimized code). That is the cause of the older `pnpm fixtures:phase2` "drift" under Node 24, which compares bytes. The Learn checks therefore compare numbers within a relative tolerance of 1e-9. The phase 2 byte comparison is unchanged and still needs your decision.
**Evidence:** web unit 276 pass (8 new); backend unit 249 pass (4 new); 24 deliberate breaks, 23 caught (the survivor is an equivalent change, `<` to `<=` in a bisection that only matters when the curve equals the target exactly). No UI changed, so no browser run for this commit.
