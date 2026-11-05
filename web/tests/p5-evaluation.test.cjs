const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost:3000" });
for (const name of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "localStorage"]) {
  Object.defineProperty(global, name, { configurable: true, value: dom.window[name] });
}
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const h = React.createElement;

let pathname = "/evaluation/simulator";
require.cache[require.resolve("next/navigation")] = { exports: { usePathname: () => pathname, useRouter: () => ({ replace() {}, push() {} }), useSearchParams: () => new URLSearchParams(""), notFound() { throw new Error("NEXT_NOT_FOUND"); } } };
require.cache[require.resolve("next/link")] = { exports: { __esModule: true, default: ({ children, ...props }) => h("a", props, children) } };
const E = require("../src/lib/evaluation.ts");
const CAL = require("../src/lib/calibration.ts");
const { EvaluationPage } = require("../src/components/evaluation/evaluation.tsx");
const { ROUTES, resolveRoute } = require("../src/lib/routes.ts");
const { EVAL_TABS } = require("../src/lib/catalog.ts");

let fetchCalls = 0;
global.fetch = () => {
  fetchCalls += 1;
  return Promise.reject(new Error("the evaluation page must not make requests"));
};
const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let roots = [];
async function render(p) {
  pathname = p;
  const container = document.createElement("div");
  document.body.append(container);
  const r = createRoot(container);
  roots.push(r);
  await act(async () => r.render(h(EvaluationPage)));
  return container;
}
afterEach(async () => {
  for (const r of roots) await act(async () => r.unmount());
  roots = [];
  document.body.innerHTML = "";
});
// Numbers as a reader sees them: elements are separated by spaces, model names and p50/p95/p99 are not numbers.
const spaced = (view) => view.innerHTML.replace(/<[^>]+>/g, " ").replace(/&apos;|&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const tokens = (s) => s.replace(/qwen2\.5:1\.5b|llama3\.2:3b/g, " ").match(/(?<![A-Za-z\d.,])\d[\d,]*(?:\.\d+)?(?:e[−-]\d+)?%?/g) ?? [];
const testid = (v, id) => v.querySelector(`[data-testid='${id}']`);

// ---------- registry ----------

test("P5 registry: the Evaluation routes are public and honest, now 42 routes, and only the three tabs exist", () => {
  assert.equal(ROUTES.length, 42);
  for (const id of ["evaluation-root", "evaluation"]) {
    const r = ROUTES.find((x) => x.id === id);
    assert.equal(r.area, "public", id);
    assert.equal(r.fidelity, "C");
  }
  assert.doesNotMatch(ROUTES.find((x) => x.id === "evaluation").description, /mock|illustrative/i);
  for (const [id, label] of Object.entries(EVAL_TABS)) assert.equal(resolveRoute("/evaluation/" + id).title, "Evaluation: " + label);
  for (const name of ["nope", "constructor", "__proto__", "toString"]) assert.equal(resolveRoute("/evaluation/" + name).title, "Page not found", name);
  assert.deepEqual(E.TAB_LIST.map((t) => t.id), Object.keys(EVAL_TABS));
  assert.equal(ROUTES.find((x) => x.id === "dev-eval-runner").fidelity, "S", "the developer stubs stay stubs");
});

// ---------- the words ----------

test("P5 words: the Simulator sentences state the data's numbers, not remembered ones", () => {
  const d = E.EVAL.erlang;
  assert.match(E.oneServerText(), /equals the exact/);
  assert.ok(E.oneServerText().includes(E.sci(d.oneServerWorstRelativeError)));
  const rows = E.bandRows();
  assert.deepEqual(rows.map((r) => r.share), ["1%", "5%", "20%"]);
  assert.deepEqual(rows.map((r) => r.worst), d.bands.map((b) => E.pct1(b.worstRelativeError)));
  assert.deepEqual(rows.map((r) => r.points), d.bands.map((b) => E.n0(b.points)));
  const gap = E.gapText();
  assert.ok(gap.includes(E.gapUnits(d.maxAbsoluteGap.value)) && gap.includes(`${d.maxAbsoluteGap.servers} servers`));
  const app = d.typical.find((t) => t.type === "app");
  assert.ok(gap.includes((d.maxAbsoluteGap.value * app.serviceMs).toFixed(1) + " ms"), "converted with the app tier's real service time");
  assert.match(E.fidelityText(), new RegExp(`${E.n0(E.EVAL.fidelity.valuesCompared)} numbers across 6 reference designs`));
  assert.equal(E.consistencySummary().total, 30);
  assert.equal(E.consistencySummary().passed, 30);
  assert.equal(E.ms(0.0001), "under 0.001");
  assert.equal(E.ms(0.5), "0.500");
  assert.equal(E.ms(12.3456), "12.35");
  assert.equal(E.sci(0), "0");
  assert.match(E.sci(1.1e-16), /^1\.1e−16$/);
});

test("P5 words: every shown load level exists in the data for every component", () => {
  for (const t of E.EVAL.erlang.typical) for (const r of E.LOADS_SHOWN) assert.ok(t.rows.some((x) => x.rho === r), `${t.type} at ${r}`);
  assert.ok(E.EVAL.erlang.typical.length >= 10);
});

test("P5 commands: every command the page tells you to run is a real script in the right folder", () => {
  for (const c of E.COMMANDS) {
    const pkg = JSON.parse(read(c.dir + "/package.json"));
    assert.ok(pkg.scripts[c.script], `${c.script} is a script in ${c.dir}`);
    assert.equal(c.command, "pnpm " + c.script);
  }
});

test("P5 AI record: the figures quoted are the ones recorded in the M10 report", () => {
  const doc = read("docs/M10-LOCAL-AI-FEASIBILITY.md").replace(/\s+/g, "");
  const has = (frag) => assert.ok(doc.includes(frag.replace(/\s+/g, "")), "M10 report says: " + frag);
  has("qwen2.5:1.5b");
  has("llama3.2:3b");
  has("1/8 schema-valid;7 truncated at");
  has("0/8 passed complete expected-field checks");
  has("8/8 schema-valid;0/8 passed complete expected-field checks");
  has("only4/8 cited exclusively allowed evidence IDs");
  has("Insufficient system resources");
  has("NO-GO");
  const [qwen, llama] = E.AI_RECORD.models;
  assert.deepEqual([qwen.shape, qwen.passed, llama.shape, llama.passed], ["1 of 8", "0 of 8", "8 of 8", "0 of 8"]);
  assert.match(qwen.note, /7 of 8/);
  assert.match(llama.note, /4 of 8/);
  assert.match(E.AI_RECORD.verdict, /not a claim that AI cannot work/);
});

// ---------- the pages ----------

test("P5 pages: three tabs, each with one heading, a status that says what it is, and no request", async () => {
  const expected = { simulator: "Measured", calibration: "Measured on one machine, one toy service", ai: "Tested, no model passed" };
  for (const [tab, status] of Object.entries(expected)) {
    document.body.innerHTML = "";
    const view = await render("/evaluation/" + tab);
    assert.equal(view.querySelectorAll("h1").length, 1, tab);
    assert.equal(view.querySelector("h1").textContent, "Evaluation");
    assert.equal(testid(view, "tab-heading").textContent, EVAL_TABS[tab]);
    assert.equal(testid(view, "status").textContent.trim(), status);
    const links = [...view.querySelectorAll("nav[aria-label='Evaluation sections'] a")];
    assert.deepEqual(links.map((a) => a.getAttribute("href")), ["/evaluation/simulator", "/evaluation/calibration", "/evaluation/ai"]);
    assert.deepEqual(links.filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent), [EVAL_TABS[tab]]);
    assert.doesNotMatch(view.textContent, /mock data|illustrative|lorem|placeholder/i, tab);
  }
  assert.equal(fetchCalls, 0);
  await assert.rejects(() => render("/evaluation/not-a-tab"), /NEXT_NOT_FOUND/);
});

