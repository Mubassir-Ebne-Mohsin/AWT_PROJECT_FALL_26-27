const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { EditorSession } = require("../src/lib/editor-session");
const {
  numericTraffic,
  rpsToSlider,
  sliderToRps,
  trafficSchema,
} = require("../src/lib/traffic");
const {
  percent,
  numberText,
  boundedText,
  verdictReasons,
  timelineGeometry,
} = require("../src/lib/result-presentation");
const { ApiError } = require("../src/lib/api/errors");
const traffic = () => ({
  preset: "custom",
  rps: 400,
  burst: 1.2,
  readRatio: 0.8,
  sloP95: 300,
  errorBudget: 0.01,
  durationMin: 10,
  shape: "steady",
});
const design = () => ({
  id: "d",
  name: "Test",
  revision: 1,
  schemaVersion: 1,
  graph: {
    nodes: [
      { id: "c1", type: "client", label: "Users", x: 0, y: 0, props: {} },
      {
        id: "c2",
        type: "client",
        label: "Europe",
        x: 0,
        y: 100,
        props: { region: "eu-west" },
      },
      {
        id: "a",
        type: "app",
        label: "App",
        x: 250,
        y: 0,
        props: { region: "us-east" },
      },
    ],
    edges: [],
  },
  traffic: traffic(),
});
const tick = () => new Promise((r) => setImmediate(r));
test("traffic rejects invalid, nonfinite and out of envelope values without changing draft", () => {
  const s = new EditorSession(design());
  for (const patch of [
    { rps: -1 },
    { rps: Infinity },
    { rps: NaN },
    { burst: 0 },
    { readRatio: 1.01 },
    { sloP95: 0 },
    { durationMin: 1441 },
    { errorBudget: -0.1 },
    { shape: "fake" },
  ])
    assert.throws(() => s.setTraffic(patch));
  assert.deepEqual(s.state.design, design());
  assert.equal(s.dirty, false);
  for (const raw of ["", " ", "NaN", "Infinity", "-1", "10000001"])
    assert.equal(numericTraffic(raw, 0, 1e7), undefined);
  assert.equal(numericTraffic("0", 0, 1e7), 0);
  assert.equal(numericTraffic("1e7", 0, 1e7), 1e7);
});
test("presets are one undo action; custom edits preserve unrelated settings; redo branches", () => {
  const s = new EditorSession(design());
  s.setTraffic(
    {
      preset: "flash",
      rps: 8000,
      burst: 3,
      readRatio: 0.9,
      shape: "spike",
      sloP95: 500,
    },
    true,
  );
  assert.equal(s.state.design.traffic.errorBudget, 0.01);
  assert.equal(s.state.design.traffic.durationMin, 10);
  s.undo();
  assert.deepEqual(s.state.design.traffic, traffic());
  s.redo();
  assert.equal(s.state.design.traffic.preset, "flash");
  s.setTraffic({ rps: 500 });
  assert.equal(s.state.design.traffic.preset, "custom");
  s.undo();
  assert.equal(s.state.design.traffic.preset, "flash");
  s.setTraffic({ burst: 2 });
  assert.equal(s.state.canRedo, false);
});
test("region update changes all Clients only and undo restores their differing regions", () => {
  const d = design(),
    s = new EditorSession(d);
  s.setUserRegion("ap-south");
  assert.ok(
    s.state.design.graph.nodes
      .slice(0, 2)
      .every((n) => n.props.region === "ap-south"),
  );
  assert.equal(s.state.design.graph.nodes[2].props.region, "us-east");
  s.undo();
  assert.deepEqual(s.state.design, d);
  s.redo();
  assert.equal(s.state.design.graph.nodes[0].props.region, "ap-south");
  assert.throws(() => s.setUserRegion("invalid"));
  const empty = new EditorSession({ ...d, graph: { nodes: [], edges: [] } });
  empty.setUserRegion("us-east");
  assert.equal(empty.dirty, false);
});
test("traffic edits during pending save survive its acknowledgement and use returned revision", async () => {
  const d = design(),
    calls = [];
  let release;
  const s = new EditorSession(d, async (_, b) => {
    calls.push(b);
    if (calls.length === 1) await new Promise((r) => (release = r));
    return { ...d, ...b, revision: b.expectedRevision + 1 };
  });
  s.setTraffic({ rps: 600 });
  const saving = s.save();
  s.setTraffic({ burst: 2 });
  release();
  await saving;
  assert.equal(s.state.saved.traffic.burst, 1.2);
  assert.equal(s.state.design.traffic.burst, 2);
  assert.equal(s.dirty, true);
  await s.save();
  assert.equal(calls[1].expectedRevision, 2);
  assert.equal(s.dirty, false);
});
test("Run flushes the latest traffic even when edited while save is outstanding", async () => {
  const d = design(),
    calls = [];
  let release;
  const s = new EditorSession(
    d,
    async (_, b) => {
      calls.push(b);
      if (calls.length === 1) await new Promise((r) => (release = r));
      return { ...d, ...b, revision: b.expectedRevision + 1 };
    },
    async (_, b) => ({
      run: { id: "r", status: "pending", designRevision: b.expectedRevision },
      statusUrl: "",
    }),
  );
  s.setTraffic({ rps: 700 });
  const run = s.run();
  await tick();
  s.setTraffic({ rps: 900 });
  release();
  const result = await run;
  assert.equal(result.run.designRevision, 3);
  assert.equal(calls[1].traffic.rps, 900);
});
test("invalid traffic input blocks save and Run, with no submission", async () => {
  let submitted = 0;
  const s = new EditorSession(design(), undefined, async () => {
    submitted++;
  });
  s.inputError("traffic:rps", true);
  await assert.rejects(s.run(), /highlighted input/);
  assert.equal(submitted, 0);
  s.inputError("traffic:rps", false);
  assert.equal(s.state.inputErrors.length, 0);
});
test("409 retains traffic/history; explicit reapply retains draft and resets old history", async () => {
  const d = design(),
    s = new EditorSession(d, async () => {
      throw new ApiError("CONFLICT", "Remote changed", 409);
    });
  s.setTraffic({ rps: 950 });
  await assert.rejects(s.save());
  assert.equal(s.state.design.traffic.rps, 950);
  assert.equal(s.state.canUndo, true);
  s.reapply({ ...d, revision: 8 });
  assert.equal(s.state.saved.revision, 8);
  assert.equal(s.state.design.traffic.rps, 950);
  assert.equal(s.state.canUndo, false);
});
test("uncertain Run retries same identity despite newer traffic and preserves newer draft", async () => {
  const calls = [],
    d = design();
  const s = new EditorSession(d, undefined, async (_, b) => {
    calls.push(b);
    if (calls.length === 1) throw new ApiError("NETWORK", "Lost", 0);
    return { run: { id: "r", status: "pending" }, statusUrl: "" };
  });
  await assert.rejects(s.run());
  s.setTraffic({ rps: 1234 });
  await s.run();
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(s.state.design.traffic.rps, 1234);
  assert.equal(s.dirty, true);
});
test("snapshot staleness follows traffic/region not canvas coordinates and undo can restore equality", () => {
  const d = design(),
    s = new EditorSession(d),
    r = { snapshot: { graph: structuredClone(d.graph), traffic: traffic() } };
  s.edit({
    ...d.graph,
    nodes: d.graph.nodes.map((n) => ({ ...n, x: n.x + 100 })),
  });
  assert.equal(s.isRunStale(r), false);
  s.setTraffic({ rps: 100 });
  assert.equal(s.isRunStale(r), true);
  s.undo();
  assert.equal(s.isRunStale(r), false);
  s.setUserRegion("ap-south");
  assert.equal(s.isRunStale(r), true);
});
test("disposed account session cannot mutate traffic or region", () => {
  const s = new EditorSession(design());
  s.dispose();
  s.setTraffic({ rps: 999 });
  s.setUserRegion("ap-south");
  assert.deepEqual(s.state.design, design());
});
test("numeric formatting distinguishes tiny positive errors, true zero, unbounded and overload", () => {
  assert.equal(percent(0), "0%");
  assert.notEqual(percent(1e-10), "0%");
  assert.match(percent(1e-10), /e-/);
  assert.equal(percent(1.5), "150%");
  assert.equal(boundedText({ kind: "unbounded" }), "Unbounded");
  assert.equal(boundedText({ kind: "finite", value: 0 }, " rps"), "0 rps");
  assert.equal(numberText(Infinity), "Unavailable");
});
const summary = () => ({
  traffic: traffic(),
  p95: 55.77,
  errorRate: 0,
  verdict: "strained",
  nodes: [{ id: "gw", label: "API gateway", type: "gateway", rho: 0.8 }],
  queues: [],
});
test("verdict distinguishes high utilization, target proximity without bottleneck, and failing targets", () => {
  const s = summary();
  assert.match(verdictReasons(s).join(" "), /API gateway.*80%/);
  assert.doesNotMatch(verdictReasons(s).join(" "), /latency headroom/);
  s.nodes = [];
  s.p95 = 248.34;
  assert.match(verdictReasons(s).join(" "), /latency headroom/);
  s.verdict = "fail";
  s.p95 = 500;
  s.errorRate = 0.2;
  assert.match(verdictReasons(s).join(" "), /above.*target/);
  assert.match(verdictReasons(s).join(" "), /budget/);
  s.p95 = 20;
  s.errorRate = 0;
  s.verdict = "pass";
  assert.match(verdictReasons(s).join(" "), /meets/);
  s.queues = [{ label: "Jobs", state: "growing" }];
  assert.match(verdictReasons(s).join(" "), /backlog/);
});
test("chart geometry handles empty, zero, constant and extreme series without nonfinite SVG", () => {
  for (const pts of [
    [],
    [{ t: 0, p95: 0, rps: 0, err: 0 }],
    [
      { t: 0, p95: 20, rps: 400 },
      { t: 10, p95: 20, rps: 400 },
    ],
    [{ t: 10, p95: 1e10, rps: 1e9 }],
  ]) {
    const g = timelineGeometry(pts, 300, 10);
    assert.doesNotMatch(g.line + g.rate, /NaN|Infinity/);
    assert.ok(g.latencyMax > 0 && g.rateMax > 0);
    assert.ok(g.y(g.latencyMax) >= 35.99);
    assert.ok(g.y(300) >= 36);
  }
  assert.equal(sliderToRps(0), 10);
  assert.equal(sliderToRps(1000), 50000);
  assert.equal(rpsToSlider(0), 0);
  assert.equal(rpsToSlider(1e7), 1000);
  assert.equal(trafficSchema.safeParse({ ...traffic(), rps: 0 }).success, true);
});
test("rendered results keep snapshot targets and labels, escape user text, and expose readable chart data", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const { RunResults } = require("../src/components/workspace/run-results");
  const s = {
    ...summary(),
    p50: 20,
    p99: 80,
    throughput: 400,
    rps: 400,
    peakRps: 480,
    engineVersion: "v1",
    nodes: [
      {
        id: "gw",
        label: "<script>bad</script>",
        type: "gateway",
        rho: 1.5,
        status: "fail",
        peak: 480,
        cap: { kind: "finite", value: 600 },
        T: 20,
        S: 10,
        Wq: 10,
        errors: 1e-10,
        satRps: { kind: "unbounded" },
      },
    ],
    bottleneckId: "gw",
    crossRegion: [],
    backgroundIssues: [],
  };
  const run = {
    id: "r",
    designId: "d",
    designRevision: 4,
    engineVersion: "v1",
    createdAt: "2026-10-26T00:00:00Z",
    status: "completed",
    fingerprint: "abc",
    snapshot: { graph: design().graph, traffic: traffic() },
    result: {
      kind: "simulation",
      summary: s,
      timeline: [{ t: 0, rps: 0, p95: 0, err: 0 }],
      paths: [],
    },
  };
  const html = renderToStaticMarkup(
    React.createElement(RunResults, { run, stale: true }),
  );
  assert.match(html, /Target 300 ms/);
  assert.match(html, /150%/);
  assert.match(html, /Read timeline data/);
  assert.match(html, /recorded snapshot/);
  assert.match(html, /Unbounded/);
  assert.doesNotMatch(html, /<script>bad/);
  assert.match(html, /&lt;script&gt;/);
});

test("pending, failed and absent runs never render completed metrics or invented progress", () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server"),
    { RunResults } = require("../src/components/workspace/run-results");
  const pending = renderToStaticMarkup(
    React.createElement(RunResults, {
      run: { status: "pending" },
      stale: false,
    }),
  );
  assert.match(pending, /Queued or running/);
  assert.doesNotMatch(pending, /p95 latency|[0-9]+%/);
  const failed = renderToStaticMarkup(
    React.createElement(RunResults, {
      run: {
        status: "failed",
        failure: { code: "TIMEOUT", message: "Deadline exceeded" },
      },
      stale: false,
    }),
  );
  assert.match(failed, /TIMEOUT/);
  assert.match(failed, /new calculation/);
  assert.doesNotMatch(failed, /p95 latency/);
  const absent = renderToStaticMarkup(
    React.createElement(RunResults, { stale: false }),
  );
  assert.match(absent, /Run the saved design/);
  assert.doesNotMatch(absent, /p95 latency/);
});
