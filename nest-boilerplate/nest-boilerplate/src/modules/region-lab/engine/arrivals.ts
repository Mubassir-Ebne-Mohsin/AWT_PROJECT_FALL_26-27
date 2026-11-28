import type { FoundationInput } from "@/modules/region-lab/engine/input";

interface Segment {
  start: number;
  end: number;
  rate: number;
  slope: number;
  massBefore: number;
  mass: number;
}

/** Inverts integrated requests/ms, including warmup and zero-rate intervals. No per-ms sampling. */
export class ArrivalSchedule {
  private readonly segments: Segment[] = [];
  readonly totalMass: number;
  constructor(workload: FoundationInput["workload"]) {
    const { warmupMs, baselineRps, schedule } = workload;
    const points = [
      ...(warmupMs ? [{ atMs: 0, multiplier: schedule[0].multiplier }] : []),
      ...schedule.map((k) => ({ ...k, atMs: k.atMs + warmupMs })),
    ];
    let mass = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        duration = b.atMs - a.atMs;
      const rate = (baselineRps * a.multiplier) / 1000,
        endRate = (baselineRps * b.multiplier) / 1000;
      const segmentMass = ((rate + endRate) * duration) / 2;
      this.segments.push({
        start: a.atMs,
        end: b.atMs,
        rate,
        slope: (endRate - rate) / duration,
        massBefore: mass,
        mass: segmentMass,
      });
      mass += segmentMass;
    }
    this.totalMass = mass;
  }
  atMass(target: number): number | null {
    if (!(target >= 0) || target >= this.totalMass) return null;
    const segment = this.segments.find(
      (s) => s.mass > 0 && target < s.massBefore + s.mass,
    )!;
    const mass = Math.max(0, target - segment.massBefore);
    let elapsed: number;
    if (Math.abs(segment.slope) < 1e-15) elapsed = mass / segment.rate;
    else {
      const root = Math.sqrt(
        Math.max(0, segment.rate ** 2 + 2 * segment.slope * mass),
      );
      elapsed = mass === 0 ? 0 : (2 * mass) / (segment.rate + root);
    }
    return Math.min(
      segment.end,
      Math.max(segment.start, segment.start + elapsed),
    );
  }
}