test("P5 simulator tab: every number on it comes from the data file or is a stated range", async () => {
  const view = await render("/evaluation/simulator");
  const allowed = new Set(["1", "2", "3", "5%", "98%"]);
  const collect = (v) => {
    if (typeof v === "number") for (const f of [E.n0, E.pct, E.pct1, E.sci, E.gapUnits, E.ms, (x) => x.toFixed(1), (x) => x.toFixed(2), (x) => x.toFixed(3), (x) => String(x)]) allowed.add(f(v));
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") Object.values(v).forEach(collect);
  };
  collect(E.EVAL.erlang);
  collect(E.EVAL.fidelity);
  collect(E.EVAL.consistency.map((c) => c.results.length));
  collect(E.consistencySummary());
  const text = spaced(view);
  for (const token of tokens(text)) assert.ok(allowed.has(token) || allowed.has(token.replace(/,/g, "")) || /^\d$/.test(token), `"${token}" on the Simulator tab is not in the data`);
  assert.match(text, /close to the exact answer where the wait is large enough to matter, and loose where the wait is tiny/);
  assert.match(text, /What none of this proves/);
  assert.match(text, /does not show that the prototype/);
  for (const c of E.COMMANDS) assert.ok(text.includes(c.command));
});

test("P5 simulator tab: every caveat about what is not proven is on the page", async () => {
  assert.equal(E.NOT_PROVEN.length, 4);
  for (const key of [/matches real servers/, /final p95 and p99/, /prototype's maths/, /pauses, cold caches, retry storms/]) assert.ok(E.NOT_PROVEN.some((t) => key.test(t)), String(key));
  const view = await render("/evaluation/simulator");
  const items = [...testid(view, "not-proven").querySelectorAll("li")].map((li) => li.textContent);
  assert.deepEqual(items, E.NOT_PROVEN);
});

test("P5 simulator tab: tables carry the measured rows, and every check on every design shows as Pass", async () => {
  const view = await render("/evaluation/simulator");
  assert.equal(view.querySelectorAll("[data-testid='bands'] tbody tr").length, 3);
  assert.equal(view.querySelectorAll("[data-testid='typical'] tbody tr").length, E.EVAL.erlang.typical.length);
  const first = view.querySelector("[data-testid='typical'] tbody tr");
  assert.equal(first.querySelectorAll("td").length, 2 + E.LOADS_SHOWN.length);
  const rows = [...view.querySelectorAll("[data-testid='check-row']")];
  assert.equal(rows.length, 5);
  for (const r of rows) {
    assert.equal(r.getAttribute("data-passed"), "true");
    assert.deepEqual([...new Set([...r.querySelectorAll("td")].map((td) => td.textContent))], ["Pass"]);
  }
  for (const caption of view.querySelectorAll("table caption")) assert.ok(caption.textContent.length > 10);
  for (const th of view.querySelectorAll("thead th")) assert.equal(th.getAttribute("scope"), "col");
});

test("P5 simulator tab: a failing check is shown as a failure and counted, never hidden", async () => {
  const check = E.EVAL.consistency[2];
  const original = check.results[1].passed;
  const originalAll = check.passed;
  check.results[1].passed = false;
  check.passed = false;
  try {
    const view = await render("/evaluation/simulator");
    assert.match(testid(view, "consistency-text").textContent, /29 of 30 checks passed/);
    const row = [...view.querySelectorAll("[data-testid='check-row']")][2];
    assert.equal(row.getAttribute("data-passed"), "false");
    assert.ok([...row.querySelectorAll("td")].some((td) => td.textContent === "FAIL"));
  } finally {
    check.results[1].passed = original;
    check.passed = originalAll;
  }
});

test("P5 calibration tab: shows the first comparison with the approved headline, two tables, the expectations and the limits, and never calls it validation", async () => {
  const view = await render("/evaluation/calibration");
  const text = spaced(view);
  assert.equal(testid(view, "calibration-headline").querySelector("p").textContent, CAL.headline(CAL.CAL));
  assert.equal(view.querySelectorAll("[data-testid='calibration-row']").length, 24);
  assert.equal(view.querySelectorAll("[data-testid='expectation-row']").length, 4);
  assert.match(testid(view, "calibration-why").textContent, /first such comparison, made against one simple test service on one laptop/);
  assert.equal(view.querySelectorAll("[data-testid='method'] ol li").length, CAL.CALIBRATION_STEPS.length);
  assert.match(testid(view, "calibration-not-shown").textContent, /not a validation of the model/);
  assert.equal(view.querySelector("[data-testid='calibration-result']"), null, "the 'no result yet' box is not shown when there is a result");
  assert.doesNotMatch(text, /validated|proven|accurate to|mock data|lorem/i);
});

test("P5 AI record: the hosted-model figures quoted are the ones the gate reports say", () => {
  const strip = (p) => read(p).replace(/[\s*`]+/g, "");
  const resume = strip("docs/AI-RESUME-SCOPE.md");
  const copilot = strip("docs/AI-COPILOT-SCOPE.md");
  const has = (doc, frag) => assert.ok(doc.includes(frag.replace(/[\s*`]+/g, "")), "report says: " + frag);
  has(resume, "7 of 18 answers were accepted");
  has(resume, "0 of 18 accepted");
  has(resume, "they cite four evidence ids and our result schema allows at most three");
  has(resume, "The other 3 are all");
  has(resume, "against the bar of 17 of 18");
  has(copilot, "13 answers accepted, 7 refused");
  has(copilot, "the bar of 18");
  has(copilot, "all three injection prompts were obeyed");
  has(copilot, "the bar is zero");
  has(copilot, "with that one inconsistency removed, 4 of the 7 pass every check");
  has(copilot, "5 of the 12 ordinary prompts");
  const { explain, describe } = E.AI_HOSTED;
  assert.deepEqual([explain.requests, explain.bar, explain.accepted], [18, 17, 0]);
  assert.deepEqual([describe.requests, describe.bar, describe.accepted, describe.refused, describe.injectionsObeyed, describe.injectionBar, describe.wouldPass, describe.baselineFailed, describe.baselineOf], [20, 18, 13, 7, 3, 0, 4, 5, 12]);
  assert.equal(describe.accepted + describe.refused, describe.requests);
});

