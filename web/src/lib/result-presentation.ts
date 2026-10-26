import type { components } from "@/lib/api/schema";
export type Simulation = components["schemas"]["SimulationOutput"];
export type Summary = Simulation["summary"];
export function numberText(n: number, digits = 2) {
  if (!Number.isFinite(n)) return "Unavailable";
  if (n !== 0 && Math.abs(n) < Math.pow(10, -digits)) return n.toExponential(2);
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}
export const percent = (n: number) => numberText(n * 100, 3) + "%";
export const milliseconds = (n: number) => numberText(n) + " ms";
export function boundedText(
  v: { kind: "finite"; value: number } | { kind: "unbounded" },
  unit = "",
) {
  return v.kind === "unbounded" ? "Unbounded" : numberText(v.value) + unit;
}
export function verdictReasons(s: Summary): string[] {
  const t = s.traffic,
    reasons: string[] = [];
  if (s.p95 > t.sloP95)
    reasons.push(
      "p95 is " +
        milliseconds(s.p95) +
        ", above the " +
        milliseconds(t.sloP95) +
        " target.",
    );
  else if (s.p95 > t.sloP95 * 0.8)
    reasons.push(
      "p95 is within " +
        numberText((1 - s.p95 / t.sloP95) * 100) +
        "% of the target, leaving little latency headroom.",
    );
  if (s.errorRate > t.errorBudget)
    reasons.push(
      "Errors are " +
        percent(s.errorRate) +
        ", above the " +
        percent(t.errorBudget) +
        " budget.",
    );
  const busy = s.nodes
    .filter((n) => n.type !== "client" && n.rho >= 0.75)
    .sort((a, b) => b.rho - a.rho);
  for (const n of busy.slice(0, 3))
    reasons.push(
      n.label +
        " is at " +
        percent(n.rho) +
        " utilization" +
        (n.rho >= 1
          ? ", at or above modeled capacity."
          : "; waiting time increases as capacity fills."),
    );
  for (const q of s.queues.filter((q) => q.state === "growing"))
    reasons.push(q.label + " has a growing background backlog.");
  if (!reasons.length)
    reasons.push(
      s.verdict === "pass"
        ? "The recorded run meets its latency and error targets with utilization below the warning threshold."
        : "Review the recorded component, queue and latency metrics for this verdict.",
    );
  return reasons;
}
export function timelineGeometry(
  points: Simulation["timeline"],
  target: number,
  duration: number,
) {
  const latencyMax =
    Math.max(1, target * 1.3, ...points.map((p) => p.p95)) * 1.05;
  const rateMax = Math.max(1, ...points.map((p) => p.rps)) * 1.1;
  const end = Math.max(1, duration, ...points.map((p) => p.t));
  const x = (t: number) => 58 + (t / end) * 596,
    y = (v: number) => 220 - (v / latencyMax) * 184,
    ry = (v: number) => 220 - (v / rateMax) * 184;
  const line = points
    .map(
      (p, i) => (i ? "L" : "M") + x(p.t).toFixed(2) + " " + y(p.p95).toFixed(2),
    )
    .join(" ");
  const rate = points.length
    ? "M" +
      x(points[0].t) +
      " 220 " +
      points
        .map((p) => "L" + x(p.t).toFixed(2) + " " + ry(p.rps).toFixed(2))
        .join(" ") +
      " L" +
      x(points[points.length - 1].t) +
      " 220 Z"
    : "";
  return { latencyMax, rateMax, end, x, y, ry, line, rate };
}
