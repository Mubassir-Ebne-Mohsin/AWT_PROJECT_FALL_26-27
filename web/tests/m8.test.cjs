const { test } = require("node:test"),
  assert = require("node:assert/strict");
const React = require("react"),
  { renderToStaticMarkup } = require("react-dom/server");
const { EditorSession } = require("../src/lib/editor-session");
const L = require("../src/lib/limits-presentation");
const { runHref, workspaceHref } = require("../src/lib/run-links");
const { designStatus } = require("../src/lib/design-status");
const { ApiError } = require("../src/lib/api/errors");

const traffic = (rps = 300) => ({ preset: "custom", rps, burst: 2, readRatio: 1, sloP95: 300, errorBudget: 0.01, durationMin: 10, shape: "steady" });
const node = (id, label, rho) => ({ id, type: "app", label, region: "us-east", reads: 1, writes: 0, async: 0, peak: 1, cap: { kind: "finite", value: 1 }, rho, status: "ok", background: false, T: 1, S: 1, Wq: 0, servers: 1, errors: 0, visit: 1, contribution: 1, satRps: { kind: "finite", value: 100 } });
const summary = (rps = 300) => ({ traffic: traffic(rps), rps, peakRps: rps * 2, p50: 1, p95: 2, p99: 3, mean: 1, errorRate: 0, throughput: rps, sloMet: true, verdict: "pass", validation: { ok: true, errors: [], warnings: [] }, nodes: [node("a", "App", 0.5)], bottleneckId: "a", maxRho: 0.5, queues: [], backgroundIssues: [], flows: [], crossRegion: [] });
const curve = [{ rps: 0, p50: 0, p95: 0, p99: 0, err: 0, maxRho: 0 }, { rps: 100, p50: 5, p95: 50, p99: 80, err: 0, maxRho: 0.6 }, { rps: 200, p50: 50, p95: 900, p99: 1200, err: 0.2, maxRho: 1.4 }];
const base = (rps) => ({ kind: "limits", minimumTestedRps: 1, maximumTestedRps: 240, searchIterations: 24, current: summary(rps), firstId: "a", cause: "latency", orderLabel: "predicted saturation under unshed demand", order: [{ id: "a", label: "App", type: "app", satRps: { kind: "finite", value: 150 } }, { id: "c", label: "Users", type: "client", satRps: { kind: "unbounded" } }], curve });
const found = (rps = 300, headroom = { kind: "finite", value: 0.5 }) => ({ ...base(rps), state: "found", passingRps: 151.51, failingRps: 151.52, at: summary(151.52), headroom });
const minimum = () => ({ ...base(300), state: "failsAtMinimumLoad", lowerThreshold: "unknown", headroom: null, searchIterations: 0, at: summary(1) });
const notReached = (rps = 300) => ({ ...base(rps), state: "notReachedWithinRange", maximumTestedRps: 1e7, searchIterations: 0, cause: null, headroom: rps > 0 ? 1e7 / rps : null, headroomIsLowerBound: true, at: null });
const forbidden = /Never|∞|Any load|zero capacity|infinite capacity/;

test("M8 Limits headline states never overclaim and distinguish average from burst peak", () => {
  const f = L.limitsHeadline(found());
  assert.equal(f.value, "151.51 – 151.52 rps", "a narrow bracket keeps two visibly distinct bounds");
  assert.equal(L.bracketText(1000, 2000), "1,000 – 2,000 rps");
  assert.match(f.detail, /bursts.*failing peak is about 303 rps/);
  const m = L.limitsHeadline(minimum());
  assert.match(m.value, /minimum tested 1 rps/);
  assert.match(m.detail, /below 1 rps is unknown/);
  assert.match(m.detail, /does not mean zero capacity/);
  const n = L.limitsHeadline(notReached());
  assert.match(n.value, /10,000,000 rps/);
  assert.match(n.detail, /not proof of unlimited capacity/);
  for (const h of [f, n]) assert.doesNotMatch(h.value + h.detail, forbidden);
});

test("M8 headroom is not applicable at zero traffic or a minimum-load failure; lower bound when not reached", () => {
  assert.equal(L.headroomText(found(0, { kind: "unbounded" })).value, "Not applicable");
  assert.match(L.headroomText(found(0, { kind: "unbounded" })).detail, /0 rps/);
  assert.equal(L.headroomText(minimum()).value, "Not applicable");
  assert.equal(L.headroomText(found(300, { kind: "finite", value: 2.5 })).value, "×2.5");
  assert.match(L.headroomText(notReached(300)).value, /^at least ×33,333/);
  assert.equal(L.headroomText(notReached(0)).value, "Not applicable");
  for (const r of [found(0, { kind: "unbounded" }), minimum(), notReached(0)]) assert.doesNotMatch(L.headroomText(r).value, /∞|Infinity|NaN/);
});

