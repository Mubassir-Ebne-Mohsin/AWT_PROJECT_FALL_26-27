import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * P4 account deletion. A challenge other people have attempted, and the feedback an Instructor gave on those attempts,
 * must outlive the Instructor's account. Feedback loses its author (NULL) instead of being deleted with the account.
 * A challenge may lose its owner too, but only because the account service detaches it first; the foreign key keeps
 * CASCADE so that deleting a user directly still removes the challenges they own, as before.
 * Down fails on purpose if any ownerless rows exist; it never deletes data to make a constraint fit.
 */
export class AccountSelfService1794400000000 implements MigrationInterface {
  name = "AccountSelfService1794400000000";

  private async relink(q: QueryRunner, table: string, onDelete: "SET NULL" | "CASCADE", nullable: boolean) {
    await q.query(`DO $$ DECLARE c text; BEGIN
      SELECT conname INTO c FROM pg_constraint WHERE conrelid = '${table}'::regclass AND contype = 'f' AND confrelid = 'users'::regclass;
      IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE ${table} DROP CONSTRAINT %I', c); END IF;
    END $$`);
    await q.query(`ALTER TABLE ${table} ALTER COLUMN instructor_id ${nullable ? "DROP" : "SET"} NOT NULL`);
    await q.query(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_instructor_fk FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE ${onDelete}`);
  }

  async up(q: QueryRunner) {
    await q.query("ALTER TABLE challenges ALTER COLUMN instructor_id DROP NOT NULL");
    await this.relink(q, "challenge_feedback", "SET NULL", true);
  }

  async down(q: QueryRunner) {
    await this.relink(q, "challenge_feedback", "CASCADE", false);
    await q.query("ALTER TABLE challenges ALTER COLUMN instructor_id SET NOT NULL");
  }
}
