import { MigrationInterface, QueryRunner } from "typeorm";
export class ChallengeAttempts1794200000000 implements MigrationInterface {
  name = "ChallengeAttempts1794200000000";
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE challenge_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      challenge_id uuid NOT NULL REFERENCES challenges(id) ON DELETE RESTRICT,
      learner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      design_id uuid UNIQUE REFERENCES designs(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(challenge_id, learner_id))`);
    await q.query(`CREATE TABLE challenge_submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id uuid NOT NULL REFERENCES challenge_attempts(id) ON DELETE CASCADE,
      request_id uuid NOT NULL,
      design_revision integer NOT NULL CHECK(design_revision > 0),
      snapshot jsonb NOT NULL, goal jsonb NOT NULL,
      status varchar(16) NOT NULL CHECK(status IN ('pending','completed','failed','interrupted')),
      result jsonb NULL, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz NULL,
      UNIQUE(attempt_id, request_id))`);
    await q.query(
      "CREATE UNIQUE INDEX challenge_submission_pending ON challenge_submissions(attempt_id) WHERE status='pending'",
    );
    await q.query(
      "CREATE INDEX challenge_attempts_learner ON challenge_attempts(learner_id, created_at DESC)",
    );
  }
  async down(q: QueryRunner) {
    await q.query("DROP TABLE challenge_submissions");
    await q.query("DROP TABLE challenge_attempts");
  }
}
