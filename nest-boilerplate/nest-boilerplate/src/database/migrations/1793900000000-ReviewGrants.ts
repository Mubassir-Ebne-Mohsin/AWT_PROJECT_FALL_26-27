import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * R3 Review grants. One additive table; no existing table is changed. A grant belongs to one design and names one
 * Reviewer account; it stores the frozen document the Reviewer sees. Deleting the design or either account deletes
 * the grant. Only one active grant can exist for the same design, Reviewer and revision.
 */
export class ReviewGrants1793900000000 implements MigrationInterface {
  name = "ReviewGrants1793900000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE review_grants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      design_id uuid NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reviewer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision integer NOT NULL CHECK(revision > 0),
      run_id uuid NULL,
      report jsonb NOT NULL,
      created_at timestamptz NOT NULL,
      revoked_at timestamptz NULL,
      CHECK(owner_id <> reviewer_id))`);
    await q.query("CREATE UNIQUE INDEX review_grants_active ON review_grants(design_id, reviewer_id, revision) WHERE revoked_at IS NULL");
    await q.query("CREATE INDEX review_grants_design ON review_grants(design_id, created_at DESC)");
    await q.query("CREATE INDEX review_grants_reviewer ON review_grants(reviewer_id, created_at DESC) WHERE revoked_at IS NULL");
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP TABLE review_grants");
  }
}
