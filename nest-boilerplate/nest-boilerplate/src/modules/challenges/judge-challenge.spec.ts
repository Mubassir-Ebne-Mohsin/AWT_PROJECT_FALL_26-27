import { judgeChallenge } from "@/modules/challenges/judge-challenge";
import { submitAttemptSchema } from "@/common/contracts/phase3/attempts.schema";
describe("R5.2 authoritative judging", () => {
  const goal = { p95Ms: 300, errorRate: 0.01 };
  it("passes exact boundaries and zero error budgets", () => {
    expect(judgeChallenge(300, 0.01, goal).passes).toBe(true);
    expect(judgeChallenge(300, 0, { ...goal, errorRate: 0 }).passes).toBe(true);
  });
  it("fails when either target is exceeded", () => {
    expect(judgeChallenge(300.001, 0, goal).passes).toBe(false);
    expect(judgeChallenge(1, 0.010001, goal).passes).toBe(false);
  });
  it.each([NaN, Infinity, -1])("rejects invalid latency %s", (value) => {
    expect(() => judgeChallenge(value, 0, goal)).toThrow();
  });
  it.each([NaN, Infinity, -1, 1.01])(
    "rejects invalid error fraction %s",
    (value) => {
      expect(() => judgeChallenge(1, value, goal)).toThrow();
    },
  );
  it("does not accept client metrics or judging settings", () => {
    expect(
      submitAttemptSchema.safeParse({
        requestId: "11111111-1111-4111-8111-111111111111",
        expectedRevision: 1,
        passes: true,
      }).success,
    ).toBe(false);
  });
});
