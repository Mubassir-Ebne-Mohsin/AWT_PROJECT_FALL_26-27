import type { AiFacts, AiResult } from "@/common/contracts/phase3/ai.schema";
import { evidenceIdsFor, renderClaim } from "@/modules/ai/grounding";

/**
 * The rule-based explanation: the same verified facts in, the same sentences out, no model. It is the yardstick a model
 * must beat to be worth turning on, and it is what a reader gets if no model is available. Every figure comes from the
 * facts through the same wording the server uses for accepted claims.
 */
export function ruleBasedExplanation(facts: AiFacts): AiResult {
  const claims: NonNullable<AiResult["claims"]> = [
    facts.p95Ms <= facts.p95TargetMs ? "latency_within_target" : "latency_above_target",
    facts.errorRateFraction <= facts.errorBudgetFraction ? "errors_within_budget" : "errors_above_budget",
    facts.bottleneck ? "bottleneck_identified" : "no_bottleneck_identified",
  ];
  const ids = evidenceIdsFor(facts);
  return {
    summary: claims.map((claim) => renderClaim(claim, facts)).join(" "),
    // The ids that back the three sentences, in order: latency, errors, bottleneck (or its absence).
    evidenceIds: [ids[1], ids[2], ids[3]],
    claims,
  };
}
