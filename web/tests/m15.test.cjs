const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  RETENTION_TEXT,
  versionOrigin,
  snapshotSummary,
  verdictLabel,
  runLabel,
  groupRunsByRevision,
  restoreChanges,
  restoreBlockedReason,
} = require("../src/lib/history-presentation.ts");

const node = (id, label, over = {}) => ({ id, type: "app", label, x: 0, y: 0, props: { replicas: 1 }, ...over });
const design = (over = {}) => ({
  id: "d", name: "Single-server MVP", description: "", revision: 3,
  graph: { nodes: [node("a", "Users", { type: "client" }), node("b", "App servers")], edges: [{ id: "e1", from: "a", to: "b" }] },
  traffic: { preset: "custom", rps: 500, burst: 1.5, readRatio: 0.8, sloP95: 300, errorBudget: 0.01, durationMin: 10, shape: "steady" },
  ...over,
});

test("M15 history: every version origin is labelled honestly, baseline as an imported snapshot", () => {
  assert.equal(versionOrigin({ origin: "create", restoredFromRevision: null }).label, "Created");
  assert.equal(versionOrigin({ origin: "edit", restoredFromRevision: null }).label, "Saved edit");
  assert.equal(versionOrigin({ origin: "restore", restoredFromRevision: 2 }).label, "Restored from revision 2");
  const baseline = versionOrigin({ origin: "baseline", restoredFromRevision: null });
  assert.equal(baseline.label, "Imported current snapshot");
  assert.match(baseline.note, /Earlier history was not recorded/, "never presented as reconstructed history");
  assert.match(RETENTION_TEXT, /latest 100 versions are kept/i);
  assert.match(RETENTION_TEXT, /older ones may be removed/i);
});

test("M15 history: summaries and run labels use plain, singular/plural-correct wording", () => {
  assert.equal(snapshotSummary(design()), "2 components · 1 connection · 500 rps");
  assert.equal(snapshotSummary({ graph: { nodes: [node("a", "A")], edges: [] }, traffic: { rps: 0 } }), "1 component · 0 connections · 0 rps");
  assert.equal(verdictLabel("pass"), "Passes");
  assert.equal(verdictLabel("fail"), "Breaks");
  assert.equal(verdictLabel(null), "No verdict");
  assert.equal(runLabel({ kind: "limits", status: "completed" }), "Limits search");
  assert.equal(runLabel({ kind: "simulation", status: "pending" }), "Test run (running)");
  const runs = [{ id: "1", designRevision: 2 }, { id: "2", designRevision: 1 }, { id: "3", designRevision: 2 }];
  const grouped = groupRunsByRevision(runs);
  assert.deepEqual(grouped.get(2).map((r) => r.id), ["1", "3"]);
  assert.equal(grouped.get(5), undefined);
});

test("M15 restore preview lists exactly what would change, in plain language", () => {
  const current = design();
  const target = design({
    name: "Earlier name",
    traffic: { ...current.traffic, rps: 300, errorBudget: 0.05 },
    graph: {
      nodes: [node("a", "Users", { type: "client" }), node("b", "App servers", { props: { replicas: 4 } }), node("c", "Cache"), node("d", "CDN"), node("e", "Queue"), node("f", "Worker")],
      edges: [{ id: "e1", from: "a", to: "b" }, { id: "e2", from: "b", to: "c" }],
    },
  });
  const lines = restoreChanges(current, target);
  assert.ok(lines.includes("Name: “Single-server MVP” → “Earlier name”"));
  assert.ok(lines.includes("Traffic: 500 rps → 300 rps"));
  assert.ok(lines.includes("Error budget: 1% → 5%"));
  assert.ok(lines.includes("Adds 4 components: Cache, CDN, Queue and 1 more"), lines.join("|"));
  assert.ok(lines.includes("Changes settings of 1 component"));
  assert.ok(lines.includes("Adds 1 connection"));
  const reverse = restoreChanges(target, current);
  assert.ok(reverse.includes("Removes 4 components: Cache, CDN, Queue and 1 more"));
  assert.ok(reverse.includes("Removes 1 connection"));
});

test("M15 restore preview separates layout-only moves from real changes and reports identical content", () => {
  const current = design();
  const moved = design({ graph: { ...current.graph, nodes: current.graph.nodes.map((n) => (n.id === "b" ? { ...n, x: 90 } : n)) } });
  assert.deepEqual(restoreChanges(current, moved), ["Moves 1 component (layout only)"]);
  assert.deepEqual(restoreChanges(current, design()), [], "identical content has no differences");
  const descOnly = design({ description: "New words" });
  assert.deepEqual(restoreChanges(current, descOnly), ["Description changes"]);
});

test("M15 restore is blocked, with a reason, whenever a draft could be lost or confused", () => {
  const free = { dirty: false, saving: false, gesture: false, conflict: false, busyWithCalculation: false };
  assert.equal(restoreBlockedReason(free), null);
  assert.match(restoreBlockedReason({ ...free, dirty: true }), /unsaved changes/);
  assert.match(restoreBlockedReason({ ...free, saving: true }), /unsaved changes/);
  assert.match(restoreBlockedReason({ ...free, conflict: true }), /conflict/);
  assert.match(restoreBlockedReason({ ...free, gesture: true }), /Finish the current edit/);
  assert.match(restoreBlockedReason({ ...free, busyWithCalculation: true }), /calculation is running/);
  // A conflict is explained before an unsaved draft, because it needs a deliberate choice first.
  assert.match(restoreBlockedReason({ ...free, dirty: true, conflict: true }), /conflict/);
});

