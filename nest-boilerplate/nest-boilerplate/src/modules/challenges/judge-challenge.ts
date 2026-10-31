import { challengeGoalSchema } from "@/common/contracts/phase3/challenges.schema";

/** Fractions remain fractions; inclusive goals use AND, independent of the simulator's descriptive verdict. */
export function judgeChallenge(p95: number, errorRate: number, goal: unknown) {
  const parsed = challengeGoalSchema.parse(goal);
  if (
    !Number.isFinite(p95) ||
    p95 < 0 ||
    !Number.isFinite(errorRate) ||
    errorRate < 0 ||
    errorRate > 1
  )
    throw new Error("Invalid simulation metrics");
  return {
    p95,
    errorRate,
    passes: p95 <= parsed.p95Ms && errorRate <= parsed.errorRate,
  };
}
