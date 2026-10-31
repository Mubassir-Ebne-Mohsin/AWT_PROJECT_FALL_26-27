import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * R5.1 Instructor challenges. One additive table; no existing table is changed. A challenge belongs to one Instructor
 * (deleted with the account) and stores its goal, its fixed traffic and a frozen copy of the starting graph. The CHECKs
 * keep the status and its timestamps consistent, and keep the goal inside the model's own bounds.
 */
export class Challenges1794100000000 implements MigrationInterface {
  name = "Challenges1794100000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE challenges (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      instructor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title varchar(80) NOT NULL CHECK(char_length(title) >= 1),
      summary varchar(2000) NOT NULL CHECK(char_length(summary) >= 1),
      goal_p95_ms double precision NOT NULL CHECK(goal_p95_ms >= 1 AND goal_p95_ms <= 60000),
      goal_error_rate double precision NOT NULL CHECK(goal_error_rate >= 0 AND goal_error_rate <= 1),
      traffic jsonb NOT NULL,
      starting_graph jsonb NOT NULL,
      status varchar(10) NOT NULL CHECK(status IN ('draft','published','archived')),
      baseline jsonb NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      published_at timestamptz NULL,
      archived_at timestamptz NULL,
      CHECK((status = 'draft' AND published_at IS NULL AND archived_at IS NULL)
         OR (status = 'published' AND published_at IS NOT NULL AND archived_at IS NULL)
         OR (status = 'archived' AND archived_at IS NOT NULL)))`);
    await q.query("CREATE INDEX challenges_instructor ON challenges(instructor_id, updated_at DESC)");
    await q.query("CREATE INDEX challenges_published ON challenges(published_at DESC) WHERE status = 'published'");
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP TABLE challenges");
  }
}
