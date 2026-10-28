import { MigrationInterface, QueryRunner } from "typeorm";
export class AiFoundation1793200000000 implements MigrationInterface {
  name = "AiFoundation1793200000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE design_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), design_id uuid NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
      revision integer NOT NULL CHECK(revision>0), origin varchar(16) NOT NULL CHECK(origin IN ('baseline','create','edit')),
      snapshot jsonb NOT NULL, created_at timestamptz NOT NULL, UNIQUE(design_id,revision))`);
    await q.query(`INSERT INTO design_versions(design_id,revision,origin,created_at,snapshot)
      SELECT id,revision,'baseline',updated_at,jsonb_build_object(
      'id',id,'name',name,'description',description,'source',source,'templateId',template_id,
      'schemaVersion',schema_version,'graph',graph,'traffic',traffic,'revision',revision,
      'createdAt',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'updatedAt',to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) FROM designs`);
    await q.query(`CREATE TABLE ai_jobs (
      id uuid PRIMARY KEY, design_id uuid NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
      version_id uuid NOT NULL REFERENCES design_versions(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
      request_id uuid NOT NULL, status varchar(16) NOT NULL CHECK(status IN ('pending','completed','failed','cancelled','interrupted')),
      payload jsonb NOT NULL, facts jsonb NOT NULL, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
      UNIQUE(design_id,request_id))`);
    await q.query(
      "CREATE UNIQUE INDEX ai_jobs_one_pending ON ai_jobs ((true)) WHERE status='pending'",
    );
    await q.query("CREATE INDEX ai_jobs_expiry ON ai_jobs(expires_at)");
    await q.query("CREATE INDEX ai_jobs_version ON ai_jobs(version_id)");
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP TABLE ai_jobs");
    await q.query("DROP TABLE design_versions");
  }
}
