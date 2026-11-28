import { simulateRegional } from "@/modules/region-lab/engine/regional-engine";
import * as codec from "@/modules/region-lab/results/result-codec";
import {
  histogram,
  decodeHistogram,
  distributionPlot,
  createCapture,
  validateTelemetry,
  RESULT_FORMAT,
} from "@/modules/region-lab/results/result-codec";
import { simulateRegionLabScenario } from "@/modules/region-lab/engine/regional-scenario";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
if (process.env.SF_REGION_STAGE7_CODEC_FAULT === "1")
  jest.spyOn(codec, "validateTelemetry").mockImplementation(() => undefined);
describe("Recorded Region Lab result codec", () => {
  it("round trips actual microsecond observations, including zero, with count and range enforcement", () => {
    const samples = [0, 0.001, 0.002, 1, 25, 300, 60000],
      wire = histogram(samples)!;
    const decoded = decodeHistogram(wire, samples.length)!;
    expect(decoded.totalCount).toBe(7);
    expect(distributionPlot(wire).reduce((n, b) => n + b.count, 0)).toBe(7);
    expect(decoded.getValueAtPercentile(50) / 1000).toBeCloseTo(1, 2);
    expect(() => histogram([60000.1])).toThrow();
    expect(histogram([])).toBeNull();
  });
  it("rejects forged envelopes, counts, malformed compression and allocation headers before decoding", () => {
    const wire = histogram([1, 2, 3])!;
    for (const bad of [
      { ...wire, count: 4 },
      { ...wire, data: "structural-placeholder" },
      { ...wire, highestTrackableValue: 1 },
      { ...wire, data: Buffer.alloc(100).toString("base64") },
    ])
      expect(() => decodeHistogram(bad, 3)).toThrow();
    expect(() => decodeHistogram(wire, 0)).toThrow();
  });
  it("captures each repetition and side from real observations, preserving numerical output", () => {
    const s = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "../../docs/region-lab/examples.json"),
        "utf8",
      ),
    ).baseline;
    s.profiles.forEach((p: any) => (p.origin = "custom"));
    Object.assign(s.workload, {
      arrival: "constant_rate",
      baselineRps: 20,
      durationSeconds: 10,
      warmupSeconds: 2,
      schedule: [
        { atSeconds: 0, multiplier: 1 },
        { atSeconds: 10, multiplier: 1 },
      ],
    });
    s.runOptions = { mode: "baseline", seed: 42, repetitions: 2 };
    const old = simulateRegionLabScenario(s),
      capture = createCapture(10000),
      current = simulateRegionLabScenario(s, capture);
    expect(current).toEqual(old);
    const result = {
      ...current,
      wireVersion: RESULT_FORMAT,
      telemetry: { executions: capture.executions },
    };
    expect(() => validateTelemetry(result)).not.toThrow();
    expect(capture.executions).toHaveLength(2);
    expect(capture.executions[0].histograms.global!.count).toBe(200);
    const forged = structuredClone(result);
    forged.telemetry.executions[0].buckets[0].offeredRequests++;
    expect(() => validateTelemetry(forged)).toThrow();
  });
  it("rejects histograms with forged quantiles and missing scopes", () => {
    const capture = createCapture(1000);
    capture.onRootEvent({ kind: "offered", arrivedMs: 0 });
    capture.onRootEvent({ kind: "attempt", arrivedMs: 0 });
    capture.onRootEvent({ kind: "outcome", arrivedMs: 0, latencyMs: 1 });
    capture.onSamples("global", [1]);
    const summary = {
      successfulRequests: 1,
      offeredRequests: 1,
      failedRequests: 0,
      attempts: 1,
      latency: { p50Ms: 50, p95Ms: null, p99Ms: null },
    };
    const r = {
      wireVersion: RESULT_FORMAT,
      repetitions: [{ baseline: { summary, origins: {}, operations: {} } }],
      telemetry: { executions: capture.executions },
    };
    expect(() => validateTelemetry(r)).toThrow("percentile");
  });
});

function allComponentInput() {
  const raw = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "../../docs/audit/region-lab-components-2026-11-27/verification.json",
      ),
      "utf8",
    ),
  ).cases[1].input;
  delete raw.componentVersion;
  raw.regionalVersion = 1;
  raw.nodes.forEach((n: any) => (n.region = "us-east"));
  raw.workload.origins = [
    { ...raw.workload.origins[0], id: "us-east", shareBps: 10000 },
  ];
  raw.network = [
    {
      from: "us-east",
      to: "us-east",
      oneWayDelay: { kind: "constant", valueMs: 0 },
      bandwidthMbps: 1000000,
      provenance: "Explicit zero-propagation unit-test assumption",
    },
  ];
  raw.routing = raw.workload.operations.map((o: any) => ({
    originRegion: "us-east",
    operationId: o.id,
    policy: "explicit",
    primaryEntryNodeId: raw.workload.origins[0].entryNodeId,
    fallbackEntryNodeIds: [],
    detectionMs: 0,
    switchMs: 0,
    failbackMs: 0,
    returnOnRecovery: true,
  }));
  raw.outage = null;
  raw.regionalTargets = [];
  return raw;
}
it("captures all twelve component types without counting detached worker jobs as extra roots", () => {
  const input = allComponentInput(),
    capture = createCapture(input.workload.durationMs),
    side = simulateRegional(input, capture);
  expect(new Set(side.nodes.map((n) => n.type)).size).toBe(12);
  expect(side.summary.successfulRequests).toBeGreaterThan(0);
  expect(() =>
    validateTelemetry(
      {
        wireVersion: RESULT_FORMAT,
        repetitions: [{ baseline: side }],
        telemetry: { executions: capture.executions },
      },
      input.workload.durationMs,
    ),
  ).not.toThrow();
});
it("keeps retried attempts in their root arrival cohort and conserves rate-limited failures", () => {
  const input = allComponentInput();
  for (const n of input.nodes) {
    if (n.type === "gateway") {
      n.properties.rateLimitRps = 1;
      n.properties.rateLimitBurstRequests = 1;
    }
    if (n.type === "cache" || n.type === "cdn") n.properties.hitRatio = 0;
  }
  input.workload.baselineRps = 20;
  input.workload.arrival = "constant_rate";
  for (const op of input.workload.operations)
    if (op.kind === "read") {
      op.idempotent = true;
      op.retry.maxAttempts = 3;
    }
  const capture = createCapture(input.workload.durationMs),
    side = simulateRegional(input, capture);
  expect(side.summary.attempts).toBeGreaterThan(side.summary.offeredRequests);
  expect(side.summary.failures.RATE_LIMITED).toBeGreaterThan(0);
  expect(() =>
    validateTelemetry(
      {
        wireVersion: RESULT_FORMAT,
        repetitions: [{ baseline: side }],
        telemetry: { executions: capture.executions },
      },
      input.workload.durationMs,
    ),
  ).not.toThrow();
});