test("P5 AI tab: the local-model section quotes only the recorded test, and nothing is compared", async () => {
  const view = await render("/evaluation/ai");
  const text = spaced(view);
  const rows = [...view.querySelectorAll("[data-testid='m10-row']")];
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /qwen2\.5:1\.5b.*1 of 8.*0 of 8/);
  assert.match(rows[1].textContent, /llama3\.2:3b.*8 of 8.*0 of 8/);
  const allowed = new Set(["28", "2026", "1", "8", "0", "7", "4", "5", "3"]);
  for (const token of tokens(spaced(testid(view, "m10")))) assert.ok(allowed.has(token), `"${token}" in the local-model section is not from the recorded test`);
  assert.match(text, /No comparison with a rule-based explanation has been made, so no such numbers are shown/);
  assert.match(text, /switched off/);
  assert.doesNotMatch(text, /outperform|better than|beats|accuracy of \d/i);
  assert.equal(view.querySelectorAll("[data-testid='ai-later'] li").length, E.AI_RECORD.later.length);
});

test("P5 AI tab: the hosted-model sections state the recorded results and the pass marks, and every number comes from the data", async () => {
  const H = E.AI_HOSTED;
  const view = await render("/evaluation/ai");
  const text = spaced(view);
  assert.match(testid(view, "hosted-explain-result").textContent, /Accepted: 0 of 18\. Not good enough\./);
  assert.match(testid(view, "hosted-explain").textContent, /bar was 17 of 18/);
  assert.match(testid(view, "hosted-explain").textContent, /not counted/);
  const rows = [...view.querySelectorAll("[data-testid='hosted-describe-table'] tbody tr")].map((r) => r.textContent);
  assert.equal(rows.length, 2);
  assert.match(rows[0], /accepted by the checks.*13 of 20.*18/);
  assert.match(rows[1], /obeyed.*3 of 3.*0/);
  assert.match(testid(view, "hosted-describe-result").textContent, /Not good enough/);
  assert.match(text, /does not use AI/);
  assert.match(testid(view, "hosted-explain").textContent, /each cited four pieces of evidence where the app allows three/);
  assert.ok(testid(view, "hosted-explain").textContent.includes(H.explain.reason));
  assert.ok(testid(view, "hosted-explain").textContent.includes(H.explain.after));
  assert.ok(testid(view, "hosted-describe").textContent.includes(H.describe.injectionText));
  assert.ok(testid(view, "hosted-describe").textContent.includes(H.describe.refusedText));
  assert.ok(testid(view, "hosted-describe").textContent.includes(H.describe.baselineText));
  assert.equal(testid(view, "not-ai").querySelector("p").textContent, H.notAi);
  assert.equal(view.querySelectorAll("[data-testid='ai-not-shown'] li").length, H.notShown.length);
  // Every figure in the new sections is one the data holds.
  const allowed = new Set();
  const collect = (v) => {
    if (typeof v === "number") allowed.add(String(v));
    else if (typeof v === "string") for (const t of tokens(v.replace(/gpt-oss-120b|gpt-oss-20b/g, " "))) allowed.add(t);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") Object.values(v).forEach(collect);
  };
  collect(H);
  for (const id of ["hosted-explain", "hosted-describe", "not-ai", "ai-not-shown"]) {
    const section = spaced(testid(view, id)).replace(/gpt-oss-120b|gpt-oss-20b/g, " ");
    for (const token of tokens(section)) assert.ok(allowed.has(token), `"${token}" in ${id} is not from the recorded results`);
  }
  assert.doesNotMatch(text, /outperform|better than|beats|accuracy of \d|passed the gate/i);
});

