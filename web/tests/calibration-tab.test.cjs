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

// The Calibration tab: every claim and figure on it is tied to calibration-data.json (the engine's predictions over the
// stored measurements), and to the findings document the user read. If the data stops supporting a sentence, a test here fails.
let pathname = "/evaluation/calibration";
require.cache[require.resolve("next/navigation")] = { exports: { usePathname: () => pathname, useRouter: () => ({ replace() {}, push() {} }), useSearchParams: () => new URLSearchParams(""), notFound() { throw new Error("NEXT_NOT_FOUND"); } } };
require.cache[require.resolve("next/link")] = { exports: { __esModule: true, default: ({ children, ...props }) => h("a", props, children) } };
global.fetch = () => Promise.reject(new Error("the evaluation page must not make requests"));

const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const dataPath = require.resolve("../src/lib/calibration-data.json");
const rawData = require(dataPath);
const C = require("../src/lib/calibration.ts");
const { EvaluationPage } = require("../src/components/evaluation/evaluation.tsx");

let roots = [];
async function render(Page = EvaluationPage) {
  const container = document.createElement("div");
  document.body.append(container);
  const r = createRoot(container);
  roots.push(r);
  await act(async () => r.render(h(Page)));
  return container;
}
afterEach(async () => {
  for (const r of roots) await act(async () => r.unmount());
  roots = [];
  document.body.innerHTML = "";
});
const testid = (v, id) => v.querySelector(`[data-testid='${id}']`);
const one = rawData.configs.find((c) => c.workers === 1);
const four = rawData.configs.find((c) => c.workers === 4);

test("the headline is the approved wording with every figure taken from the data", () => {
  const text = C.headline(rawData);
  assert.ok(text.startsWith("Measured on one laptop against one simple service. For this service the model was cautious: it predicted slower responses than were measured at nearly every load, "));
  assert.ok(text.endsWith("This shows how the formula behaves for a service with a fixed cost per request. It does not show how accurate the model is for real applications."));
  assert.match(text, /put the breaking point earlier for one server \(17\.5 against 25\.4 requests a second\)/);
  assert.match(text, /within 9% for four servers \(149 against 164\)/);
  assert.match(text, /At 120% of capacity with four servers it predicted a much lower error rate than was measured \(20\.5% against 56\.6%\)/);
});

test("the headline rounds the difference to the nearest percent, from whatever the data says", () => {
  const variant = (relativeDifference) => ({ ...rawData, configs: rawData.configs.map((c) => (c.workers === 4 ? { ...c, breakingPoint: { ...c.breakingPoint, relativeDifference } } : c)) });
  assert.match(C.headline(variant(0.096)), /within 10% for four servers/);
  assert.match(C.headline(variant(0.094)), /within 9% for four servers/);
  assert.match(C.headline(variant(0.0049)), /within 0% for four servers/);
});

test("each claim in the headline is still true of the data", () => {
  const compared = (c) => c.rows.filter((r) => r.compared && !r.censored && r.direction);
  const all = [...compared(one), ...compared(four)];
  const higher = all.filter((r) => r.direction === "model higher").length;
  assert.ok(higher / all.length >= 0.8, `nearly every load: ${higher} of ${all.length}`);
  assert.ok(one.breakingPoint.modelRps < one.breakingPoint.measuredRps, "earlier for one server");
  assert.ok(four.breakingPoint.relativeDifference < 0.1, "within about 9% for four servers");
  const hi = four.rows.find((r) => r.level === 1.2);
  assert.ok(hi.modelErrorRate < hi.measuredErrorRate / 2, "a much lower error rate");
});

test("the headline matches the findings document the user read", () => {
  const doc = read("docs/CALIBRATION-FINDINGS.md");
  for (const phrase of ["17.5 against 25.4 requests a second", "149 against 164", "20.5% against 56.6%", "cautious on this service"]) assert.ok(doc.includes(phrase), phrase);
});

