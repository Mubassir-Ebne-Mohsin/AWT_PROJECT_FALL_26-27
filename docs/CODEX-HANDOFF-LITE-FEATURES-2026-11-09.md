# Handoff for Codex, 2026-11-09: lite features

Branch `codex/phase2-contracts`. Claude Code finished the Concept help expansion (commit `4dae6e5`, local, not pushed) and is handing the **lite features** to Codex at the owner's request. Read this first, then AGENTS.md, CLAUDE.md, docs/PROJECT-STATE.md, the newest entries of docs/HANDOFF-LOG.md, [CODEX-HANDOFF-2026-11-06.md](CODEX-HANDOFF-2026-11-06.md) (its standing rules still apply) and [CONCEPT-HELP-SCOPE.md](CONCEPT-HELP-SCOPE.md).

## 1. Standing rules (unchanged)
- Preserve `docs/audit/m2-profile-source.json`; never stage, commit or revert it. Never commit the six `docs/audit/*.png` files tests rewrite, `docs/contracts/m11-runtime.openapi.json`, or `film/`.
- Never read or print `.env` values. No push, merge or deploy without the owner's explicit word; commit by explicit path and ask first.
- Do not weaken or delete an existing test to pass. Show new tests fail when the feature is broken (deliberate breaks) and look at screenshots.
- Plan the pattern per feature: short scope, owner approval, build, verify, ask before commit.

## 2. What Claude just built (context for the lite features)
Concept help is now `web/src/lib/concept-help/` (types, `match.ts` scorer, four `e-*.ts` entry files, `index.ts` with `reply()`, `flatten()`, `related()`, `POPULAR`, `ENTRIES`). `web/src/lib/scripted-reply.ts` is a thin wrapper kept for the old tests. The drawer is `web/src/components/shell/ai-panel.tsx`. 124 topics; measured on 24 independently worded questions: top-1 18/24, top-3 21/24. Tests: `web/tests/concept-help.test.cjs`, `web/tests/concept-help-match.test.cjs` (ids unique, rel ids exist, links are real routes, honesty wording, self-retrieval). To add a topic: add an entry, keep `a` under about 70 words, keep `rel` ids valid, run both tests. Answers must not claim to look at the open design, must not use the word AI outside AI topics, and must not contain "phase N", "prototype" or "arrive".

## 3. Lite feature list (owner chooses and orders; each is small, no new service, no model)
**Concept help**
1. Glossary hover cards: underline p95, utilization, error budget in results, show the topic's short answer on hover and focus (keyboard reachable).
2. "Ask about this" button beside a verdict or the limiting component that opens the drawer with that topic answered. (Recommended first.)
3. Local-only log of questions that hit the fallback, shown in the Suggest a topic dialog. Nothing is sent anywhere.
4. `?` opens and Esc closes the drawer (check the existing focus-return tests).

**Workspace**
5. Duplicate design ("(copy)").
6. Design tags and pin-to-top on the Designs list.
7. Copy results as plain text (verdict, limiting component, key figures). Recommended.
8. Export design as JSON (reverse of Import; the format exists).
9. Run-to-run comparison strip on Results (last two runs, changed figures only).
10. Traffic presets: launch day, flash sale, quiet night. Recommended.

**Learning and polish**
11. Daily "what would you add?" quiz with fixed scenarios linking to topics.
12. Staged challenge hints (hardcoded, unlocked one at a time).
13. Command palette: Run test, Check graph, Open report.
14. Print-friendly report CSS.
15. Empty-state tips on Notes and History.

## 4. Warnings
- Everything shown as a figure must come from the engine; copy-as-text (7) and the comparison strip (9) must read saved run data, never recompute.
- Keep the drawer honest: it is a fixed set of written answers, labelled "Scripted mock". Do not add a model call to it.
- Items 5 and 8 touch the API; 5 needs ownership checks and the design limits (50 components, 200 connections, 64 KiB import). Add backend and e2e tests, not only web.
- Item 3 must not persist question text on the server or include it in the report dialog without the user seeing it.
- The Concept help drawer has not been checked in a signed-in browser by Claude; do that (1024 light, 1440 dark, 390) before building on it, including the `phase1.spec.ts` drawer check and focus-return tests.
- Run the web unit suite with `node --require ./tests/register.cjs --test tests/*.test.cjs` from `web/` (the directory form of `--test` fails).