test("M8 saturation order handles unbounded components and zero current traffic", () => {
  const rows = L.orderRows(found(300));
  assert.equal(rows[0].ratio, "×0.5");
  assert.equal(rows[0].tone, "fail");
  assert.equal(rows[1].sat, "Unbounded");
  assert.equal(rows[1].ratio, null);
  const zero = L.orderRows(found(0, { kind: "unbounded" }));
  assert.ok(zero.every((r) => r.ratio === null && r.tone === ""));
  assert.ok(zero.every((r) => Number.isFinite(r.width) && r.width > 0 && r.width <= 100));
});

test("M8 ramp geometry stays finite with zero samples/traffic and marks the searched bracket", () => {
  const g = L.rampGeometry(found(0, { kind: "unbounded" }));
  for (const d of [g.p95, g.p99, g.err]) assert.doesNotMatch(d, /NaN|Infinity/);
  assert.equal(g.markers.current, null);
  assert.deepEqual([g.markers.passing, g.markers.failing], [151.51, 151.52]);
  const m = L.rampGeometry(minimum());
  assert.deepEqual([m.markers.passing, m.markers.failing], [null, 1]);
  const n = L.rampGeometry(notReached(300));
  assert.deepEqual([n.markers.passing, n.markers.failing, n.markers.current], [null, null, 300]);
  assert.ok(g.latencyMax >= 1200, "latency axis covers the highest sample (no undisclosed cap)");
});

test("M8 links route by stored kind and preserve both selections across tabs", () => {
  assert.equal(runHref("d", { id: "l1", kind: "limits" }), "/designs/d/limits?limits=l1");
  assert.equal(runHref("d", { id: "r1", kind: "simulation" }), "/designs/d/results?run=r1");
  assert.equal(workspaceHref("d", "traffic", { run: "r1", limits: "l1" }), "/designs/d/traffic?run=r1&limits=l1");
  assert.equal(workspaceHref("d", "edit"), "/designs/d/edit");
});

test("M8 dashboard status labels a Limits search as such", () => {
  const d = (latestRun) => ({ revision: 1, latestRun });
  assert.equal(designStatus(d({ kind: "limits", status: "pending", designRevision: 1, verdict: null })).label, "Limits search running");
  assert.equal(designStatus(d({ kind: "limits", status: "failed", designRevision: 1, verdict: null })).label, "Limits search failed");
  assert.equal(designStatus(d({ kind: "limits", status: "completed", designRevision: 1, verdict: "pass" })).label, "Limits searched · current load Passing");
  assert.equal(designStatus(d({ kind: "simulation", status: "completed", designRevision: 1, verdict: "pass" })).label, "Passing");
});

const design = () => ({ id: "d", name: "Test", revision: 1, schemaVersion: 1, graph: { nodes: [], edges: [] }, traffic: traffic() });
const accepted = (kind, requestId) => ({ run: { id: kind + "-" + requestId.slice(0, 4), kind, status: "pending", designRevision: 2 }, statusUrl: "/v1/x" });

test("M8 Find limits flushes the draft, then submits only through the Limits endpoint", async () => {
  const calls = [];
  const s = new EditorSession(
    design(),
    async (_id, body) => (calls.push(["patch", body.expectedRevision]), { ...design(), name: body.name, revision: 2 }),
    async () => { throw new Error("simulation endpoint must not be used"); },
    undefined,
    async (_id, body) => (calls.push(["limits", body.expectedRevision]), accepted("limits", body.requestId)),
  );
  s.rename("Edited");
  const a = await s.findLimits();
  assert.deepEqual(calls, [["patch", 1], ["limits", 2]]);
  assert.equal(a.run.kind, "limits");
  assert.equal(s.state.limitsRun.kind, "limits");
  assert.equal(s.state.run, undefined, "a Limits run never becomes the selected simulation");
});

