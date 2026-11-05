import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Support role and problem reports (docs/SUPPORT-SYSTEM-SCOPE.md). Additive: four new tables, and the two CHECK lists that name the
 * grantable roles gain 'support'. Nothing existing is rewritten.
 *
 * - `support_tickets.author_id` and `assignee_id` are foreign keys with ON DELETE SET NULL, so deleting an account anonymises its
 *   reports (the text stays, no name or email is kept on the report) instead of erasing them (scope D3).
 * - `support_activity` is append-only (UPDATE and DELETE are refused) and has no foreign keys, so nothing can rewrite its history,
 *   including the deletion of an account or a report (scope R6).
 * - Down refuses to run while any account holds the Support role or the audit log names it, because restoring the old CHECK would
 *   fail on that history and the history must not be edited. Remove the role from every account first.
 */
export class Support1794700000000 implements MigrationInterface {
  name = "Support1794700000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE user_roles DROP CONSTRAINT user_roles_role_check");
    await q.query("ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check CHECK (role IN ('instructor','reviewer','support','admin'))");
    await q.query("ALTER TABLE role_audit DROP CONSTRAINT role_audit_role_check");
    await q.query("ALTER TABLE role_audit ADD CONSTRAINT role_audit_role_check CHECK (role IN ('instructor','reviewer','support','admin'))");

    await q.query(`CREATE TABLE support_tickets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ref integer GENERATED ALWAYS AS IDENTITY (START WITH 1001) NOT NULL UNIQUE,
      author_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
      category varchar(16) NOT NULL CHECK (category IN ('bug','wrong_result','account','performance','idea','other')),
      title varchar(120) NOT NULL CHECK (char_length(title) >= 3),
      body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 4000),
      expected text NULL CHECK (expected IS NULL OR char_length(expected) <= 2000),
      context jsonb NOT NULL CHECK (jsonb_typeof(context) = 'object'),
      status varchar(12) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting','resolved')),
      priority varchar(8) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
      assignee_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      last_user_activity_at timestamptz NOT NULL,
      resolved_at timestamptz NULL,
      first_response_at timestamptz NULL,
      CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)))`);
    await q.query("CREATE INDEX support_tickets_created ON support_tickets(created_at DESC, id DESC)");
    await q.query("CREATE INDEX support_tickets_status ON support_tickets(status, created_at DESC)");
    await q.query("CREATE INDEX support_tickets_author ON support_tickets(author_id, created_at DESC)");
    await q.query("CREATE INDEX support_tickets_assignee ON support_tickets(assignee_id) WHERE assignee_id IS NOT NULL");

    await q.query(`CREATE TABLE support_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      seq bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
      ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      author_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
      author_kind varchar(8) NOT NULL CHECK (author_kind IN ('user','support')),
      internal boolean NOT NULL DEFAULT false,
      body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
      created_at timestamptz NOT NULL,
      CHECK (NOT internal OR author_kind = 'support'))`);
    await q.query("CREATE INDEX support_messages_ticket ON support_messages(ticket_id, seq)");

    await q.query(`CREATE TABLE support_reads (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      read_at timestamptz NOT NULL,
      PRIMARY KEY (user_id, ticket_id))`);

    await q.query(`CREATE TABLE support_activity (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      seq bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
      at timestamptz NOT NULL,
      ticket_id uuid NOT NULL,
      ticket_ref integer NOT NULL,
      action varchar(12) NOT NULL CHECK (action IN ('create','reply','note','status','priority','assign','reopen')),
      actor_kind varchar(8) NOT NULL CHECK (actor_kind IN ('user','support')),
      actor_id uuid NULL,
      actor_email varchar(254) NOT NULL,
      from_value varchar(40) NULL,
      to_value varchar(40) NULL)`);
    await q.query("CREATE INDEX support_activity_ticket ON support_activity(ticket_id, seq)");
    await q.query(`CREATE FUNCTION support_activity_append_only() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'support_activity is append-only'; END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER support_activity_no_change BEFORE UPDATE OR DELETE ON support_activity
      FOR EACH ROW EXECUTE FUNCTION support_activity_append_only()`);
  }

  async down(q: QueryRunner): Promise<void> {
    const [{ held }] = (await q.query(
      "SELECT (SELECT count(*) FROM user_roles WHERE role = 'support') + (SELECT count(*) FROM role_audit WHERE role = 'support') AS held",
    )) as Array<{ held: string }>;
    if (Number(held) > 0) throw new Error("Cannot undo Support: accounts hold the support role or the audit log names it. Revoke the role from every account first; the audit history is never edited.");
    await q.query("DROP TRIGGER IF EXISTS support_activity_no_change ON support_activity");
    await q.query("DROP FUNCTION IF EXISTS support_activity_append_only()");
    await q.query("DROP TABLE support_activity");
    await q.query("DROP TABLE support_reads");
    await q.query("DROP TABLE support_messages");
    await q.query("DROP TABLE support_tickets");
    await q.query("ALTER TABLE role_audit DROP CONSTRAINT role_audit_role_check");
    await q.query("ALTER TABLE role_audit ADD CONSTRAINT role_audit_role_check CHECK (role IN ('instructor','reviewer','admin'))");
    await q.query("ALTER TABLE user_roles DROP CONSTRAINT user_roles_role_check");
    await q.query("ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check CHECK (role IN ('instructor','reviewer','admin'))");
  }
}