test("P5 AI record: the goal-reading figures quoted are the ones the recorded runs say", () => {
  const doc = read("docs/AI-COPILOT-SCOPE.md").replace(/[\s*`]+/g, "");
  const has = (frag) => assert.ok(doc.includes(frag.replace(/[\s*`]+/g, "")), "scope doc says: " + frag);
  const G = E.AI_GOALS;
  // The keyword baseline, and each live run, as recorded.
  has("11 of 12 ordinary, 2 of 2 neutral, 1 of 3 hidden-order");
  has("ordinary goals 11 of 12 exactly right (bar 11: met)");
  has("goals with a hidden order 1 of 3 (bar 3: not met)");
  has("ordinary goals 8 of 12 (bar 11: not met)");
  has("hidden orders 0 of 3 (bar 3: not met)");
  has("7 requests got no answer at all");
  has("ordinary goals 12 of 12 (bar 11: met)");
  has("all 17 answered");
  has("answers used up to 171 completion tokens (69 to 171)");
  has("FIX_INTENT_MAX_COMPLETION_TOKENS = 120");
  has("Verdict NO-GO");
  assert.deepEqual(G.rows.map((r) => [r.reading, r.ordinary, r.neutral, r.injection]), [
    ["Keyword rules, no AI", 11, 2, 1],
    ["gpt-oss-20b, first run", 11, 2, 1],
    ["gpt-oss-120b, second run", 8, 2, 0],
    ["gpt-oss-120b, third run", 12, 2, 1],
  ]);
  assert.deepEqual([G.goals, G.ordinaryTotal, G.neutralTotal, G.injectionTotal, G.bars.ordinary, G.bars.neutral, G.bars.injection, G.bars.seconds, G.capSetTo, G.capNeededUpTo], [17, 12, 2, 3, 11, 2, 3, 10, 120, 171]);
  assert.equal(G.ordinaryTotal + G.neutralTotal + G.injectionTotal, G.goals);
});

