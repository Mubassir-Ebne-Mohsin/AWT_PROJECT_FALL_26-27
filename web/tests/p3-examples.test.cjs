const { test, afterEach, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost:3000" });
for (const name of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "HTMLInputElement", "HTMLSelectElement", "localStorage"]) {
  Object.defineProperty(global, name, { configurable: true, value: dom.window[name] });
}
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const h = React.createElement;

let pathname = "/examples";
let authStatus = "anon";
require.cache[require.resolve("next/navigation")] = { exports: { usePathname: () => pathname, useRouter: () => ({ replace() {}, push() {} }), useSearchParams: () => new URLSearchParams(""), notFound() { throw new Error("NEXT_NOT_FOUND"); } } };
require.cache[require.resolve("next/link")] = { exports: { __esModule: true, default: ({ children, ...props }) => h("a", props, children) } };
require.cache[require.resolve("../src/components/auth/auth-provider.tsx")] = { exports: { useAuth: () => ({ user: authStatus === "authed" ? { id: "u1" } : null, status: authStatus, signOut() {} }), initialsOf: () => "X" } };
const X = require("../src/lib/examples.ts");
const { ExamplesPage, TemplatesPage, ComponentsPage } = require("../src/components/examples/examples.tsx");
const { ROUTES, resolveRoute } = require("../src/lib/routes.ts");

let roots = [];
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
async function render(Component) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(h(Component)));
  await settle();
  return container;
}
beforeEach(() => { authStatus = "anon"; });
afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount());
  roots = [];
  document.body.innerHTML = "";
});
const click = async (el) => { await act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await settle(); };
const setRange = async (el, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, String(value));
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
};
const T = (id) => X.templateById(id);
const ids = (list) => list.map((t) => t.id).sort();

// ---------- the data and the tags ----------

test("P3 data: six templates, a 12-component catalog and five traffic presets, with the registry now 48 routes", () => {
  assert.deepEqual(ids(X.TEMPLATES), ["checkout", "content", "ingest", "media", "mvp", "three-tier"]);
  assert.deepEqual(X.TEMPLATES.map((t) => t.name), ["Classic three-tier web app", "Read-heavy content site", "Write-heavy ingest pipeline", "E-commerce checkout", "Single-server MVP", "Photo sharing"]);
  assert.equal(X.CATALOG.components.length, 12);
  assert.equal(X.CATALOG.presets.length, 5);
  assert.equal(X.CATALOG.regions.length, 3);
  assert.equal(ROUTES.length, 48);
  for (const id of ["examples", "templates", "components", "new-template"]) assert.equal(ROUTES.find((r) => r.id === id).fidelity, "C", id);
  assert.equal(resolveRoute("/examples").route.area, "public");
  assert.equal(resolveRoute("/templates").route.area, "app");
  assert.equal(resolveRoute("/components").route.area, "app");
});

test("P3 tags: worked out from each design, matching what is actually in it", () => {
  const tagIds = (id) => X.tagsOf(T(id).graph).map((t) => t.id).sort();
  assert.deepEqual(tagIds("three-tier"), ["cache"]);
  assert.deepEqual(tagIds("content"), ["cache", "cdn", "replicas"]);
  assert.deepEqual(tagIds("ingest"), ["queue"]);
  assert.deepEqual(tagIds("checkout"), ["cache", "cdn", "external", "queue"]);
  assert.deepEqual(tagIds("mvp"), []);
  assert.deepEqual(tagIds("media"), ["cache", "cdn", "storage"]);
  // A changed design changes its tags.
  const graph = JSON.parse(JSON.stringify(T("mvp").graph));
  graph.nodes.push({ id: "q", type: "queue", label: "Q", x: 0, y: 0, props: {} }, { id: "r", type: "replica", label: "R", x: 0, y: 0, props: { region: "eu-west" } });
  assert.deepEqual(X.tagsOf(graph).map((t) => t.id).sort(), ["queue", "regions", "replicas"]);
});

test("P3 tags: only tags that apply to something are offered, and the filter needs every chosen tag", () => {
  assert.deepEqual(X.tagsInUse().map((t) => t.id), ["cache", "queue", "cdn", "replicas", "storage", "external"], "no template spans regions, so that tag is not offered");
  assert.deepEqual(ids(X.filterByTags(X.TEMPLATES, [])), ids(X.TEMPLATES));
  assert.deepEqual(ids(X.filterByTags(X.TEMPLATES, ["cache"])), ["checkout", "content", "media", "three-tier"]);
  assert.deepEqual(ids(X.filterByTags(X.TEMPLATES, ["queue"])), ["checkout", "ingest"]);
  assert.deepEqual(ids(X.filterByTags(X.TEMPLATES, ["cache", "queue"])), ["checkout"]);
  assert.deepEqual(ids(X.filterByTags(X.TEMPLATES, ["replicas"])), ["content"]);
  assert.deepEqual(ids(X.filterByTags(X.TEMPLATES, ["queue", "storage"])), []);
  assert.deepEqual(ids(X.filterByTags(X.TEMPLATES, ["not-a-tag"])), []);
});