test("M8 a lost Limits response retries the same Limits identity and never becomes a test run", async () => {
  const limitsIds = [], simulationIds = [];
  let fail = true;
  const s = new EditorSession(
    design(),
    async () => design(),
    async (_id, body) => (simulationIds.push(body.requestId), accepted("simulation", body.requestId)),
    undefined,
    async (_id, body) => {
      limitsIds.push(body.requestId);
      if (fail) throw new ApiError("NETWORK", "offline", 0);
      return accepted("limits", body.requestId);
    },
  );
  await assert.rejects(() => s.findLimits());
  assert.ok(s.state.limitsIntent, "uncertain Limits identity is kept");
  assert.equal(s.state.intent, undefined, "no simulation identity is created");
  fail = false;
  await s.findLimits();
  assert.equal(limitsIds.length, 2);
  assert.equal(limitsIds[0], limitsIds[1], "retry reuses the original Limits request id");
  await s.run();
  assert.equal(simulationIds.length, 1);
  assert.notEqual(simulationIds[0], limitsIds[0], "a test run uses its own request id");
  assert.equal(s.state.limitsIntent, undefined);
});

test("M8 setRun files results by stored kind", () => {
  const s = new EditorSession(design());
  s.setRun({ id: "r", kind: "simulation" });
  s.setRun({ id: "l", kind: "limits" });
  assert.equal(s.state.run.id, "r");
  assert.equal(s.state.limitsRun.id, "l");
});

test("M8 Limits tab markup: states, honest labels, keyboard data table and no fake progress", () => {
  const { LimitsTab } = require("../src/components/workspace/limits-tab");
  const props = { designId: "d", stale: false, selection: {}, canFind: true, finding: false, uncertain: false, onFind() {} };
  const view = (run, extra = {}) => renderToStaticMarkup(React.createElement(LimitsTab, { ...props, ...extra, run }));
  const run = (result) => ({ id: "l", designId: "d", kind: "limits", status: "completed", designRevision: 3, fingerprint: "f".repeat(64), engineVersion: "1", createdAt: new Date(0).toISOString(), completedAt: new Date(0).toISOString(), result, failure: null, snapshot: { schemaVersion: 1, graph: { nodes: [], edges: [] }, traffic: traffic() } });
  assert.match(view(undefined), /No saved Limits search/);
  assert.match(view({ ...run(null), status: "pending", result: null }), /queued or running/);
  assert.match(view({ ...run(null), status: "failed", result: null, failure: { code: "TIMEOUT", message: "Late." } }), /TIMEOUT/);
  for (const r of [found(300), minimum(), notReached(300), found(0, { kind: "unbounded" })]) {
    const html = view(run(r));
    assert.match(html, /predicted saturation under unshed demand/);
    assert.match(html, /Read ramp data/);
    assert.match(html, /Saved revision/);
    assert.doesNotMatch(html, /Never|∞|Any load|Ramping…|Ramp it again|NaN/);
  }
  assert.match(view(run(found(300)), { stale: true }), /Stale search/);
  assert.match(view(undefined, { uncertain: true }), /never resubmitted as a test run/);
  const blocked = view(undefined, { canFind: false, blockedReason: "A test run is pending." });
  assert.match(blocked, /disabled=""/);
  assert.match(blocked, /A test run is pending/);
});

// ---------------- M8.3 live preview lifecycle ----------------
const { PreviewSession } = require("../src/lib/preview-session");
const tick = () => new Promise((r) => setImmediate(r));
function harness() {
  const timers = [];
  const fake = { set: (fn) => (timers.push(fn), timers.length), clear: (h) => { if (h) timers[h - 1] = null; } };
  const calls = [];
  const send = (body, signal) => new Promise((resolve, reject) => calls.push({ body, signal, resolve, reject }));
  const p = new PreviewSession(send, fake, 750, "11111111-1111-4111-8111-111111111111");
  const flush = () => { const pending = timers.splice(0); pending.forEach((fn) => fn && fn()); };
  const reply = (call, summary = { p95: call.body.sequence }) => call.resolve({ editorSessionId: call.body.editorSessionId, sequence: call.body.sequence, fingerprint: "f", engineVersion: "1", validation: { ok: true, errors: [], warnings: [] }, summary });
  return { p, calls, flush, reply, timers };
}
const pdesign = (rps = 300, x = 0, name = "N") => ({ ...design(), name, graph: { nodes: [{ id: "a", type: "app", label: "App", x, y: 0, props: {} }], edges: [] }, traffic: traffic(rps) });

