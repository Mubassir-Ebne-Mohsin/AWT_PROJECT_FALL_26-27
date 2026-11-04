import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Component-anchored notes (docs/COMPONENT-NOTES-SCOPE.md). A note may name the component it is about. The id is a plain value,
 * not a foreign key: components live inside the design's graph document, and a note must outlive the component's deletion.
 * Existing notes are unchanged (the new column is NULL for them). Down removes only the column, which loses the pins and no text.
 */
export class NoteComponent1794600000000 implements MigrationInterface {
  name = "NoteComponent1794600000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE design_notes ADD COLUMN component_id varchar(64) NULL");
    await q.query("CREATE INDEX design_notes_component ON design_notes(design_id, component_id) WHERE component_id IS NOT NULL");
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP INDEX IF EXISTS design_notes_component");
    await q.query("ALTER TABLE design_notes DROP COLUMN component_id");
  }
}