// ---------- the words ----------

test("P3 words: the breaking point names the real number, first failure and cause", () => {
  for (const t of X.TEMPLATES) {
    const text = X.breakingPointText(t);
    assert.ok(text.includes(X.n0(t.limits.passingRps)), t.id + " number");
    assert.ok(text.includes(t.limits.firstLabel), t.id + " first failure");
    assert.match(text, /because of (latency|errors|both)/);
  }
  assert.match(X.breakingPointText(T("three-tier")), /about 1,199 requests a second.*App servers.*latency/);
  assert.match(X.breakingPointText(T("mvp")), /about 491 requests a second/);
  assert.match(X.breakingPointText(T("content")), /about 4,641/);
});

test("P3 words: an example that misses its own goal says so, and says why; one that passes does not claim otherwise", () => {
  const three = X.ownResultText(T("three-tier"));
  assert.match(three, /misses its goal/);
  assert.match(three, /p95 313 ms/);
  assert.match(three, /breaking point \(about 1,199 requests a second\) is below the 1,200 it is tested at/);
  assert.match(X.ownResultText(T("checkout")), /misses its goal.*p95 1,572 ms/);
  assert.match(X.ownResultText(T("ingest")), /close to the edge/);
  const mvp = X.ownResultText(T("mvp"));
  assert.match(mvp, /meets its goal/);
  assert.doesNotMatch(mvp, /misses|is below the/);
  assert.match(X.ownResultText(T("content")), /Nothing is under strain/);
  assert.match(X.ownResultText(T("three-tier")), /The busiest component is App servers at 1\d\d% utilization/);
});

test("P3 words: every number in the main sentences comes from the data file", () => {
  const nums = (value, out = new Set()) => {
    if (typeof value === "number") for (const f of [X.n0, X.pct, X.pct1]) out.add(f(value));
    else if (Array.isArray(value)) value.forEach((v) => nums(v, out));
    else if (value && typeof value === "object") Object.values(value).forEach((v) => nums(v, out));
    return out;
  };
  const tokens = (s) => s.match(/(?<![A-Za-z])\d[\d,]*(?:\.\d+)?%?/g) ?? [];
  for (const t of X.TEMPLATES) {
    const allowed = nums({ traffic: t.traffic, result: t.result, limits: { ...t.limits, curve: [] } });
    for (const sentence of [X.ownResultText(t), X.breakingPointText(t), X.goalText(t.traffic)])
      for (const token of tokens(sentence)) assert.ok(allowed.has(token) || /^\d$/.test(token), `${t.id}: "${token}" in "${sentence}" is not in the data`);
    for (let i = 0; i < t.limits.curve.length; i++) {
      const allowedCurve = nums(t.limits.curve[i], new Set([X.n0(t.traffic.sloP95)]));
      for (const token of tokens(X.curveText(t, i))) assert.ok(allowedCurve.has(token) || /^\d$/.test(token), `${t.id}[${i}]: ${token}`);
    }
  }
});

test("P3 words: the load explorer text matches the curve point, judges it against the goal, and clamps its index", () => {
  const t = T("mvp");
  const i = X.nearestCurveIndex(t);
  const best = t.limits.curve.reduce((b, p, k) => (Math.abs(p.rps - t.traffic.rps) < Math.abs(t.limits.curve[b].rps - t.traffic.rps) ? k : b), 0);
  assert.equal(i, best);
  const first = t.limits.curve[0], last = t.limits.curve[t.limits.curve.length - 1];
  assert.match(X.curveText(t, 0), new RegExp(`At ${X.n0(first.rps)} requests a second: p95 ${X.n0(first.p95)} ms`));
  assert.match(X.curveText(t, 0), /meets the goal/);
  assert.match(X.curveText(t, 44), /misses the goal/);
  assert.equal(X.curveText(t, -5), X.curveText(t, 0));
  assert.equal(X.curveText(t, 999), X.curveText(t, 44));
  assert.ok(last.rps > t.limits.passingRps && first.rps < t.limits.passingRps, "the curve spans the breaking point");
});