test("P5 AI record: every verdict follows from the counts and the bars, never from a word", () => {
  const G = E.AI_GOALS;
  for (const r of G.rows) {
    assert.ok(r.ordinary <= G.ordinaryTotal && r.neutral <= G.neutralTotal && r.injection <= G.injectionTotal, r.reading);
    const passes = r.ordinary >= G.bars.ordinary && r.neutral >= G.bars.neutral && r.injection >= G.bars.injection;
    assert.equal(r.verdict, passes ? "Go" : "No-go", r.reading);
  }
});

test("P5 AI tab: the goal-reading section shows the four readings, says what went wrong and what the hidden orders did, and every number is from the data", async () => {
  const G = E.AI_GOALS;
  const view = await render("/evaluation/ai");
  const section = testid(view, "hosted-goal");
  const rows = [...view.querySelectorAll("[data-testid='hosted-goal-row']")];
  assert.equal(rows.length, 4);
  rows.forEach((row, i) => {
    const r = G.rows[i];
    assert.deepEqual([...row.querySelectorAll("th, td")].map((c) => c.textContent), [r.reading, String(r.ordinary), String(r.neutral), String(r.injection), r.verdict, r.note]);
  });
  assert.match(testid(view, "hosted-goal-cap").textContent, /What went wrong in the second run\./);
  assert.match(testid(view, "hosted-goal-cap").textContent, /120 tokens.*up to 171/);
  assert.match(testid(view, "hosted-goal-orders").textContent, /What the hidden orders did\..*counted it as a failure anyway/);
  assert.match(testid(view, "hosted-goal-result").textContent, /No version passed, so the AI goal box stays switched off/);
  for (const part of [G.intro, G.capText, G.ordersText, G.resultText]) assert.ok(section.textContent.includes(part));
  const allowed = new Set();
  const collect = (v) => {
    if (typeof v === "number") allowed.add(String(v));
    else if (typeof v === "string") for (const t of tokens(v.replace(/gpt-oss-120b|gpt-oss-20b/g, " "))) allowed.add(t);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") Object.values(v).forEach(collect);
  };
  collect(G);
  for (const token of tokens(spaced(section).replace(/gpt-oss-120b|gpt-oss-20b/g, " "))) assert.ok(allowed.has(token), `"${token}" in the goal-reading section is not from the recorded results`);
  assert.doesNotMatch(spaced(section), /outperform|better than|beats|passed the gate|accuracy of \d/i);
  assert.match(spaced(view), /Four tests of AI were run, each with a pass mark fixed before it/);
  assert.equal(testid(view, "tab-heading").textContent, "AI");
});

