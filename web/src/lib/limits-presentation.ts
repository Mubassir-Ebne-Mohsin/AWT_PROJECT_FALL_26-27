import type { components } from "@/lib/api/schema";
import { numberText, percent, milliseconds } from "@/lib/result-presentation";

export type LimitsOutput = components["schemas"]["LimitsOutput"];
type Bounded = { kind: "finite"; value: number } | { kind: "unbounded" };

export const rpsText = (n: number) => numberText(n, n < 10 ? 2 : 0) + " rps";

/** Show a searched bracket with enough precision that its two bounds stay visibly distinct. */
export function bracketText(lo: number, hi: number) {
  for (let digits = lo < 10 ? 2 : 0; digits <= 6; digits++) {
    const a = numberText(lo, digits),
      b = numberText(hi, digits);
    if (a !== b || digits === 6) return a + " – " + b + " rps";
  }
  return rpsText(lo) + " – " + rpsText(hi);
}

export interface Headline {
  label: string;
  value: string;
  detail: string;
  tone: "" | "ok" | "warn" | "fail";
}

/**
 * The searched threshold in words that never overclaim: a bracket for "found", the minimum tested load
 * for "failsAtMinimumLoad" and the highest tested load for "notReachedWithinRange".
 */
export function limitsHeadline(r: LimitsOutput): Headline {
  const burst = r.current.traffic.burst;
  if (r.state === "found")
    return {
      label: "Misses targets between",
      value: bracketText(r.passingRps, r.failingRps),
      detail:
        "Last tested passing and first tested failing average entry rate" +
        (burst > 1
          ? `; with ×${numberText(burst)} bursts the failing peak is about ${rpsText(r.failingRps * burst)}`
          : "") +
        ".",
      tone: "fail",
    };
  if (r.state === "failsAtMinimumLoad")
    return {
      label: "Misses targets at",
      value: "the minimum tested 1 rps",
      detail:
        "Already misses its targets at the lowest tested load. The threshold below 1 rps is unknown; this does not mean zero capacity or failure at every positive load.",
      tone: "fail",
    };
  return {
    label: "No failure found up to",
    value: rpsText(r.maximumTestedRps),
    detail:
      "Highest tested average entry rate. The search stopped at its tested range; this is not proof of unlimited capacity.",
    tone: "ok",
  };
}

const boundedNumber = (v: Bounded) => (v.kind === "finite" ? v.value : null);

/** Headroom relative to today's average load. Zero current traffic or a minimum-load failure has none. */
export function headroomText(r: LimitsOutput): { value: string; detail: string } {
  const current = r.current.traffic.rps;
  if (r.state === "failsAtMinimumLoad")
    return { value: "Not applicable", detail: "Targets are already missed at the minimum tested load." };
  if (current <= 0)
    return { value: "Not applicable", detail: "Current average traffic is 0 rps, so no multiplier is defined." };
  if (r.state === "notReachedWithinRange")
    return r.headroom === null
      ? { value: "Not applicable", detail: "No current-load multiplier is defined." }
      : { value: "at least ×" + numberText(r.headroom, 1), detail: "Lower bound: no failure within the tested range." };
  const h = boundedNumber(r.headroom);
  return h === null
    ? { value: "Not applicable", detail: "No finite multiplier is defined for this result." }
    : {
        value: "×" + numberText(h, 1),
        detail: `First tested failing load relative to today's ${rpsText(current)} average.`,
      };
}

export function causeText(r: LimitsOutput) {
  if (r.state === "notReachedWithinRange" || !r.cause) return "No failure found in the tested range";
  return { latency: "p95 latency crosses its target", errors: "Errors exceed the budget", both: "Latency and errors both fail" }[r.cause];
}

/** Component named by the search as the first to give out, if any; labels come from the recorded snapshot. */
export function firstComponent(r: LimitsOutput) {
  if (!r.firstId) return null;
  const at = r.state === "notReachedWithinRange" ? null : r.at;
  const metric = at?.nodes.find((n) => n.id === r.firstId) ?? r.current.nodes.find((n) => n.id === r.firstId);
  return metric ? { id: metric.id, label: metric.label, rhoAtFailure: at?.nodes.find((n) => n.id === r.firstId)?.rho ?? null } : null;
}

export interface OrderRow {
  id: string;
  label: string;
  type: string;
  sat: string;
  ratio: string | null;
  tone: "ok" | "warn" | "fail" | "";
  width: number;
}
/** Predicted saturation order. Ratio/tone are relative to today's average load and absent at zero traffic. */
export function orderRows(r: LimitsOutput): OrderRow[] {
  const current = r.current.traffic.rps;
  const finite = r.order.map((o) => boundedNumber(o.satRps)).filter((v): v is number => v !== null);
  const max = Math.max(1, ...finite);
  return r.order.map((o) => {
    const sat = boundedNumber(o.satRps);
    const ratio = sat !== null && current > 0 ? sat / current : null;
    return {
      id: o.id,
      label: o.label,
      type: o.type,
      sat: sat === null ? "Unbounded" : rpsText(sat),
      ratio: ratio === null ? null : "×" + numberText(ratio, 1),
      tone: ratio === null ? "" : ratio <= 1 ? "fail" : ratio <= 1.5 ? "warn" : "ok",
      width: sat === null ? 100 : Math.max(2, Math.min(100, (sat / max) * 100)),
    };
  });
}

/** Ramp chart geometry on one x scale with separate latency and error axes. No undisclosed caps. */
export function rampGeometry(r: LimitsOutput) {
  const t = r.current.traffic,
    curve = r.curve;
  const xmax = Math.max(1, ...curve.map((p) => p.rps), r.maximumTestedRps);
  const latencyMax = Math.max(1, t.sloP95 * 1.3, ...curve.map((p) => p.p99)) * 1.05;
  const errorMax = Math.min(1, Math.max(0.0001, t.errorBudget * 3, ...curve.map((p) => p.err)) * 1.05);
  const left = 58,
    right = 662,
    top = 24,
    topH = 168,
    bot = 222,
    botH = 86;
  const x = (v: number) => left + (Math.min(v, xmax) / xmax) * (right - left);
  const y = (v: number) => top + topH - (Math.min(v, latencyMax) / latencyMax) * topH;
  const ey = (v: number) => bot + botH - (Math.min(v, errorMax) / errorMax) * botH;
  const path = (f: (p: (typeof curve)[number]) => number, Y: (v: number) => number) =>
    curve.map((p, i) => (i ? "L" : "M") + x(p.rps).toFixed(2) + " " + Y(f(p)).toFixed(2)).join(" ");
  return {
    xmax, latencyMax, errorMax, left, right, top, topH, bot, botH, x, y, ey,
    p95: path((p) => p.p95, y),
    p99: path((p) => p.p99, y),
    err: path((p) => p.err, ey),
    markers: {
      current: t.rps > 0 && t.rps <= xmax ? t.rps : null,
      passing: r.state === "found" ? r.passingRps : null,
      failing: r.state === "found" ? r.failingRps : r.state === "failsAtMinimumLoad" ? 1 : null,
    },
  };
}

export const curveRowText = (p: LimitsOutput["curve"][number]) => ({
  rps: numberText(p.rps, 2),
  p50: milliseconds(p.p50),
  p95: milliseconds(p.p95),
  p99: milliseconds(p.p99),
  err: percent(p.err),
  maxRho: numberText(p.maxRho * 100, 1) + "%",
});