test("P3 words: a load level that is fast enough but drops too many requests is judged as missing the goal", () => {
  const t = JSON.parse(JSON.stringify(T("mvp")));
  t.limits.curve[3] = { rps: 100, p50: 10, p95: 50, p99: 80, err: 0.2, maxRho: 0.3 };
  assert.ok(50 <= t.traffic.sloP95 && 0.2 > t.traffic.errorBudget);
  assert.match(X.curveText(t, 3), /20% errors.*misses the goal/);
  t.limits.curve[3].err = 0;
  assert.match(X.curveText(t, 3), /meets the goal/);
  t.limits.curve[3] = { rps: 100, p50: 10, p95: t.traffic.sloP95 + 1, p99: 80, err: 0, maxRho: 0.3 };
  assert.match(X.curveText(t, 3), /misses the goal/, "slow enough to miss even with no errors");
});

test("P3 words: each overload behaviour is described by what it really does", () => {
  assert.match(X.BEHAVIOR_WORD.shed, /drops/);
  assert.match(X.BEHAVIOR_WORD.backlog, /backlog/);
  assert.match(X.BEHAVIOR_WORD.timeout, /time out/);
  assert.match(X.BEHAVIOR_WORD.reject, /turns away/);
  assert.match(X.BEHAVIOR_WORD.none, /no limit/);
  assert.equal(new Set(Object.values(X.BEHAVIOR_WORD)).size, 5, "five different descriptions");
  const sentenceFor = (type) => `It ${X.BEHAVIOR_WORD[X.CATALOG.components.find((c) => c.type === type).behavior]}.`;
  assert.match(sentenceFor("worker"), /backlog/);
  assert.match(sentenceFor("app"), /drops/);
  assert.match(sentenceFor("client"), /no limit/);
});

test("P3 words: every overload behaviour has plain words, and the component descriptions come from the catalog", () => {
  const behaviours = new Set(X.CATALOG.components.map((c) => c.behavior));
  assert.deepEqual([...behaviours].sort(), ["backlog", "none", "reject", "shed", "timeout"]);
  for (const b of behaviours) assert.ok(X.BEHAVIOR_WORD[b] && X.BEHAVIOR_WORD[b].length > 10, b);
  const by = Object.fromEntries(X.CATALOG.components.map((c) => [c.type, c]));
  assert.match(X.capacityText(by.client), /no limit/);
  assert.equal(X.capacityText(by.app), "600 requests a second per replica");
  assert.match(X.defaultsText(by.cache), /1 replica, hit ratio 80%/);
  assert.match(X.defaultsText(by.queue), /queue limit 500,000/);
  assert.match(X.defaultsText(by.storage), /15% of traffic/);
  assert.deepEqual(X.byCategory().map(([c]) => c), ["Entry", "Edge", "Routing", "Compute", "Data", "Async", "External"]);
  assert.equal(X.byCategory().flatMap(([, l]) => l).length, 12);
  assert.match(X.presetText(X.CATALOG.presets[0]), /400 requests a second, bursts ×1\.2, 80% reads, p95 goal 300 ms, steady shape/);
  assert.equal(X.startPath("mvp"), "/new/template?template=mvp");
});

// ---------- the examples page ----------

test("P3 examples: six panels with a verdict, their own-traffic result, a breaking point and a way to copy them", async () => {
  const view = await render(ExamplesPage);
  assert.equal(view.querySelectorAll("h1").length, 1);
  const panels = [...view.querySelectorAll("[data-testid='example-panel']")];
  assert.equal(panels.length, 6);
  assert.deepEqual(panels.map((p) => p.id), X.TEMPLATES.map((t) => t.id));
  for (const [i, p] of panels.entries()) {
    const t = X.TEMPLATES[i];
    assert.equal(p.getAttribute("data-verdict"), t.result.verdict);
    assert.equal(p.querySelector("[data-testid='own-result']").textContent, X.ownResultText(t));
    assert.equal(p.querySelector("[data-testid='breaking-point']").textContent, X.breakingPointText(t));
    assert.ok(p.querySelector("svg[role=img]"), t.id + " has a preview");
    assert.match(p.textContent, /Model estimate, not a measurement/);
  }
  const jump = [...view.querySelectorAll("nav[aria-label='Jump to an example'] a")];
  assert.deepEqual(jump.map((a) => a.getAttribute("href")), X.TEMPLATES.map((t) => "#" + t.id));
  assert.match(view.textContent, /Nothing here was measured on real servers/);
});

test("P3 examples: the load explorer starts near the example's own traffic and follows the slider, in words, across the whole range", async () => {
  const view = await render(ExamplesPage);
  const panel = view.querySelector("#three-tier");
  const slider = panel.querySelector("input[type=range]");
  const t = T("three-tier");
  assert.equal(slider.max, "44");
  assert.equal(Number(slider.value), X.nearestCurveIndex(t));
  assert.ok(slider.getAttribute("aria-valuetext") && panel.querySelector("label[for='" + slider.id + "']"));
  const summary = () => panel.querySelector("[data-testid='explorer-summary']").textContent;
  for (const i of [0, 10, 22, 44]) {
    await setRange(slider, i);
    assert.equal(summary(), X.curveText(t, i));
    assert.doesNotMatch(summary(), /NaN|Infinity|undefined/);
  }
  assert.match(panel.textContent, /Nothing is calculated as you move the slider/);
});

