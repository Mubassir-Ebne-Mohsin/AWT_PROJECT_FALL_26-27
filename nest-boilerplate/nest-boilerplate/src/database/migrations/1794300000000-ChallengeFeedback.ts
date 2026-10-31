import { MigrationInterface, QueryRunner } from "typeorm";
export class ChallengeFeedback1794300000000 implements MigrationInterface {
  name = "ChallengeFeedback1794300000000";
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE challenge_feedback (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id uuid NOT NULL REFERENCES challenge_submissions(id) ON DELETE CASCADE,
      instructor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
      created_at timestamptz NOT NULL DEFAULT now())`);
    await q.query("CREATE INDEX challenge_feedback_submission ON challenge_feedback(submission_id, created_at)");
  }
  async down(q: QueryRunner) {
    await q.query("DROP TABLE challenge_feedback");
  }
}
