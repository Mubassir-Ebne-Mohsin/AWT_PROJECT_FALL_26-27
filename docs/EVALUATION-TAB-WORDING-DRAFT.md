# Evaluation tab: draft wording for the three AI features (for the owner's approval; not built)

**Written 2026-11-04.** The Evaluation page (AI tab) is built from data in `web/src/lib/evaluation.ts`, and the rule so far has been that **you approve the wording first**. Nothing below is on the page. Every figure is a **development** figure from goals the author wrote and read; none is an acceptance result, and the page must say so. Replace the placeholders with the acceptance run's counts only after that run.

## What the page would add, in order (one section per feature)

### 1. Fix suggestions in words (goal box, version 3), "Experimental"
- What it is: a sentence becomes choices (leave out some kinds of fix, choose what comes first). Text is cleaned first so the model never sees an order or embedded code; every choice must be supported by the person's own words; a goal that could mean two things (for example "replicas": server copies or a database copy; or "fast and cheap") asks a question instead of guessing; the person confirms before anything changes.
- Measured so far (development, 45 goals the author wrote and read, `gpt-oss-120b`, 2026-11-03): **42 of 45** read as expected (ordinary 19/20, with an order or code mixed in 10/10, ambiguous 6/8, nothing to act on 7/7). The same cleaning and checks with plain keyword rules in place of the model: **35 of 45** (ordinary 13/20). The three misses were gaps in our rules; they were fixed afterwards and not re-run live.
- Not measured: independent goals written by other people (acceptance run, not yet done).

### 2. Describe a system (describe-to-design, version 2), "Experimental"
- What it is: a description becomes a draft design the person reviews before creating. The model fills a fixed form with no free text; our builder draws the graph; non-system text is refused.
- History, stated first: version 1 was **13 of 20** and obeyed 3 of 3 hidden orders (NO-GO, unchanged on this page). Version 2 fixes five declared defects, cleans the description first, and drops the model's free-text reason.
- Measured so far (development, 27 descriptions the author wrote and read): first batch **13 of 27** (below the keyword rules' 16 of 27), then **27 of 27** after fixes made from reading those same failures. State this plainly: the second figure is not a result.
- Not measured: independent descriptions (acceptance run, not yet done).

### 3. What if the traffic changed? (calculated) and "Say it in words" (AI), "Experimental"
- The panel itself needs no AI and is checked: each answer equals a fresh simulation of the same design under the same changed traffic (25 comparisons on 5 templates).
- The sentence box: a model fills a fixed form; every choice must be supported by the words; out-of-range values are refused, never clamped.
- Measured so far (development, 39 sentences): the same cleaning and checks with plain keyword rules in place of the model score **39 of 39**; the bare keyword reader without cleaning scores 31 of 39 (it follows 4 of 8 hidden orders). So the model has little room to add value on sentences of this kind; the page says so.
- Not measured with a model: no live what-if batch has been run.

## Statements the page must keep (unchanged, from earlier decisions)
- Explanation of results with a model: NO-GO (0 of 18 accepted), off, unchanged.
- "Experimental" is used until a feature passes an acceptance run declared in advance; "verified", "reliable" and "passed" are not used for any of the three.
- "What none of this shows": it does not show these features are safe against every hidden order, that they work for sentences in other styles or languages, or that the model adds value over plain rules where the rules already score as high.

## For you to decide
1. Approve the wording above (or edit it).
2. Whether the page shows the development figures at all before the acceptance run, or only the method and "acceptance run pending" (my recommendation: show them, labelled development, because hiding the first-batch 13 of 27 would be selective).