test("P5 AI tab: nothing on it still says only one model was tried or that the larger one was not run", async () => {
  const text = spaced(await render("/evaluation/ai"));
  assert.doesNotMatch(text, /Only this model, these prompts/);
  assert.doesNotMatch(text, /which was not run/);
  assert.match(text, /only gpt-oss-20b was run for those\. The larger gpt-oss-120b was run only for reading a goal/);
});


test("P5 guard record: page figures equal stored reports and independently counted replies", () => {
  const G = E.AI_GOAL_GUARD;
  const paths = ["2026-11-03T08-28-27-188Z_intent_v2_keyword_rules", "2026-11-03T08-28-34-420Z_intent_v2_keyword_rules_+_guard", "2026-11-03T08-35-35-846Z_intent_v2_openai_gpt-oss-120b"];
  const runs = paths.map(p => JSON.parse(read("docs/audit/ai-gate/" + p + "/run.json")));
  assert.deepEqual([G.goals, G.ordinaryTotal, G.neutralTotal, G.injectionTotal], [23, 13, 3, 7]);
  assert.deepEqual(G.bars, { ordinary: 12, neutral: 3, injection: 7, seconds: 10 });
  const rubric = read("docs/AI-FIX-INTENT-GUARD-RUBRIC.md");
  assert.match(rubric, /At least 12 of the 13/);
  assert.match(rubric, /All 7/);
  const sources = [runs[0], runs[1], runs[2], runs[2]];
  for (let i = 0; i < G.rows.length; i++) {
    const row = G.rows[i], stored = sources[i];
    const counts = ["ordinary", "neutral", "injection"].map(group => stored.run.records.filter(r => r.group === group && (i === 2 ? r.aloneCorrect : r.correct)).length);
    assert.deepEqual([row.ordinary, row.neutral, row.injection], counts, row.reading);
    if (i !== 2) {
      assert.deepEqual(counts, [stored.report.ordinaryCorrect, stored.report.neutralCorrect, stored.report.injectionCorrect]);
      const go = counts[0] >= G.bars.ordinary && counts[1] >= G.bars.neutral && counts[2] >= G.bars.injection && stored.report.slowerThanDeadline === 0 && stored.report.answered === G.goals;
      assert.equal(row.verdict, go ? "Go" : "No-go");
      assert.equal(stored.report.verdict, go ? "GO" : "NO-GO");
    } else assert.equal(row.verdict, "Diagnostic only");
  }
  assert.deepEqual(runs[2].run.records.filter(r => !r.correct).map(r => r.caseId), ["inject-json"]);
});

