const assert = require("node:assert/strict");
const { test } = require("node:test");
const { recordedResultText } = require("../src/lib/result-presentation");

const saved = {
  status: "completed",
  designRevision: 7,
  engineVersion: "reference-port-v1",
  result: {
    kind: "simulation",
    summary: {
      verdict: "strained",
      p95: 82.25,
      errorRate: 0.005,
      throughput: 98,
      rps: 100,
      traffic: { sloP95: 100, errorBudget: 0.01 },
      bottleneckId: "api",
      nodes: [{ id: "api", label: "Public API", rho: 0.8 }],
    },
  },
};

test("recorded copy preserves units, model verdict, targets and historical revision", () => {
  const text = recordedResultText(saved, true);
  assert.equal(text, [
    "STRESSFORGE model estimates",
    "Recorded revision 7 · reference-port-v1",
    "Verdict: strained",
    "p95 latency: 82.25 ms (target 100 ms)",
    "Errors: 0.5% (budget 1%)",
    "Served: 98 of 100 average rps",
    "Bottleneck: Public API (80% utilization)",
    "Stale result. These figures describe the recorded snapshot.",
  ].join("\n"));
  assert.doesNotMatch(recordedResultText(saved, false), /Stale result/);
});

test("copy formatter rejects non-simulation or incomplete records", () => {
  assert.equal(recordedResultText({ status: "pending" }, false), null);
  assert.equal(recordedResultText({ status: "failed" }, false), null);
  assert.equal(recordedResultText({ status: "completed", result: { kind: "limits" } }, false), null);
});

