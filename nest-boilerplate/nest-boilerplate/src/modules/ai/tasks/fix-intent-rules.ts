import type { FixIntentOutput } from "@/modules/ai/tasks/fix-intent";

/**
 * A keyword reading of the same goals, with no model. It is the reference the gate reports beside the hosted model, and it is
 * deliberately plain: it looks for a negation near a word for each kind of fix, and for a word for each preference. It obeys nothing.
 */
const NEGATION = "(?:no|not|never|without|avoid|don't|dont|can't|cant|cannot|won't)";
const near = (text: string, what: string) => new RegExp("\\b" + NEGATION + "\\b[^.;]{0,40}\\b(?:" + what + ")").test(text);

export function ruleFixIntent(goal: string): FixIntentOutput {
  const text = goal.toLowerCase();
  const excludeReplicas = near(text, "more servers|new servers|extra servers|more copies|more instances|more workers|servers");
  const excludeCapacity = near(text, "bigger|larger|upgrade|resize|instance size");
  const excludeCache = near(text, "cache|caching|redis");
  const excludeReadReplica = near(text, "database|read replica|replicas?\\b");
  const preference = /cheap|simple|simplest|lightest|least change/.test(text)
    ? "simplest"
    : /fast|latency|quick|responsive/.test(text)
      ? "lowest_latency"
      : /error|reliab|fail/.test(text)
        ? "fewest_errors"
        : "default";
  const understood = excludeReplicas || excludeCapacity || excludeCache || excludeReadReplica || preference !== "default";
  return { understood, excludeReplicas, excludeCapacity, excludeCache, excludeReadReplica, preference };
}