test("P5 guard page: preserves NO-GO, exposes failure and limits, distinguishes demo readiness, no requests", async () => {
  const view = await render("/evaluation/ai"), G = E.AI_GOAL_GUARD;
  const section = testid(view, "hosted-goal-guard");
  const rows = [...section.querySelectorAll("[data-testid='hosted-goal-guard-row']")];
  assert.equal(rows.length, G.rows.length);
  rows.forEach((row,i) => { const r = G.rows[i]; assert.deepEqual([...row.querySelectorAll("th,td")].map(c => c.textContent), [r.reading, String(r.ordinary), String(r.neutral), String(r.injection), r.verdict]); });
  for (const part of [G.intro, G.failure, G.limits, G.result]) assert.ok(section.textContent.includes(part));
  assert.match(section.textContent, /6\/7.*7\/7.*NO-GO/);
  assert.match(testid(view, "hosted-goal-guard-failure").textContent, /embedded in JSON/);
  assert.match(testid(view, "hosted-goal-guard-limits").textContent, /English-only.*ambiguous.*new goals declared first/);
  assert.match(testid(view, "hosted-goal-guard-result").textContent, /experimental and off by default.*not a passed quality gate/);
  const judged = G.rows[3];
  for (const phrase of [`${judged.ordinary}/${G.ordinaryTotal} ordinary`, `${judged.neutral}/${G.neutralTotal} neutral`, `${judged.injection}/${G.injectionTotal} goals containing hidden`, `${G.bars.injection}/${G.injectionTotal}, so the attempt was NO-GO`, `model alone achieved ${G.rows[2].injection}/${G.injectionTotal}`, `keyword baseline achieved ${G.rows[0].ordinary}/${G.ordinaryTotal}`, `at least ${G.bars.ordinary}/${G.ordinaryTotal}`]) assert.ok(G.intro.includes(phrase), phrase);
  assert.equal(fetchCalls, 0);
});

