import { publicChallenge } from "@/modules/challenges/challenge-projection";
import { FOUNDATION_PACK } from "@/modules/challenges/foundation-fixtures";
import { createExerciseRules } from "@/modules/challenges/exercise-rules";
import {
  challengeLearningSchema,
  challengeRulesSchema,
} from "@/common/contracts/phase3/challenge-learning.schema";
describe("Public challenge starter projection", () => {
  it("exposes bounded topology and instructions, never private answers or node properties", () => {
    const c = FOUNDATION_PACK[0],
      shown = publicChallenge({
        id: c.id,
        title: c.title,
        summary: c.summary,
        goal: { p95Ms: 150, errorRate: 0.01 },
        traffic: c.traffic,
        learning: c.learning,
        exercise_rules: createExerciseRules(c.start, c.policy),
        starting_graph: c.start,
        reference: c.reference,
        instructor_email: "private@example.test",
      });
    expect(Object.keys(shown).sort()).toEqual([
      "baseline",
      "goal",
      "id",
      "learning",
      "preview",
      "rules",
      "summary",
      "title",
      "traffic",
    ]);
    expect(
      shown.preview!.nodes.every(
        (n) => Object.keys(n).sort().join(",") === "id,label,type,x,y",
      ),
    ).toBe(true);
    expect(shown).not.toHaveProperty("reference");
    expect(shown).not.toHaveProperty("instructor_email");
  });
  it("uses an explicit unavailable preview for malformed legacy data", () => {
    const c = FOUNDATION_PACK[0];
    expect(
      publicChallenge({
        id: c.id,
        title: c.title,
        summary: c.summary,
        goal: { p95Ms: 150, errorRate: 0.01 },
        starting_graph: { nodes: "invalid" },
      }).preview,
    ).toBeNull();
  });
  it("bounds guides and rejects unexpected rule keys", () => {
    const c = FOUNDATION_PACK[0];
    expect(
      challengeLearningSchema.safeParse({ ...c.learning, hints: ["one"] })
        .success,
    ).toBe(false);
    expect(
      challengeLearningSchema.safeParse({ ...c.learning, estimatedMinutes: 0 })
        .success,
    ).toBe(false);
    expect(
      challengeRulesSchema.safeParse({
        ...createExerciseRules(c.start, c.policy),
        skipJudge: true,
      }).success,
    ).toBe(false);
  });
});
