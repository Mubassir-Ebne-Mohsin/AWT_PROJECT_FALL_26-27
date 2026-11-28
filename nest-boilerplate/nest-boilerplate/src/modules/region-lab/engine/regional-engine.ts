import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  regionalInputSchema,
  type RegionalInput,
} from "@/modules/region-lab/engine/regional-input";
import { executeComponentModel } from "@/modules/region-lab/engine/component-engine";
import {
  FoundationError,
  FOUNDATION_LIMITS,
  type FoundationOptions,
} from "@/modules/region-lab/engine/engine";
export const REGIONAL_ENGINE_VERSION = "region-lab-regions-v1";
export function simulateRegional(
  value: unknown,
  options: FoundationOptions = {},
) {
  const parsed = regionalInputSchema.safeParse(value);
  if (!parsed.success)
    throw new FoundationError(
      "INVALID_INPUT",
      parsed.error.issues
        .slice(0, 8)
        .map((i) => i.message)
        .join("; "),
    );
  const input = parsed.data;
  canonical(input);
  const result = executeComponentModel(
    { ...input, componentVersion: 1 },
    options,
    input,
  );
  const global = result.summary;
  const check = (s: typeof global, p95Ms: number, errorBudgetRatio: number) => {
    if (
      (s.errorRateRatio !== null && s.errorRateRatio > errorBudgetRatio) ||
      (s.latency.p95Ms !== null && s.latency.p95Ms > p95Ms)
    )
      return "fail";
    if (s.unresolvedRequests || s.latency.p95Ms === null)
      return "indeterminate";
    return "pass";
  };
  let verdict = check(
    global,
    input.targets.p95Ms,
    input.targets.errorBudgetRatio,
  );
  for (const t of input.regionalTargets) {
    const s = result.origins[t.region];
    const v = check(s, t.p95Ms, t.errorBudgetRatio);
    if (v === "fail") verdict = "fail";
    else if (v === "indeterminate" && verdict !== "fail")
      verdict = "indeterminate";
  }
  const warnings = [...result.warnings];
  if (input.outage)
    for (const r of input.routing)
      if (
        [r.primaryEntryNodeId, ...r.fallbackEntryNodeIds].every((id) =>
          input.outage!.affectedNodeIds.includes(id),
        )
      )
        warnings.push(
          "No surviving entry candidate for " +
            r.originRegion +
            ">" +
            r.operationId,
        );
  const output = {
    ...result,
    engineVersion: REGIONAL_ENGINE_VERSION,
    stage: "uncalibrated-regional",
    inputHash: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
    summary: {
      ...global,
      failures: {
        ...global.failures,
        UNAVAILABLE:
          "UNAVAILABLE" in global.failures ? global.failures.UNAVAILABLE : 0,
      },
      verdict,
    },
    warnings,
    limitations: [
      "Directed network matrix is an explicit measured or assumed input; no geographic accuracy inferred",
      "Application-deployment outages only; no DB promotion, network partition or autoscaling",
      "Workers reserve a processing slot while fetching across the network; private worker buffers are unsupported",
      "Replica commits serialize requestBytes; apply is ordered on a dedicated lane",
      "No real-system calibration, HDR wire serialization, API/UI integration or hosted worker isolation",
    ],
  };
  const limit =
    options.limits?.maxResultBytes ?? FOUNDATION_LIMITS.maxResultBytes;
  if (Buffer.byteLength(JSON.stringify(output)) > limit)
    throw new FoundationError(
      "BUDGET_EXCEEDED",
      "Regional result exceeds size limit",
    );
  return output;
}
export function canonical(input: RegionalInput) {
  const order = (a: { id: string }, b: { id: string }) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  input.nodes.sort(order);
  input.edges.sort(order);
  input.edges.forEach((e) => e.operationIds.sort());
  input.workload.origins.sort(order);
  input.workload.operations.sort(order);
  input.network.sort((a, b) =>
    a.from + ">" + a.to < b.from + ">" + b.to
      ? -1
      : a.from + ">" + a.to > b.from + ">" + b.to
        ? 1
        : 0,
  );
  input.routing.sort((a, b) =>
    a.originRegion + ">" + a.operationId < b.originRegion + ">" + b.operationId
      ? -1
      : a.originRegion + ">" + a.operationId >
          b.originRegion + ">" + b.operationId
        ? 1
        : 0,
  );
  input.regionalTargets.sort((a, b) => (a.region < b.region ? -1 : 1));
  input.outage?.affectedNodeIds.sort();
}
export function simulateRegionalExperiment(
  value: unknown,
  mode: "baseline" | "outage" | "paired",
  repetitions = 1,
  options: FoundationOptions = {},
) {
  if (
    !["baseline", "outage", "paired"].includes(mode) ||
    !Number.isInteger(repetitions) ||
    repetitions < 1 ||
    repetitions > 5
  )
    throw new FoundationError(
      "INVALID_INPUT",
      "Invalid experiment mode/repetitions",
    );
  const parsed = regionalInputSchema.safeParse(value);
  if (!parsed.success)
    throw new FoundationError("INVALID_INPUT", "Invalid regional experiment");
  if (mode !== "baseline" && !parsed.data.outage)
    throw new FoundationError(
      "INVALID_INPUT",
      "Outage mode requires an outage",
    );
  const clock = options.clock ?? (() => performance.now()),
    heap = options.heapUsed ?? (() => process.memoryUsage().heapUsed);
  const started = clock(),
    initialHeap = heap();
  let remaining = options.limits?.maxEvents ?? FOUNDATION_LIMITS.maxEvents,
    observations = 0;
  const wall = options.limits?.maxWallTimeMs ?? FOUNDATION_LIMITS.maxWallTimeMs;
  const runs = [];
  for (let i = 0; i < repetitions; i++) {
    const seed =
      i === 0
        ? parsed.data.seed
        : createHash("sha256")
            .update(JSON.stringify([parsed.data.seed, "replicate", i]))
            .digest()
            .readUInt32BE(0);
    const sides: Partial<
      Record<"baseline" | "outage", ReturnType<typeof simulateRegional>>
    > = {};
    for (const side of mode === "paired"
      ? (["baseline", "outage"] as const)
      : ([mode] as ("baseline" | "outage")[])) {
      const left = Math.floor(wall - (clock() - started));
      if (left < 1)
        throw new FoundationError(
          "DEADLINE_EXCEEDED",
          "Experiment wall budget exceeded",
        );
      if (remaining < 1)
        throw new FoundationError(
          "BUDGET_EXCEEDED",
          "Experiment event budget exceeded",
        );
      const input = {
        ...parsed.data,
        seed,
        outage: side === "baseline" ? null : parsed.data.outage,
      };
      const result = simulateRegional(input, {
        ...options,
        limits: {
          ...options.limits,
          maxEvents: remaining,
          maxWallTimeMs: left,
        },
      });
      remaining -= result.diagnostics.processedEvents;
      observations += result.regional!.storedObservations;
      if (
        observations >
          (options.limits?.maxObservations ??
            FOUNDATION_LIMITS.maxObservations) ||
        heap() - initialHeap >
          (options.limits?.maxHeapGrowthBytes ??
            FOUNDATION_LIMITS.maxHeapGrowthBytes)
      )
        throw new FoundationError(
          "BUDGET_EXCEEDED",
          "Experiment retained memory/observation limit exceeded",
        );
      sides[side] = result;
    }
    runs.push({ repetition: i, seed, ...sides });
  }
  const output = {
    engineVersion: REGIONAL_ENGINE_VERSION,
    mode,
    repetitions: runs,
    processedEvents:
      (options.limits?.maxEvents ?? FOUNDATION_LIMITS.maxEvents) - remaining,
  };
  if (
    Buffer.byteLength(JSON.stringify(output)) >
    (options.limits?.maxResultBytes ?? FOUNDATION_LIMITS.maxResultBytes)
  )
    throw new FoundationError(
      "BUDGET_EXCEEDED",
      "Experiment aggregate result too large",
    );
  if (clock() - started > wall)
    throw new FoundationError(
      "DEADLINE_EXCEEDED",
      "Experiment wall budget exceeded",
    );
  return output;
}