const { NOTE_MAX_CHARS, NOTES_MAX, noteDraft, noteKindLabel, notesCountText, notesFull } = require("../src/lib/notes-presentation.ts");

test("M15.3 notes: the draft counter follows the server rules (trimmed, 2,000 characters, no NUL)", () => {
  assert.equal(NOTE_MAX_CHARS, 2000);
  assert.equal(NOTES_MAX, 100);
  assert.deepEqual(noteDraft(""), { remaining: 2000, canSave: false, problem: null }, "an untouched form is not an error");
  assert.equal(noteDraft("   \n  ").canSave, false, "whitespace only cannot be saved");
  assert.equal(noteDraft("  hello  ").remaining, 1995, "the server trims, so the counter does too");
  assert.equal(noteDraft("x".repeat(2000)).canSave, true);
  const over = noteDraft("x".repeat(2001));
  assert.equal(over.canSave, false);
  assert.match(over.problem, /Too long by 1 character\./);
  assert.match(noteDraft("y".repeat(2005)).problem, /by 5 characters\./);
  assert.match(noteDraft("bad\u0000text").problem, /unsupported character/);
  assert.equal(noteDraft("<script>alert(1)</script>").canSave, true, "hostile text is data, saved as typed");
});

test("M15.3 notes: labels and the 100-note limit read plainly", () => {
  assert.equal(noteKindLabel("decision"), "Decision");
  assert.equal(noteKindLabel("assumption"), "Assumption");
  assert.equal(notesCountText(0), "0 of 100 notes");
  assert.equal(notesCountText(100), "100 of 100 notes");
  assert.equal(notesFull(99), false);
  assert.equal(notesFull(100), true);
});

const { METRIC_ROWS, deltaTag, orderPair, reasonText, verdictTag, verdictText, NOT_COMPARABLE_GUIDANCE } = require("../src/lib/compare-presentation.ts");

test("M15.4 compare: every reason is explained plainly and names the right revision", () => {
  const reasons = ["RUN_MISSING_A", "RUN_MISSING_B", "RUN_NOT_FOR_VERSION_A", "RUN_NOT_FOR_VERSION_B", "RUN_NOT_COMPLETED_A", "RUN_NOT_COMPLETED_B", "RUN_NOT_SIMULATION_A", "RUN_NOT_SIMULATION_B", "TRAFFIC_DIFFERS", "ENGINE_DIFFERS"];
  for (const r of reasons) assert.ok(reasonText(r, 3, 7).length > 20, r);
  assert.match(reasonText("RUN_MISSING_A", 3, 7), /Revision 3/);
  assert.match(reasonText("RUN_MISSING_B", 3, 7), /Revision 7/);
  assert.match(reasonText("TRAFFIC_DIFFERS", 3, 7), /different traffic/);
  assert.match(reasonText("RUN_NOT_SIMULATION_B", 3, 7), /Limits search/);
  assert.match(NOT_COMPARABLE_GUIDANCE, /Nothing was subtracted/);
});

test("M15.4 compare: better, worse and no change follow each metric's own direction", () => {
  const p95 = METRIC_ROWS.find((r) => r.key === "p95");
  const throughput = METRIC_ROWS.find((r) => r.key === "throughput");
  const errors = METRIC_ROWS.find((r) => r.key === "errorRate");
  assert.deepEqual(deltaTag(p95, 300, -50), { label: "Better", tone: "better" }, "lower latency is better");
  assert.deepEqual(deltaTag(p95, 300, 50), { label: "Worse", tone: "worse" });
  assert.deepEqual(deltaTag(throughput, 100, 40), { label: "Better", tone: "better" }, "higher throughput is better");
  assert.deepEqual(deltaTag(throughput, 100, -40), { label: "Worse", tone: "worse" });
  assert.deepEqual(deltaTag(errors, 0.2, -0.1), { label: "Better", tone: "better" });
  assert.deepEqual(deltaTag(p95, 300, 0), { label: "No change", tone: "same" });
  assert.deepEqual(deltaTag(p95, 1000, 2), { label: "No change", tone: "same" }, "a change under half a percent is not an improvement");
  assert.deepEqual(deltaTag(errors, 0, 0), { label: "No change", tone: "same" });
  assert.deepEqual(deltaTag(errors, 0, 0.01), { label: "Worse", tone: "worse" }, "errors appearing from zero are worse");
  assert.deepEqual(verdictTag("fail", "pass"), { label: "Better", tone: "better" });
  assert.deepEqual(verdictTag("pass", "strained"), { label: "Worse", tone: "worse" });
  assert.deepEqual(verdictTag("fail", "fail"), { label: "No change", tone: "same" });
  assert.equal(verdictText("fail"), "Breaks");
});

test("M15.4 compare: values and changes are formatted with explicit units and signs, older revision first", () => {
  const byKey = Object.fromEntries(METRIC_ROWS.map((r) => [r.key, r]));
  assert.equal(byKey.p95.format(2068.67), "2,068.67 ms");
  assert.equal(byKey.p95.formatDelta(-1500.5), "−1,500.5 ms");
  assert.equal(byKey.p95.formatDelta(12), "+12 ms");
  assert.equal(byKey.errorRate.format(0.99012), "99.012%");
  assert.equal(byKey.errorRate.formatDelta(-0.5), "−50 percentage points");
  assert.equal(byKey.throughput.format(489.63), "490 rps");
  assert.equal(byKey.throughput.formatDelta(0), "0 rps");
  assert.deepEqual(orderPair(7, 3), [3, 7]);
  assert.deepEqual(orderPair(3, 7), [3, 7]);
});