test("the status says what this is, and with no data it says not yet measured and shows no figure", async () => {
  assert.equal(C.calibrationStatus(C.CAL), "Measured on one machine, one toy service");
  assert.equal(C.calibrationStatus(null), "Not yet measured");
  // Load the page again with an empty data file.
  const key = (name) => require.resolve(name);
  const keep = require.cache[dataPath];
  require.cache[dataPath] = { id: dataPath, filename: dataPath, loaded: true, exports: {} };
  for (const f of ["../src/lib/calibration.ts", "../src/lib/evaluation.ts", "../src/components/evaluation/evaluation.tsx"]) delete require.cache[key(f)];
  try {
    const Empty = require("../src/components/evaluation/evaluation.tsx").EvaluationPage;
    const view = await render(Empty);
    assert.equal(testid(view, "status").textContent.trim(), "Not yet measured");
    assert.equal(view.querySelectorAll("table").length, 0);
    assert.equal(testid(view, "calibration-headline"), null);
    assert.match(testid(view, "calibration-result").textContent, /There is no result yet/);
    assert.match(testid(view, "calibration-why").textContent, /this page shows no figure/);
  } finally {
    require.cache[dataPath] = keep;
    for (const f of ["../src/lib/calibration.ts", "../src/lib/evaluation.ts", "../src/components/evaluation/evaluation.tsx"]) delete require.cache[key(f)];
    require("../src/components/evaluation/evaluation.tsx");
  }
});

test("every table cell is the data value, formatted: p95 with its range, the model p95, and the difference", async () => {
  const view = await render();
  for (const c of [one, four]) {
    const rows = [...testid(view, `calibration-table-${c.workers}`).querySelectorAll("[data-testid='calibration-row']")];
    assert.equal(rows.length, c.rows.length);
    rows.forEach((tr, i) => {
      const r = c.rows[i];
      const cells = [...tr.querySelectorAll("th,td")].map((x) => x.textContent);
      assert.equal(cells[0], `${Math.round(r.level * 100)}%`);
      assert.equal(cells[2], `${Math.round(r.measuredP95).toLocaleString("en-US")} (${Math.round(r.measuredP95Min).toLocaleString("en-US")} to ${Math.round(r.measuredP95Max).toLocaleString("en-US")})`);
      assert.equal(cells[3], Math.round(r.modelP95).toLocaleString("en-US"));
      assert.equal(cells[4], r.censored ? "not comparable" : `${r.differencePercent >= 0 ? "+" : "−"}${Math.round(Math.abs(r.differencePercent))}%`);
      assert.equal(tr.getAttribute("data-censored"), String(r.censored));
    });
  }
});

test("the notes mark the fit steps, the rows where requests timed out, and the differences inside the spread", async () => {
  const view = await render();
  for (const c of [one, four]) {
    const rows = [...testid(view, `calibration-table-${c.workers}`).querySelectorAll("[data-testid='calibration-row']")];
    rows.forEach((tr, i) => {
      const r = c.rows[i];
      const note = [...tr.querySelectorAll("td")].at(-1).textContent;
      if (!r.compared) assert.match(note, /used to fit/);
      else if (r.censored) assert.match(note, /not like for like/);
      else if (r.meaningful === false) assert.match(note, /within the spread/);
      else assert.equal(note, "");
    });
  }
  // The rows above the limit with timeouts really are the ones marked.
  assert.ok(one.rows.filter((r) => r.censored).length >= 2 && four.rows.some((r) => r.censored));
});

test("the breaking-point sentences state the data's loads and the difference", async () => {
  const view = await render();
  for (const c of [one, four]) {
    const text = testid(view, `calibration-breaking-${c.workers}`).textContent;
    const b = c.breakingPoint;
    assert.ok(text.includes((Math.round(b.measuredRps * 10) / 10).toFixed(1)), text);
    assert.ok(text.includes((Math.round(b.modelRps * 10) / 10).toFixed(1)), text);
    assert.ok(text.includes(`${Math.round(b.relativeDifference * 100)}%`), text);
  }
});

