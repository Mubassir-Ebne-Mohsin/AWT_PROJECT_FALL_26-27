import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * M15 Restore: a restored revision is a normal new version that remembers which revision it came from.
 * Existing rows are untouched (restored_from_revision stays NULL). No historical row is ever updated by the app.
 */
export class VersionRestore1793300000000 implements MigrationInterface {
  name = "VersionRestore1793300000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      "ALTER TABLE design_versions ADD COLUMN restored_from_revision integer NULL CHECK(restored_from_revision > 0)",
    );
    await q.query(
      "ALTER TABLE design_versions DROP CONSTRAINT IF EXISTS design_versions_origin_check",
    );
    await q.query(
      `ALTER TABLE design_versions ADD CONSTRAINT design_versions_origin_check
       CHECK(origin IN ('baseline','create','edit','restore'))`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    // Not a user undo: rollback keeps restored versions as ordinary edits so the older constraint holds.
    await q.query("UPDATE design_versions SET origin='edit' WHERE origin='restore'");
    await q.query(
      "ALTER TABLE design_versions DROP CONSTRAINT IF EXISTS design_versions_origin_check",
    );
    await q.query(
      `ALTER TABLE design_versions ADD CONSTRAINT design_versions_origin_check
       CHECK(origin IN ('baseline','create','edit'))`,
    );
    await q.query("ALTER TABLE design_versions DROP COLUMN restored_from_revision");
  }
}
