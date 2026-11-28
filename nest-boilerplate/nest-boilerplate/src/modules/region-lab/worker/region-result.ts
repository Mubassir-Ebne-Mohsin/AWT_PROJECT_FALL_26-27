import { createHash } from "node:crypto";
import { z } from "zod";
import {
  hash,
  type FrozenRegionSnapshot,
} from "@/modules/region-lab/region-policy";
import { adaptRegionalScenario } from "@/modules/region-lab/engine/regional-scenario";
import {
  canonical as normalize,
  REGIONAL_ENGINE_VERSION,
} from "@/modules/region-lab/engine/regional-engine";
import { regionalInputSchema } from "@/modules/region-lab/engine/regional-input";
import { validateTelemetry } from "@/modules/region-lab/results/result-codec";
function assert(v: unknown): asserts v {
  if (!v) throw new Error("Invalid isolated Region Lab result");
}
const integer = (n: unknown) =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
function finite(value: unknown) {
  if (typeof value === "number") assert(Number.isFinite(value));
  else if (Array.isArray(value)) value.forEach(finite);
  else if (value && typeof value === "object")
    Object.values(value).forEach(finite);
}
function summary(s: any, maxAttempts: number) {
  assert(
    s &&
      integer(s.offeredRequests) &&
      integer(s.successfulRequests) &&
      integer(s.failedRequests) &&
      integer(s.unresolvedRequests) &&
      integer(s.attempts),
  );
  assert(
    s.offeredRequests ===
      s.successfulRequests + s.failedRequests + s.unresolvedRequests &&
      s.attempts >= s.offeredRequests &&
      s.attempts <= s.offeredRequests * maxAttempts,
  );
  const denominator = s.offeredRequests
    ? s.failedRequests / s.offeredRequests
    : null;
  assert(
    denominator === null
      ? s.errorRateRatio === null
      : Math.abs(denominator - s.errorRateRatio) < 1e-12,
  );
  assert(
    s.failures &&
      ["QUEUE_FULL", "RATE_LIMITED", "DEADLINE", "UNAVAILABLE"].every((k) =>
        integer(s.failures[k]),
      ) &&
      Object.values(s.failures).reduce((a: any, b: any) => a + b, 0) ===
        s.failedRequests,
  );
  assert(s.latency?.count === s.successfulRequests);
  let previous = 0;
  for (const [field, min] of [
    ["p50Ms", 1],
    ["p95Ms", 1000],
    ["p99Ms", 10000],
  ] as const) {
    const value = s.latency[field];
    assert(
      s.successfulRequests < min
        ? value === null
        : typeof value === "number" && value >= previous,
    );
    if (value !== null) previous = value;
  }
  assert(
    s.successfulRequests
      ? typeof s.latency.meanMs === "number" && s.latency.meanMs >= 0
      : s.latency.meanMs === null,
  );
  assert(["pass", "fail", "indeterminate"].includes(s.verdict));
}
export function validateRegionResult(
  snapshot: FrozenRegionSnapshot,
  raw: unknown,
) {
  assert(Buffer.byteLength(JSON.stringify(raw)) <= 2 * 1024 * 1024);
  finite(raw);
  const result = raw as any,
    scenario = snapshot.scenario,
    resolved = adaptRegionalScenario(scenario),
    adapted = resolved.input;
  assert(
    hash(
      Object.keys(result ?? {})
        .filter((k) => !["wireVersion", "telemetry"].includes(k))
        .sort(),
    ) ===
      hash(
        [
          "engineVersion",
          "mode",
          "repetitions",
          "processedEvents",
          "scenarioHash",
          "provenance",
        ].sort(),
      ),
  );
  const manifest = structuredClone(resolved.scenario);
  manifest.regions.sort();
  manifest.profiles.sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : a.version - b.version,
  );
  manifest.graph.nodes.sort((a, b) => (a.id < b.id ? -1 : 1));
  manifest.graph.edges.sort((a, b) => (a.id < b.id ? -1 : 1));
  manifest.graph.edges.forEach((e) => e.operationIds.sort());
  manifest.workload.operations.sort((a, b) => (a.id < b.id ? -1 : 1));
  manifest.workload.regionalShares.sort((a, b) =>
    a.region < b.region ? -1 : 1,
  );
  manifest.network.sort((a, b) =>
    a.from + ">" + a.to < b.from + ">" + b.to ? -1 : 1,
  );
  manifest.routing.sort((a, b) =>
    a.originRegion + ">" + a.operationId < b.originRegion + ">" + b.operationId
      ? -1
      : 1,
  );
  manifest.targets.perRegion.sort((a, b) => (a.region < b.region ? -1 : 1));
  manifest.outage?.affectedNodeIds.sort();
  assert(
    result.scenarioHash ===
      createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
  );
  assert(
    hash(result.provenance) ===
      hash(
        manifest.profiles.map((p) => ({
          id: p.id,
          version: p.version,
          origin: p.origin,
          provenance: p.provenance,
        })),
      ),
  );
  assert(
    result?.engineVersion === REGIONAL_ENGINE_VERSION &&
      result.mode === scenario.runOptions.mode &&
      Array.isArray(result.repetitions) &&
      result.repetitions.length === scenario.runOptions.repetitions,
  );
  const attempts = Math.max(
    ...scenario.workload.operations.map((o) => o.retry.maxAttempts),
  );
  let eventTotal = 0;
  for (let i = 0; i < result.repetitions.length; i++) {
    const repetition = result.repetitions[i],
      seed =
        i === 0
          ? scenario.runOptions.seed
          : createHash("sha256")
              .update(
                JSON.stringify([scenario.runOptions.seed, "replicate", i]),
              )
              .digest()
              .readUInt32BE(0);
    assert(repetition.repetition === i && repetition.seed === seed);
    for (const side of ["baseline", "outage"] as const) {
      const wanted = result.mode === "paired" || result.mode === side;
      assert(wanted ? !!repetition[side] : repetition[side] === undefined);
      if (!wanted) continue;
      const view = repetition[side],
        input = regionalInputSchema.parse({
          ...adapted,
          seed,
          outage: side === "baseline" ? null : adapted.outage,
        });
      normalize(input);
      const expected = createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex");
      assert(
        view.engineVersion === REGIONAL_ENGINE_VERSION &&
          view.stage === "uncalibrated-regional" &&
          view.inputHash === expected,
      );
      summary(view.summary, attempts);
      assert(
        hash(Object.keys(view.origins).sort()) ===
          hash(input.workload.origins.map((o) => o.id).sort()),
      );
      assert(
        hash(Object.keys(view.operations).sort()) ===
          hash(input.workload.operations.map((o) => o.id).sort()),
      );
      for (const group of [view.origins, view.operations]) {
        Object.values(group).forEach((s) => summary(s, attempts));
        for (const key of [
          "offeredRequests",
          "successfulRequests",
          "failedRequests",
          "unresolvedRequests",
          "attempts",
        ])
          assert(
            Object.values(group).reduce((a: any, s: any) => a + s[key], 0) ===
              view.summary[key],
          );
      }
      const state = (s: any, p95: number, errors: number) =>
        (s.errorRateRatio !== null && s.errorRateRatio > errors) ||
        (s.latency.p95Ms !== null && s.latency.p95Ms > p95)
          ? "fail"
          : s.unresolvedRequests || s.latency.p95Ms === null
            ? "indeterminate"
            : "pass";
      let verdict = state(
        view.summary,
        input.targets.p95Ms,
        input.targets.errorBudgetRatio,
      );
      for (const t of input.regionalTargets) {
        const v = state(view.origins[t.region], t.p95Ms, t.errorBudgetRatio);
        if (v === "fail") verdict = "fail";
        else if (v === "indeterminate" && verdict !== "fail")
          verdict = "indeterminate";
      }
      assert(
        view.summary.verdict === verdict &&
          Array.isArray(view.nodes) &&
          view.nodes.length === input.nodes.length,
      );
      for (const n of view.nodes) {
        const definition = input.nodes.find((d) => d.id === n.id);
        assert(definition && n.type === definition.type);
        assert(
          n.utilizationRatio === null
            ? ["client", "queue"].includes(n.type)
            : n.utilizationRatio >= 0 && n.utilizationRatio <= 1 + 1e-9,
        );
        for (const k of [
          "offeredCalls",
          "completedCalls",
          "failedCalls",
          "rejectedCalls",
          "rateLimitedCalls",
          "peakQueueDepth",
          "peakBusySlots",
        ])
          assert(integer(n[k]));
        if (n.queue) {
          const q = n.queue;
          for (const k of [
            "accepted",
            "completed",
            "dropped",
            "deadLettered",
            "waiting",
            "inFlight",
            "delayed",
          ])
            assert(integer(q[k]));
          assert(
            q.accepted ===
              q.completed +
                q.dropped +
                q.deadLettered +
                q.waiting +
                q.inFlight +
                q.delayed,
          );
        }
      }
      assert(
        new Set(view.nodes.map((n: any) => n.id)).size === view.nodes.length,
      );
      assert(integer(view.diagnostics?.processedEvents));
      eventTotal += view.diagnostics.processedEvents;
      assert(view.regional?.links.length === input.network.length);
      for (const link of view.regional.links)
        assert(
          input.network.some((n) => n.from + ">" + n.to === link.pair) &&
            integer(link.bytes) &&
            integer(link.transfers) &&
            integer(link.pending),
        );
    }
    if (result.mode === "paired") {
      for (const key of ["offeredRequests"])
        assert(
          repetition.baseline.summary[key] === repetition.outage.summary[key],
        );
      for (const id of Object.keys(repetition.baseline.origins))
        assert(
          repetition.baseline.origins[id].offeredRequests ===
            repetition.outage.origins[id].offeredRequests,
        );
    }
  }
  assert(
    eventTotal === result.processedEvents &&
      eventTotal <= snapshot.budgets.maxEvents,
  );
  assert(
    z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .safeParse(result.scenarioHash).success,
  );
  assert(
    Buffer.byteLength(JSON.stringify(raw)) <= snapshot.budgets.maxResultBytes,
  );
  if (result.wireVersion !== undefined || result.telemetry !== undefined)
    validateTelemetry(
      result,
      snapshot.scenario.workload.durationSeconds * 1000,
    );
  return raw;
}