test("M8 preview debounces rapid semantic edits into one request and ignores layout-only moves", async () => {
  const { p, calls, flush, reply } = harness();
  p.enable(pdesign(1));
  for (let rps = 2; rps <= 20; rps++) p.setInput(pdesign(rps));
  assert.equal(calls.length, 0, "nothing is sent before the debounce elapses");
  flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.traffic.rps, 20, "only the latest inputs are sent");
  assert.equal(calls[0].body.sequence, 1);
  reply(calls[0]);
  await tick();
  assert.equal(p.state.status, "ready");
  p.setInput(pdesign(20, 500, "Renamed"));
  flush();
  assert.equal(calls.length, 1, "positions and names are not model inputs");
  assert.equal(p.isCurrent(pdesign(20, 999)), true);
  assert.equal(p.isCurrent(pdesign(21)), false, "a semantic edit makes the shown output not current");
});

test("M8 preview: a slow earlier reply never overwrites a newer one, and superseded requests are aborted", async () => {
  const { p, calls, flush, reply } = harness();
  p.enable(pdesign(1));
  flush();
  p.setInput(pdesign(2));
  flush();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].signal.aborted, true, "the superseded request is aborted");
  reply(calls[1], { p95: 2 });
  await tick();
  reply(calls[0], { p95: 1 });
  await tick();
  assert.equal(p.state.summary.p95, 2);
  assert.equal(p.state.forKey, require("../src/lib/editor-session").semanticInput(pdesign(2)));
});

test("M8 preview ignores replies for another editor session or after disable/dispose", async () => {
  const { p, calls, flush } = harness();
  p.enable(pdesign(1));
  flush();
  calls[0].resolve({ editorSessionId: "22222222-2222-4222-8222-222222222222", sequence: 1, validation: { ok: true, errors: [], warnings: [] }, summary: { p95: 9 } });
  await tick();
  assert.equal(p.state.summary, undefined);
  p.setInput(pdesign(3));
  flush();
  p.disable();
  assert.equal(calls[1].signal.aborted, true);
  calls[1].resolve({ editorSessionId: p.editorSessionId, sequence: 2, validation: { ok: true, errors: [], warnings: [] }, summary: { p95: 3 } });
  await tick();
  assert.equal(p.state.status, "off");
  assert.equal(p.state.summary, undefined);
  p.enable(pdesign(4));
  flush();
  let notified = 0;
  p.subscribe(() => notified++);
  p.dispose();
  assert.equal(calls[2].signal.aborted, true);
  calls[2].resolve({ editorSessionId: p.editorSessionId, sequence: 3, validation: { ok: true, errors: [], warnings: [] }, summary: { p95: 4 } });
  await tick();
  assert.equal(notified, 0, "a disposed (logged-out/switched) session restores nothing");
});

test("M8 preview pauses for invalid input, gestures or durable work and resumes with only the latest inputs", async () => {
  const { p, calls, flush, reply } = harness();
  p.enable(pdesign(1));
  flush();
  p.setInput(pdesign(2), "Finish moving first.");
  assert.equal(calls[0].signal.aborted, true);
  for (let rps = 3; rps < 8; rps++) p.setInput(pdesign(rps), "Finish moving first.");
  flush();
  assert.equal(calls.length, 1, "no requests while paused");
  assert.equal(p.state.status, "paused");
  p.setInput(pdesign(8));
  flush();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.traffic.rps, 8);
  reply(calls[1]);
  await tick();
  assert.equal(p.state.status, "ready");
});

test("M8 preview failures stay inline with explicit retry and no automatic retry loop", async () => {
  const { p, calls, flush } = harness();
  p.enable(pdesign(1));
  flush();
  calls[0].reject(new ApiError("RATE_LIMITED", "busy", 429, { reason: "DURABLE_PENDING" }));
  await tick();
  assert.equal(p.state.status, "paused");
  assert.match(p.state.message, /pauses while your saved calculation runs/);
  p.setInput(pdesign(1, 400));
  flush();
  assert.equal(calls.length, 1, "re-render/layout does not retry");
  p.retry();
  assert.equal(calls.length, 2);
  calls[1].reject(new ApiError("RATE_LIMITED", "busy", 429));
  await tick();
  assert.equal(p.state.status, "error");
  assert.equal(p.state.retryable, true);
  p.setInput(pdesign(1, 800));
  flush();
  assert.equal(calls.length, 2, "an inline error is not retried automatically");
  p.retry();
  calls[2].reject(new ApiError("CONFLICT", "replaced", 409, { reason: "PREVIEW_SUPERSEDED" }));
  await tick();
  assert.equal(p.state.status, "idle", "supersession is neutral, not an error");
  assert.equal(p.state.message, undefined);
  p.setInput(pdesign(2));
  flush();
  calls[3].reject(new ApiError("VALIDATION_FAILED", "too complex", 422, { reason: "COMPLEXITY_LIMIT" }));
  await tick();
  assert.match(p.state.message, /supported calculation budget/);
  assert.equal(p.state.retryable, false);
});

