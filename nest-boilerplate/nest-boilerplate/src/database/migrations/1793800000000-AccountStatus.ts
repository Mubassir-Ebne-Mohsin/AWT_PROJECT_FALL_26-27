import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * R2 Admin tools. Additive: two columns on `users` (account status, and the moment all earlier sessions stopped being
 * valid), and the audit table learns two new actions. Suspension keeps every row; nothing is deleted.
 * `role_audit.role` becomes nullable because suspend and restore are not about a role. The append-only trigger from
 * R1 is untouched, and existing audit rows keep their meaning.
 */
export class AccountStatus1793800000000 implements MigrationInterface {
  name = "AccountStatus1793800000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE users ADD COLUMN account_status varchar(12) NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','suspended'))");
    await q.query("ALTER TABLE users ADD COLUMN sessions_revoked_at timestamptz NULL");
    await q.query("ALTER TABLE role_audit DROP CONSTRAINT IF EXISTS role_audit_action_check");
    await q.query("ALTER TABLE role_audit ADD CONSTRAINT role_audit_action_check CHECK (action IN ('grant','revoke','bootstrap','suspend','restore'))");
    await q.query("ALTER TABLE role_audit ALTER COLUMN role DROP NOT NULL");
  }
  async down(q: QueryRunner): Promise<void> {
    // Suspend and restore rows have no role, so they cannot survive the older shape. Rolling back is for a
    // development database only; the append-only trigger is lifted for this one statement.
    await q.query("ALTER TABLE role_audit DISABLE TRIGGER role_audit_no_change");
    await q.query("DELETE FROM role_audit WHERE action IN ('suspend','restore')");
    await q.query("ALTER TABLE role_audit ENABLE TRIGGER role_audit_no_change");
    await q.query("ALTER TABLE role_audit ALTER COLUMN role SET NOT NULL");
    await q.query("ALTER TABLE role_audit DROP CONSTRAINT IF EXISTS role_audit_action_check");
    await q.query("ALTER TABLE role_audit ADD CONSTRAINT role_audit_action_check CHECK (action IN ('grant','revoke','bootstrap'))");
    await q.query("ALTER TABLE users DROP COLUMN sessions_revoked_at");
    await q.query("ALTER TABLE users DROP COLUMN account_status");
  }
}
