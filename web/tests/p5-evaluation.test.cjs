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

test("P5 registry: the Evaluation routes are public and honest, still 40 routes, and only the three tabs exist", () => {
  assert.equal(ROUTES.length, 40);
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
  const expected = { simulator: "Measured", calibration: "Not yet measured", ai: "Parked, not evaluated" };
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

test("P5 calibration tab: says not yet measured, gives the method, and shows no number and no table", async () => {
  const view = await render("/evaluation/calibration");
  const text = spaced(view);
  assert.deepEqual(tokens(text), [], "no figures at all on the Calibration tab");
  assert.equal(view.querySelectorAll("table").length, 0);
  assert.match(testid(view, "calibration-why").textContent, /no accuracy figure for the model against real systems, and this page shows none/);
  assert.equal(view.querySelectorAll("[data-testid='method'] ol li").length, E.CALIBRATION_STEPS.length);
  assert.match(testid(view, "calibration-result").textContent, /There is no result yet/);
  assert.doesNotMatch(text, /validated|proven|accurate to/i);
});

test("P5 AI tab: says parked, quotes only the recorded test, and compares nothing", async () => {
  const view = await render("/evaluation/ai");
  const text = spaced(view);
  const rows = [...view.querySelectorAll("[data-testid='m10-row']")];
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /qwen2\.5:1\.5b.*1 of 8.*0 of 8/);
  assert.match(rows[1].textContent, /llama3\.2:3b.*8 of 8.*0 of 8/);
  const allowed = new Set(["28", "2026", "1", "8", "0", "7", "4", "5", "3"]);
  for (const token of tokens(text)) assert.ok(allowed.has(token), `"${token}" on the AI tab is not from the recorded test`);
  assert.match(text, /No comparison with a rule-based explanation has been made, so no such numbers are shown/);
  assert.match(text, /switched off/);
  assert.doesNotMatch(text, /outperform|better than|beats|accuracy of \d/i);
  assert.equal(view.querySelectorAll("[data-testid='ai-later'] li").length, E.AI_RECORD.later.length);
});
