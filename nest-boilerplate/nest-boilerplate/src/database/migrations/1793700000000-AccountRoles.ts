import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * R1 Roles. Additive: two new tables and a trigger; `users` is not changed. Existing admins (the legacy
 * `users.role = 'admin'` rows) are copied into `user_roles` so both sources agree. The legacy column stays as a
 * read-through. `role_audit` is append-only (UPDATE and DELETE are refused) and has no foreign keys, so deleting an
 * account never rewrites history.
 */
export class AccountRoles1793700000000 implements MigrationInterface {
  name = "AccountRoles1793700000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE user_roles (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role varchar(16) NOT NULL CHECK(role IN ('instructor','reviewer','admin')),
      granted_by uuid NULL,
      granted_at timestamptz NOT NULL,
      PRIMARY KEY (user_id, role))`);
    await q.query("CREATE INDEX user_roles_role ON user_roles(role)");
    await q.query(`INSERT INTO user_roles(user_id, role, granted_by, granted_at)
      SELECT id, 'admin', NULL, now() FROM users WHERE role = 'admin'`);
    await q.query(`CREATE TABLE role_audit (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      at timestamptz NOT NULL,
      action varchar(16) NOT NULL CHECK(action IN ('grant','revoke','bootstrap')),
      role varchar(16) NOT NULL CHECK(role IN ('instructor','reviewer','admin')),
      actor_id uuid NULL,
      actor_email varchar(254) NOT NULL,
      target_id uuid NULL,
      target_email varchar(254) NOT NULL)`);
    await q.query("CREATE INDEX role_audit_at ON role_audit(at DESC, id DESC)");
    await q.query(`CREATE FUNCTION role_audit_append_only() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'role_audit is append-only'; END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER role_audit_no_change BEFORE UPDATE OR DELETE ON role_audit
      FOR EACH ROW EXECUTE FUNCTION role_audit_append_only()`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP TRIGGER IF EXISTS role_audit_no_change ON role_audit");
    await q.query("DROP FUNCTION IF EXISTS role_audit_append_only()");
    await q.query("DROP TABLE role_audit");
    await q.query("DROP TABLE user_roles");
  }
}
