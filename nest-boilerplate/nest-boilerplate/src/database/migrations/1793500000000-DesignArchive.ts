import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * M15.5 Archive hides a design from the default list without deleting anything. The column is nullable, every
 * existing design stays active (NULL), and archiving never changes revision, versions, runs or notes.
 */
export class DesignArchive1793500000000 implements MigrationInterface {
  name = "DesignArchive1793500000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE designs ADD COLUMN archived_at timestamptz NULL");
    await q.query("CREATE INDEX designs_owner_archived ON designs(owner_id, archived_at)");
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP INDEX IF EXISTS designs_owner_archived");
    await q.query("ALTER TABLE designs DROP COLUMN archived_at");
  }
}
