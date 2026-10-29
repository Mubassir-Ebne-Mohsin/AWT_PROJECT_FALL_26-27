import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * M16.2 Read-only share links. One additive table; no existing table is changed. A link belongs to one design
 * (deleted with it) and stores only a hash of its secret plus the frozen document it exposes.
 */
export class DesignShares1793600000000 implements MigrationInterface {
  name = "DesignShares1793600000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE design_shares (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      design_id uuid NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
      token_hash varchar(64) NOT NULL CHECK(char_length(token_hash) = 64),
      scope varchar(16) NOT NULL CHECK(scope IN ('design','design_report')),
      revision integer NOT NULL CHECK(revision > 0),
      run_id uuid NULL,
      include_decisions boolean NOT NULL DEFAULT false,
      report jsonb NOT NULL,
      created_at timestamptz NOT NULL,
      expires_at timestamptz NULL,
      revoked_at timestamptz NULL,
      last_opened_at timestamptz NULL,
      open_count integer NOT NULL DEFAULT 0 CHECK(open_count >= 0))`);
    await q.query("CREATE UNIQUE INDEX design_shares_token ON design_shares(token_hash)");
    await q.query("CREATE INDEX design_shares_design ON design_shares(design_id, created_at DESC)");
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP TABLE design_shares");
  }
}
