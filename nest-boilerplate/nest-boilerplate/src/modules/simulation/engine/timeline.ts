import type {
  Design,
  Traffic,
  Simulation,
  InvalidSimulation,
  TimelinePoint,
} from "@/modules/simulation/engine/types";
import {
  normTraffic,
  mulberry32,
  hashStr,
  designKey,
} from "@/modules/simulation/engine/catalog";
import { validate } from "@/modules/simulation/engine/graph";
import { simulate } from "@/modules/simulation/engine/simulate";
import { WorkBudget, EngineFault } from "@/modules/simulation/engine/budget";
export function successful(s: Simulation | InvalidSimulation): Simulation {
  if (!s.ok) throw new EngineFault("COMPUTE_FAILED", "Design is not runnable");
  return s;
}
export function shapeFactor(shape: Traffic["shape"], t: number, B: number) {
  if (shape === "ramp") return 0.15 + (B - 0.15) * t;
  if (shape === "spike") {
    const spike = (c: number) => Math.max(0, 1 - Math.abs(t - c) / 0.05);
    return (
      Math.min(1, t / 0.08) * (1 + (B - 1) * Math.max(spike(0.32), spike(0.7)))
    );
  }
  const bump = Math.max(0, 1 - Math.abs(t - 0.5) / 0.07);
  return Math.min(1, t / 0.1) * (1 + (B - 1) * bump);
}
export function timeline(
  design: Design,
  trafficIn?: Traffic,
  budget = new WorkBudget(),
) {
  const traffic = normTraffic(trafficIn || design.traffic);
  if (!validate(design).ok) return [];
  const rnd = mulberry32(hashStr(designKey(design, traffic)));
  const N = 48,
    pts: TimelinePoint[] = [];
  const flat = Object.assign({}, traffic, { burst: 1 });
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const rps =
      traffic.rps *
      shapeFactor(traffic.shape, t, traffic.burst) *
      (1 + (rnd() - 0.5) * 0.05);
    const s = successful(
      simulate(design, flat, { rps: Math.max(0, rps), budget }),
    );
    pts.push({
      t: t * traffic.durationMin,
      rps,
      p95: s.p95 * (1 + (rnd() - 0.5) * 0.07),
      err: s.errorRate,
    });
  }
  return pts;
}