test("the four expectations are listed with their verdict under every way of fitting, and match the written record", async () => {
  const view = await render();
  const rows = [...view.querySelectorAll("[data-testid='expectation-row']")];
  assert.equal(rows.length, 4);
  const word = (v) => (v === null ? "undetermined" : v ? "held" : "did not hold");
  rows.forEach((tr, i) => {
    const e = rawData.expectations[i];
    const cells = [...tr.querySelectorAll("th,td")].map((x) => x.textContent);
    assert.equal(cells[1], word(e.held));
    assert.deepEqual(cells.slice(3), [word(e.byVariant.committed), word(e.byVariant.noExclusions), word(e.byVariant.corrected)]);
  });
  assert.deepEqual(rawData.expectations.map((e) => e.held), [true, true, false, true]);
  const doc = read("docs/CALIBRATION-EXPECTATIONS.md");
  assert.match(doc, /\| 3\. .*undetermined \(steps missing\) \| not held \| not held \|/);
});

test("the trust section discloses the correction with the data's own numbers, and the limits are always stated", async () => {
  const view = await render();
  const text = testid(view, "calibration-trust").textContent;
  const c = rawData.correction;
  assert.match(text, /A rule was changed after the first analysis/);
  assert.ok(text.includes(`${c.stepsExcludedByCommittedRule} of ${c.stepsTotal} steps`));
  assert.ok(text.includes(`${(Math.round(c.committedFourWorkerCapacityRps * 10) / 10).toFixed(1)} requests a second`));
  assert.ok(text.includes(`${c.committedFourWorkerServers} servers instead of 4`));
  assert.match(text, /chosen after the first results were seen/);
  assert.match(text, /One laptop, one service, one day/);
  assert.match(testid(view, "calibration-not-shown").textContent, /accurate for any real application.*not a validation of the model/);
});

test("the setup and machine sentences are the data's", async () => {
  const view = await render();
  const setup = testid(view, "calibration-setup").textContent;
  assert.match(setup, /20 ms of work per request, with 1 and 4 worker threads/);
  assert.match(setup, /12 load levels from 10% to 120%/);
  assert.match(setup, /30 seconds per level after a 5 second warm-up, 3 times/);
  assert.match(testid(view, "calibration-machine").textContent, /i5-12450H, 12 threads, 7\.7 GB/);
  assert.match(testid(view, "calibration-machine").textContent, /Other programs were running/);
});

test("every command the tab tells you to run is real: a script in its package.json, or a file that exists", () => {
  for (const c of C.CAL_COMMANDS) {
    if (c.check.kind === "script") {
      const scripts = JSON.parse(read(c.check.file)).scripts;
      assert.ok(scripts[c.check.script], c.command);
      assert.ok(fs.existsSync(path.join(root, c.dir)), c.dir);
    } else {
      assert.ok(fs.existsSync(path.join(root, c.check.file)), c.command);
    }
  }
});

test("the method has seven steps, in the past tense, and the page never says validated or accurate without a limit", async () => {
  const view = await render();
  assert.equal(C.CALIBRATION_STEPS.length, 7);
  assert.equal(view.querySelectorAll("[data-testid='method'] ol li").length, 7);
  const text = view.textContent;
  assert.doesNotMatch(text, /\bvalidated\b|\bproven\b|certified/i);
  for (const m of text.matchAll(/accurate/gi)) {
    const around = text.slice(Math.max(0, m.index - 80), m.index + 80);
    assert.match(around, /not show|not a validation|does not|never/i, around);
  }
});

test("the other tabs and the ever-present limits still hold: the Simulator tab no longer says no real service was compared", async () => {
  pathname = "/evaluation/simulator";
  const view = await render();
  const text = testid(view, "not-proven").textContent;
  assert.match(text, /compared with one simple test service on one laptop \(see Calibration\), not with any real application/);
  assert.doesNotMatch(text, /No real application has been load-tested/);
  pathname = "/evaluation/calibration";
});
