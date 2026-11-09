# StressForge lite features

2026-11-09. Batch 1 was approved and verified locally.

## Starting point

The Concept help expansion is in local commit 4dae6e5. The two focused test files passed 16 of 16 in this review. The independently worded matcher sample reproduced 18 of 24 top-one and 21 of 24 top-three hits. The signed-in browser baseline was verified as recorded below.

The Designs list already duplicates designs through the owner-scoped library API. Report already has a browser Print action and print styles. Traffic already has five catalog presets, including Flash sale and Launch day. The global question mark key currently opens the shortcuts sheet.

## Approved Batch 1

| Order | Feature | Scope and acceptance |
| --- | --- | --- |
| 0 | Concept help baseline | In an isolated signed-in browser session, check 1024 light, 1440 dark and 390 mobile. Exercise the scripted badge, a topic, related links, browse and fallback. Check Escape and focus return, including the existing Phase 1 drawer check and applicable focus coverage. Resolve any baseline blocker before extending the drawer. |
| 1 | Ask about this | Add a contextual Results action beside the recorded verdict and, when present, the bottleneck. Open the existing Concept help drawer directly on the matching written topic by stable topic ID. Confirm the two entry points reach the intended answers and Escape restores focus to the initiating control. Keep the Scripted mock label and general explanations. |
| 2 | Copy results as text | Copy the completed simulation currently displayed on Results, including a selected historical run. Include verdict, p95 and target, error rate and budget, throughput, bottleneck when present, and recorded revision. Label the figures as model estimates and indicate stale results. Offer selectable text if clipboard writing fails. Exercise pass, strained, fail, stale and no-bottleneck cases. Pending or failed calculations and Limits entries have no simulation copy action. |
| 3 | Quiet night preset | Add one low-load profile to the existing Traffic picker. Proposed demo values are 100 requests per second, 1.1× burst and a steady shape. Preserve read share, p95 target, error budget and duration for this quick adjustment. Use the existing Custom identifier and one editor command so undo restores the prior state. Flash sale and Launch day remain available through the existing catalog. |

This batch uses existing frontend data, drawer, workspace and traffic handling. The proposed Quiet night treatment avoids a stored preset-enum change. Figures come from the selected saved run. Concept help uses written topic content and stays scripted.

## Verification

Run the focused web unit and browser tests plus type and lint checks. Use an isolated account and test data. Check clipboard failure, historic run selection, repeated topic opening, keyboard operation, mobile layout and one-step undo. Deliberately break the topic mapping, saved-run selection and traffic update in isolated verification to show the checks catch those faults. Restore the correct implementation and inspect screenshots at the target widths. Record evidence and review explicit file paths with the owner before committing.

## Batch 1 outcome

The owner approved Batch 1 on 2026-11-09. The three features are implemented locally and ready for commit review.

- The signed-in Concept help baseline passed at 1024 light, 1440 dark and 390 light. The original Phase 1 palette and drawer assertions passed in isolation at both desktop widths.
- The full Phase 1 baseline stopped earlier on breadcrumb assertions for Share and Evaluation. The isolated drawer run bypassed those unrelated route steps while preserving the drawer assertions.
- The restored code passed all nine Batch 1 browser checks across the three widths. Screenshots were reviewed. The dark run also exposed the optional explanation UI through a mocked readiness response and confirmed that contextual help stayed scripted.
- Three deliberate faults were caught in the temporary checkout. The topic check distinguishes the answer heading from related chips. The other checks caught dropping historical-run selection and changing Quiet night to 101 rps.
- TypeScript, focused ESLint and all 570 web unit tests passed. The four neighboring M7 browser checks passed. The existing M12 mobile reopen check passed in dark and on two 1024-light reruns after one timeout.
- Evidence is under the local temporary directory sf-lite-64e6fec4. The audit used its own API, Postgres and Redis. The temporary services were removed after verification.

## Follow-on queue

1. Add keyboard-accessible glossary cards and empty-tab tips using the existing topic catalogue. Consider a dedicated Concept help shortcut after checking shell shortcut conflicts.
2. Add a recent-run shortcut to existing Compare. A small Results strip is optional if the shortcut leaves a recurring need. Use saved runs and label differences in traffic when comparing.
3. Add Download design JSON using the owned saved snapshot and the import schema. Scope the export to design inputs, then verify export-to-import round trips and ownership. Decide whether an API change is necessary after tracing the import contract.
4. Add a rotating written quiz and staged challenge hints after the owner reviews the content. Keep the hint plan separate from challenge publication and grading.
5. Consider a local unanswered-question list only with an explicit clear control and visible user selection before a Support submission. Persistent tags and pins need a separate storage and migration scope.
6. Treat Duplicate and browser print as polish only if a specific workflow gap is found. Route palette actions through the existing commands and eligibility rules.

Additional candidates for later review include filtering the canvas component palette, copying a node's settings to another node of the same type, and resetting one traffic field to its preset value. Confirm each gap in the interface before implementation.