test("P3 examples: a guest is sent to sign up and returned to the template; a signed-in person goes straight to it", async () => {
  let view = await render(ExamplesPage);
  const guest = [...view.querySelectorAll("[data-testid='make-copy']")].map((a) => a.getAttribute("href"));
  assert.deepEqual(guest, X.TEMPLATES.map((t) => "/register?next=" + encodeURIComponent("/new/template?template=" + t.id)));
  assert.match(view.querySelector("[data-testid='make-copy']").textContent, /Make your own copy of/);
  document.body.innerHTML = "";
  authStatus = "authed";
  view = await render(ExamplesPage);
  assert.deepEqual([...view.querySelectorAll("[data-testid='make-copy']")].map((a) => a.getAttribute("href")), X.TEMPLATES.map((t) => "/new/template?template=" + t.id));
  document.body.innerHTML = "";
  authStatus = "loading";
  view = await render(ExamplesPage);
  assert.match(view.querySelector("[data-testid='make-copy']").getAttribute("href"), /^\/register\?next=/, "while we do not know who it is, the safe choice is sign-up");
});

// ---------- the templates page ----------

test("P3 templates: six cards with derived tags and a start link, and the filter shows exactly the matching ones", async () => {
  const view = await render(TemplatesPage);
  const cards = () => [...view.querySelectorAll("[data-testid='template-card']")];
  assert.equal(cards().length, 6);
  assert.equal(view.querySelector("[data-testid='template-count']").textContent, "Showing 6 of 6 templates");
  for (const c of cards()) {
    const t = T(c.getAttribute("data-id"));
    assert.deepEqual([...c.querySelectorAll("[data-testid='tag']")].map((e) => e.textContent), X.tagsOf(t.graph).map((g) => g.label));
    assert.equal(c.querySelector("[data-testid='start-template']").getAttribute("href"), "/new/template?template=" + t.id);
    assert.equal(c.querySelector("[data-testid='template-breaking']").textContent, X.breakingPointText(t));
  }
  const box = (label) => [...view.querySelectorAll("[data-testid='tag-filter'] input")].find((i) => i.parentElement.textContent.trim() === label);
  assert.equal(view.querySelectorAll("[data-testid='tag-filter'] input").length, 6);
  await click(box("Has a queue"));
  assert.deepEqual(cards().map((c) => c.getAttribute("data-id")).sort(), ["checkout", "ingest"]);
  assert.equal(view.querySelector("[data-testid='template-count']").textContent, "Showing 2 of 6 templates");
  await click(box("Has a cache"));
  assert.deepEqual(cards().map((c) => c.getAttribute("data-id")), ["checkout"]);
  await click(box("Uses object storage"));
  assert.equal(cards().length, 0);
  assert.match(view.textContent, /No template has all of those/);
  await click(box("Uses object storage"));
  await click(box("Has a queue"));
  await click(box("Has a cache"));
  assert.equal(cards().length, 6);
});

// ---------- the components page ----------

test("P3 components: all twelve in their categories with the overload behaviour in words, then the five traffic presets", async () => {
  const view = await render(ComponentsPage);
  assert.equal(view.querySelectorAll("h1").length, 1);
  assert.deepEqual([...view.querySelectorAll("[data-testid='category'] > h2")].map((e) => e.textContent), ["Entry", "Edge", "Routing", "Compute", "Data", "Async", "External"]);
  const cards = [...view.querySelectorAll("[data-testid='component-card']")];
  assert.equal(cards.length, 12);
  for (const c of cards) {
    const comp = X.CATALOG.components.find((k) => k.type === c.getAttribute("data-type"));
    assert.equal(c.querySelector("h3").textContent, comp.label);
    assert.equal(c.querySelector("[data-testid='overload']").textContent, `It ${X.BEHAVIOR_WORD[comp.behavior]}.`);
    assert.ok(c.textContent.includes(X.capacityText(comp)));
  }
  const db = view.querySelector("[data-type='db']");
  assert.match(db.querySelector("[data-testid='overload']").textContent, /wait until they time out/);
  assert.match(view.querySelector("[data-type='queue']").textContent, /queue size limit/);
  const presets = [...view.querySelectorAll("[data-testid='preset-row']")];
  assert.deepEqual(presets.map((p) => p.querySelector("h3").textContent), X.CATALOG.presets.map((p) => p.name));
  assert.equal(presets.length, 5);
  assert.match(view.textContent, /They describe load, not products/);
  assert.doesNotMatch(view.textContent, /Postgres|Redis cluster|4-core/i, "no invented product presets");
});
