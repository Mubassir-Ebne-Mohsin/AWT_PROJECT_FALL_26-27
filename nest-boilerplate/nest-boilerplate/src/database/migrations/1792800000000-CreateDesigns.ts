import { MigrationInterface, QueryRunner } from "typeorm";
export class CreateDesigns1792800000000 implements MigrationInterface {
  name = "CreateDesigns1792800000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE designs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name varchar(100) NOT NULL, description text NOT NULL, source varchar(16) NOT NULL,
      template_id varchar(40), schema_version integer NOT NULL CHECK(schema_version=1),
      graph jsonb NOT NULL, traffic jsonb NOT NULL, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK(source IN ('blank','template','import','scripted'))
    )`);
    await q.query(
      "CREATE INDEX ix_designs_owner_updated ON designs(owner_id,updated_at DESC)",
    );
    await q.query(`CREATE TABLE design_runs (
      id uuid PRIMARY KEY, design_id uuid NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
      request_id uuid NOT NULL, status varchar(16) NOT NULL CHECK(status IN ('pending','completed','failed')),
      created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, payload jsonb NOT NULL,
      CONSTRAINT uq_design_run_request UNIQUE(design_id,request_id)
    )`);
    await q.query(
      "CREATE INDEX ix_runs_design_created ON design_runs(design_id,created_at DESC)",
    );
    await q.query(
      "CREATE INDEX ix_runs_pending ON design_runs(created_at) WHERE status='pending'",
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP TABLE design_runs");
    await q.query("DROP TABLE designs");
  }
}