test("M8 preview: Undo back to computed inputs shows that output without a new request", async () => {
  const { p, calls, flush, reply } = harness();
  p.enable(pdesign(1));
  flush();
  reply(calls[0]);
  await tick();
  p.setInput(pdesign(2));
  assert.equal(p.state.status, "waiting");
  p.setInput(pdesign(1));
  flush();
  assert.equal(calls.length, 1);
  assert.equal(p.state.status, "ready");
});

// ---------------- M8.4 overlay and recorded topology ----------------
const { loadOverlay } = require("../src/lib/load-overlay");
const ograph = { nodes: [{ id: "u", type: "client", label: "Users", x: 0, y: 0, props: {} }, { id: "a", type: "app", label: "App", x: 240, y: 0, props: {} }, { id: "new", type: "db", label: "New DB", x: 480, y: 0, props: {} }], edges: [{ id: "e1", from: "u", to: "a" }, { id: "e2", from: "a", to: "new" }] };
const osummary = () => ({ ...summary(300), nodes: [{ ...node("u", "Users", 0), type: "client", servers: null }, { ...node("a", "App", 1.5), status: "fail", peak: 600 }], bottleneckId: "a", flows: [{ from: "u", to: "a", rps: 300 }] });

test("M8 overlay paints only matching components, keeps >100% numeric and clamps only the meter", () => {
  const o = loadOverlay(ograph, osummary());
  assert.equal(o.nodes.get("a").utilization, "150%");
  assert.equal(o.nodes.get("a").meter, 1);
  assert.equal(o.nodes.get("a").status, "fail");
  assert.equal(o.nodes.get("u").status, "idle", "Clients have no service pool");
  assert.equal(o.nodes.has("new"), false, "a component absent from the output never borrows metrics");
  assert.equal(o.edges.get("e1").rps, 300);
  assert.equal(o.edges.has("e2"), false);
  assert.equal(o.bottleneckId, "a");
  const changedType = { ...ograph, nodes: ograph.nodes.map((n) => (n.id === "a" ? { ...n, type: "cache" } : n)) };
  assert.equal(loadOverlay(changedType, osummary()).nodes.has("a"), false, "same id with a different type is not painted");
  assert.equal(loadOverlay(ograph, null), null);
  const calm = { ...osummary(), nodes: [{ ...node("a", "App", 0.5) }] };
  assert.equal(loadOverlay(ograph, calm).bottleneckId, null, "no bottleneck tag below 75%");
});

test("M8 recorded topology renders the saved snapshot with numeric labels and a text legend", () => {
  const { RecordedTopology } = require("../src/components/workspace/recorded-topology");
  const html = renderToStaticMarkup(React.createElement(RecordedTopology, { graph: ograph, summary: osummary(), selected: "a", onSelect() {} }));
  assert.match(html, /150%/);
  assert.match(html, /BOTTLENECK/);
  assert.match(html, /failing at or above 100%/);
  assert.match(html, /modeled request flow, not observed packets/);
  assert.match(html, /modeled utilization 150%, failing/);
  assert.match(html, /Connection: Users to App, modeled flow 300\/s/);
  // Flow labels are drawn after every node so short edges never hide them under node bodies.
  assert.ok(html.lastIndexOf("data-node=") < html.indexOf("cv-flow-labels"), "flow labels render above nodes");
  assert.match(html, /cv-edge-label[^>]*>300\/s</);
});

test("M8 live preview labels: off, current, stale and paused are distinct and never claim to be saved", () => {
  const { LivePreviewPanel } = require("../src/components/workspace/live-preview");
  const v = (extra) => ({ enabled: true, current: true, onToggle() {}, onRetry() {}, state: { status: "ready", summary: osummary() }, ...extra });
  const render = (x) => renderToStaticMarkup(React.createElement(LivePreviewPanel, { v: v(x) }));
  assert.match(render({ enabled: false }), /Live preview off/);
  assert.match(render({}), /Live preview — unsaved inputs/);
  assert.match(render({ current: false }), /stale/);
  assert.match(render({ state: { status: "paused", message: "Live preview pauses while your saved calculation runs." } }), /pauses while your saved calculation runs/);
  assert.match(render({ state: { status: "error", message: "busy", retryable: true } }), /Retry preview/);
  assert.match(render({}), /never saved and never replaces a recorded run/);
});