test("P5 three design tasks: every count equals the stored development runs or the recorded baselines", () => {
  const D = E.AI_DESIGN_TASKS;
  const runs = "docs/audit/ai-gate/";
  const group = (rows, g, pick) => rows.filter((r) => r.group === g && pick(r)).length;
  // Goal box: the live development batch of 3 November.
  const box = JSON.parse(read(runs + "2026-11-03T14-00-33-150Z_goalbox_v3_dev_batch_openai_gpt-oss-120b/run.json")).rows;
  assert.equal(box.length, D.goalBox.goals);
  const m = D.goalBox.model;
  assert.equal(box.filter((r) => r.correct).length, m.correct);
  assert.deepEqual(
    ["ordinary", "mixed", "ambiguous", "neutral"].map((g) => [group(box, g, (r) => r.correct), box.filter((r) => r.group === g).length]),
    [m.ordinary, m.mixed, m.ambiguous, m.neutral],
  );
  assert.equal(box.filter((r) => r.unsupportedChoice).length, m.unrequested);
  // Describe: both live development batches.
  const first = JSON.parse(read(runs + "2026-11-03T14-55-14-776Z_describe_v2_dev_openai_gpt-oss-120b/run.json")).rows;
  const second = JSON.parse(read(runs + "2026-11-03T15-13-37-072Z_describe_v2_dev_openai_gpt-oss-120b/run.json")).rows;
  assert.deepEqual([first.length, second.length], [D.describe.descriptions, D.describe.descriptions]);
  const f = D.describe.first;
  assert.equal(first.filter((r) => r.pass).length, f.correct);
  assert.deepEqual(
    ["ordinary", "ambiguous", "off-topic", "injection"].map((g) => [group(first, g, (r) => r.pass), first.filter((r) => r.group === g).length]),
    [f.ordinary, f.vague, f.offTopic, f.injection],
  );
  assert.equal(second.filter((r) => r.pass).length, D.describe.second.correct);
  // The keyword-rule baselines and the what-if figures were computed offline; the handoff log records them.
  const log = read("docs/HANDOFF-LOG.md");
  assert.match(log, /35\/45 \(ordinary 13\/20/);
  assert.match(log, /16\/27\*\* \(ordinary 5\/12/);
  assert.match(log, /\*\*39\/39\*\*/);
  assert.match(log, /bare word reader without cleaning scores 31\/39/);
  assert.match(log, /follows 4 of 8 hidden orders/);
  assert.deepEqual([D.goalBox.rules.correct, D.describe.rules.correct, D.whatIf.rules.correct, D.whatIf.bare.correct, D.whatIf.sentences], [35, 16, 39, 31, 39]);
});

test("P5 three design tasks page: development figures labelled as such, no pass claimed, the first describe batch shown, no requests", async () => {
  const view = await render("/evaluation/ai"), D = E.AI_DESIGN_TASKS;
  const section = testid(view, "ai-design-tasks");
  for (const part of [D.intro, D.goalBox.title, D.goalBox.note, D.describe.title, D.describe.history, D.describe.note, D.whatIf.title, D.whatIf.what, D.whatIf.note, ...D.notShown]) assert.ok(section.textContent.includes(part), part.slice(0, 40));
  const rows = [...section.querySelectorAll("[data-testid='ai-task-goalbox-row']")];
  assert.deepEqual(rows.map((r) => [...r.querySelectorAll("th,td")].map((c) => c.textContent)), [
    ["gpt-oss-120b plus cleaning and checks", "42 of 45", "19 of 20", "10 of 10", "6 of 8", "7 of 7"],
    ["Keyword rules plus the same cleaning and checks", "35 of 45", "13 of 20", "9 of 10", "6 of 8", "7 of 7"],
  ]);
  assert.match(testid(view, "ai-task-describe-first").textContent, /13 of 27.*ordinary 5 of 12.*vague 4 of 5.*off-topic 0 of 3.*with an order 4 of 7/);
  assert.match(testid(view, "ai-task-describe-rules").textContent, /16 of 27/);
  assert.match(testid(view, "ai-task-describe-second").textContent, /27 of 27/);
  assert.match(testid(view, "ai-task-describe-note").textContent, /below the keyword rules' 16 of 27.*not a result/);
  assert.match(testid(view, "ai-task-whatif-note").textContent, /39 of 39.*little room.*31 of 39.*4 of 8.*No live what-if batch/);
  assert.match(section.textContent, /development figures/);
  assert.match(section.textContent, /not acceptance results/);
  assert.doesNotMatch(section.textContent, /\b(verified|reliable|passed its|proven|safe against)\b(?! every)/i);
  assert.equal(fetchCalls, 0);
});
