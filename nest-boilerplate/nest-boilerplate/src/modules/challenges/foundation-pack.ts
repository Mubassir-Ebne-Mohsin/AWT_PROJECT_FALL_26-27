import { DataSource } from "typeorm";
import { FOUNDATION_PACK } from "@/modules/challenges/foundation-fixtures";
import {
  createExerciseRules,
  exerciseIssues,
} from "@/modules/challenges/exercise-rules";
import { calculate } from "@/modules/simulation/engine/compute";
import { graphSchema } from "@/common/contracts/phase2/graph.schema";
import { challengeLearningSchema } from "@/common/contracts/phase3/challenge-learning.schema";
import { judgeChallenge } from "@/modules/challenges/judge-challenge";
export function verifyFoundationPack() {
  return FOUNDATION_PACK.map((c) => {
    graphSchema.parse(c.start);
    graphSchema.parse(c.reference);
    challengeLearningSchema.parse(c.learning);
    const rules = createExerciseRules(c.start, c.policy);
    if (
      exerciseIssues(c.start, c.start, rules).length ||
      exerciseIssues(c.start, c.reference, rules).length
    )
      throw Error("Invalid exercise fixture: " + c.title);
    const measure = (graph: typeof c.start) => {
      const r = calculate({
        kind: "simulation",
        snapshot: { schemaVersion: 1, graph, traffic: c.traffic },
      });
      if (r.output?.kind !== "simulation")
        throw Error("Invalid graph: " + c.title);
      return {
        ...judgeChallenge(r.output.summary.p95, r.output.summary.errorRate, {
          p95Ms: c.traffic.sloP95,
          errorRate: c.traffic.errorBudget,
        }),
        engineVersion: r.engineVersion,
      };
    };
    const baseline = measure(c.start),
      reference = measure(c.reference);
    if (baseline.passes || !reference.passes)
      throw Error("Uncalibrated exercise: " + c.title);
    return { fixture: c, rules, baseline };
  });
}
/** Explicit opt-in only. Never called by application startup or the legacy four-example seeder. */
export async function seedFoundationPack(db: DataSource, instructor: string) {
  const verified = verifyFoundationPack();
  return db.transaction(async (m) => {
    await m.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "sf-challenges:" + instructor,
    ]);
    const [owner] = await m.query(
      "SELECT u.id FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=$1 AND u.account_status='active' AND r.role='instructor'",
      [instructor],
    );
    if (!owner)
      throw Error("Choose an active account with the Instructor role");
    const ids = verified.map((c) => c.fixture.id),
      existing = await m.query(
        "SELECT id,instructor_id FROM challenges WHERE id=ANY($1::uuid[])",
        [ids],
      );
    if (
      existing.some(
        (r: { instructor_id: string }) => r.instructor_id !== instructor,
      )
    )
      throw Error(
        "Foundation identity collision; existing content was not changed",
      );
    const [{ n }] = await m.query(
      "SELECT count(*)::int AS n FROM challenges WHERE instructor_id=$1",
      [instructor],
    );
    if (n + verified.length - existing.length > 50)
      throw Error(
        "Foundation pack would exceed the 50-challenge Instructor limit",
      );
    let added = 0;
    for (const { fixture: c, rules, baseline } of verified) {
      if (existing.some((r: { id: string }) => r.id === c.id)) continue;
      await m.query(
        `INSERT INTO challenges(id,instructor_id,title,summary,goal_p95_ms,goal_error_rate,traffic,starting_graph,status,baseline,learning,exercise_rules,created_at,updated_at,published_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,'published',$9,$10,$11,now(),now(),now())`,
        [
          c.id,
          instructor,
          c.title,
          c.summary,
          c.traffic.sloP95,
          c.traffic.errorBudget,
          JSON.stringify(c.traffic),
          JSON.stringify(c.start),
          JSON.stringify(baseline),
          JSON.stringify(c.learning),
          JSON.stringify(rules),
        ],
      );
      added++;
    }
    return added;
  });
}
