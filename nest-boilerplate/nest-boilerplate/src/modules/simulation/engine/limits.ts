import { z } from "zod";
import { limitsOutputSchema } from "@/common/contracts/phase2/result.schema";
import type { Design, Traffic } from "@/modules/simulation/engine/types";
import { simulate } from "@/modules/simulation/engine/simulate";
import { normTraffic } from "@/modules/simulation/engine/catalog";
import { successful } from "@/modules/simulation/engine/timeline";
import { toSummary, bounded } from "@/modules/simulation/engine/wire";
import { WorkBudget, ENGINE_BOUNDS } from "@/modules/simulation/engine/budget";

/** Source search preserved below the explicit search cap; a missing failure is a bound, never infinity. */
export function findLimits(
  design: Design,
  input?: Traffic,
  budget = new WorkBudget(),
): z.infer<typeof limitsOutputSchema> {
  const traffic = normTraffic(input || design.traffic);
  let maximumTestedRps = 1;
  const run = (rps: number, shedding = true) => {
    if (shedding) maximumTestedRps = Math.max(maximumTestedRps, rps);
    return successful(simulate(design, traffic, { rps, shedding, budget }));
  };
  const broken = (rps: number) => {
    const s = run(rps);
    return { b: !s.sloMet, s };
  };
  const demand = run(100, false);
  const order = demand.nodes
    .filter((n) => n.type !== "client" && n.rho > 0)
    .map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      satRps: 100 / n.rho,
    }))
    .sort((a, b) => a.satRps - b.satRps);
  const wireOrder = order.map((n) => ({ ...n, satRps: bounded(n.satRps) }));
  const current = run(traffic.rps);
  const curve = (maximum: number) =>
    Array.from({ length: 45 }, (_, i) => {
      const rps = Math.max(
        1,
        Math.min(ENGINE_BOUNDS.maximumRps, (maximum * i) / 44),
      );
      const s = run(rps);
      return {
        rps,
        p50: s.p50,
        p95: s.p95,
        p99: s.p99,
        err: s.errorRate,
        maxRho: s.maxRho,
      };
    });
  const base = {
    kind: "limits" as const,
    minimumTestedRps: 1 as const,
    current: toSummary(current),
    order: wireOrder,
    orderLabel: "predicted saturation under unshed demand" as const,
  };
  const floor = broken(1);
  if (floor.b) {
    const points = curve(Math.max(traffic.rps * 1.3, 100));
    return limitsOutputSchema.parse({
      ...base,
      state: "failsAtMinimumLoad",
      lowerThreshold: "unknown",
      headroom: null,
      maximumTestedRps,
      searchIterations: 0,
      cause: floor.s.p95 > traffic.sloP95 ? "latency" : "errors",
      at: toSummary(floor.s),
      firstId: floor.s.bottleneck?.id ?? null,
      curve: points,
    });
  }
  let lo = 1,
    hi = Math.min(ENGINE_BOUNDS.maximumRps, Math.max(traffic.rps, 50));
  let high = broken(hi);
  while (!high.b && hi < ENGINE_BOUNDS.maximumRps) {
    lo = hi;
    hi = Math.min(ENGINE_BOUNDS.maximumRps, hi * 2);
    high = broken(hi);
  }
  if (!high.b) {
    const points = curve(Math.min(ENGINE_BOUNDS.maximumRps, traffic.rps * 4));
    return limitsOutputSchema.parse({
      ...base,
      state: "notReachedWithinRange",
      maximumTestedRps,
      searchIterations: 0,
      cause: null,
      at: null,
      firstId: order[0]?.id ?? null,
      headroom: traffic.rps > 0 ? hi / traffic.rps : null,
      headroomIsLowerBound: true,
      curve: points,
    });
  }
  for (let i = 0; i < ENGINE_BOUNDS.searchIterations; i++) {
    const mid = Math.sqrt(lo * hi);
    if (broken(mid).b) hi = mid;
    else lo = mid;
  }
  const at = run(hi);
  const latencyBad = at.p95 > traffic.sloP95,
    errorsBad = at.errorRate > traffic.errorBudget;
  const points = curve(Math.max(hi * 1.6, traffic.rps * 1.25));
  return limitsOutputSchema.parse({
    ...base,
    state: "found",
    maximumTestedRps,
    searchIterations: ENGINE_BOUNDS.searchIterations,
    passingRps: lo,
    failingRps: hi,
    cause: latencyBad && errorsBad ? "both" : latencyBad ? "latency" : "errors",
    at: toSummary(at),
    firstId: at.bottleneck?.id ?? order[0]?.id ?? null,
    curve: points,
    headroom: bounded(traffic.rps > 0 ? hi / traffic.rps : Infinity),
  });
}
