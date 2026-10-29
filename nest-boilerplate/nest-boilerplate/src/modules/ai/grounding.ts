import type { AiFacts } from "@/common/contracts/phase3/ai.schema";

/** Server-written caveats shown beside every explanation; the model never supplies them. */
export const EXPLANATION_LIMITATIONS = [
  "Mathematical model estimates, not measured infrastructure performance.",
  "Explains the saved revision and recorded run only; unsaved edits are not included.",
  "Generated prose is experimental and can be wrong. Compare it with the verified facts.",
] as const;
export const LEGACY_LIMITATIONS = [
  "Earlier experimental summary: it predates verified facts, so its wording is not checked against numbers.",
] as const;

/** Evidence ids a generated explanation may cite. The bottleneck id exists only when one was identified. */
export function evidenceIdsFor(facts: AiFacts) {
  return ["verdict", "p95", "errorRate", facts.bottleneck ? "bottleneck" : "noBottleneck"];
}

const NUMBER = /(?<![\w.])\d[\d,]*(?:\.\d+)?/g;

/** Every figure that may appear in generated prose, in the units a reader would see. */
function allowedFigures(facts: AiFacts, revision: number) {
  return [
    facts.p95Ms,
    facts.p95TargetMs,
    facts.errorRateFraction * 100,
    facts.errorBudgetFraction * 100,
    ...(facts.bottleneck ? [facts.bottleneck.utilizationFraction * 100] : []),
    revision,
  ];
}

/**
 * Deterministic structural grounding check. It rejects any figure that is not one of the server facts
 * (within rounding). It cannot judge whether the surrounding sentence is true, so it is a necessary
 * filter, not a certificate of accuracy; real answers are still reviewed against a rubric.
 */
export function groundingViolation(
  summary: string,
  facts: AiFacts,
  revision: number,
): string | null {
  const allowed = allowedFigures(facts, revision);
  for (const raw of summary.match(NUMBER) ?? []) {
    const value = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(value)) return "unreadable figure " + raw;
    // Tolerance is the rounding implied by the digits shown, plus a small relative margin. A flat
    // absolute margin would let 0.99 pass as the 1% budget, which is exactly the unit confusion to catch.
    const decimals = (raw.split(".")[1] ?? "").length;
    const rounding = 0.5 * 10 ** -decimals;
    const matches = allowed.some(
      (figure) => Math.abs(value - figure) <= Math.max(rounding, Math.abs(figure) * 0.005),
    );
    if (!matches) return "figure " + raw + " is not in the verified facts";
  }
  return null;
}

/** Typed, server-checked statements. Values are rendered from facts, never supplied by a model. */
export type EvidenceClaim =
  | "latency_within_target" | "latency_above_target"
  | "errors_within_budget" | "errors_above_budget"
  | "bottleneck_identified" | "no_bottleneck_identified";

const figure = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { maximumFractionDigits: digits });
/** Wording for an accepted claim. Every number comes from the facts, in explicit units. */
export function renderClaim(claim: string, facts: AiFacts): string {
  switch (claim) {
    case "latency_within_target":
      return "p95 latency " + figure(facts.p95Ms) + " ms is within the " + figure(facts.p95TargetMs) + " ms target.";
    case "latency_above_target":
      return "p95 latency " + figure(facts.p95Ms) + " ms is above the " + figure(facts.p95TargetMs) + " ms target.";
    case "errors_within_budget":
      return "Error rate " + figure(facts.errorRateFraction * 100, 3) + "% is within the " + figure(facts.errorBudgetFraction * 100, 3) + "% budget.";
    case "errors_above_budget":
      return "Error rate " + figure(facts.errorRateFraction * 100, 3) + "% is above the " + figure(facts.errorBudgetFraction * 100, 3) + "% budget.";
    case "bottleneck_identified":
      return facts.bottleneck
        ? facts.bottleneck.label + " is the bottleneck at " + figure(facts.bottleneck.utilizationFraction * 100, 0) + "% utilization."
        : "";
    case "no_bottleneck_identified":
      return "No bottleneck was identified.";
    default:
      return "";
  }
}

export function claimIsSupported(claim: string, facts: AiFacts): boolean {
  switch (claim) {
    case "latency_within_target": return facts.p95Ms <= facts.p95TargetMs;
    case "latency_above_target": return facts.p95Ms > facts.p95TargetMs;
    case "errors_within_budget": return facts.errorRateFraction <= facts.errorBudgetFraction;
    case "errors_above_budget": return facts.errorRateFraction > facts.errorBudgetFraction;
    case "bottleneck_identified": return facts.bottleneck !== null;
    case "no_bottleneck_identified": return facts.bottleneck === null;
    default: return false;
  }
}
