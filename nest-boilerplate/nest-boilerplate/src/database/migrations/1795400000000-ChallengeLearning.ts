import { MigrationInterface, QueryRunner } from "typeorm";
export class ChallengeLearning1795400000000 implements MigrationInterface {
  name = "ChallengeLearning1795400000000";
  async up(q: QueryRunner) {
    await q.query(
      "ALTER TABLE challenges ADD COLUMN learning jsonb NULL, ADD COLUMN exercise_rules jsonb NULL",
    );
    await q.query(
      "ALTER TABLE challenge_submissions ADD COLUMN rule_snapshot jsonb NULL",
    );
  }
  async down(q: QueryRunner) {
    const [row] = await q.query(
      "SELECT EXISTS(SELECT 1 FROM challenges WHERE learning IS NOT NULL OR exercise_rules IS NOT NULL) OR EXISTS(SELECT 1 FROM challenge_submissions WHERE rule_snapshot IS NOT NULL) AS used",
    );
    if (row.used)
      throw new Error(
        "ChallengeLearning rollback refused: learning/rule history must be preserved",
      );
    await q.query(
      "ALTER TABLE challenge_submissions DROP COLUMN rule_snapshot",
    );
    await q.query(
      "ALTER TABLE challenges DROP COLUMN exercise_rules, DROP COLUMN learning",
    );
  }
}
