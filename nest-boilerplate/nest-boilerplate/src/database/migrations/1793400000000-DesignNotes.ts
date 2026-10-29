import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * M15.3 Notes. A note belongs to one design (deleted with it) and records the revision it was written for as
 * a plain number, not a foreign key, so it survives version pruning. No existing table is changed.
 */
export class DesignNotes1793400000000 implements MigrationInterface {
  name = "DesignNotes1793400000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE design_notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      design_id uuid NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
      revision integer NOT NULL CHECK(revision > 0),
      kind varchar(16) NOT NULL CHECK(kind IN ('decision','assumption')),
      text text NOT NULL CHECK(char_length(text) BETWEEN 1 AND 2000),
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL)`);
    await q.query("CREATE INDEX design_notes_design ON design_notes(design_id, created_at DESC)");
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP TABLE design_notes");
  }
}
