import { MigrationInterface, QueryRunner } from "typeorm";
export class SupportExtras1794900000000 implements MigrationInterface {
  name = "SupportExtras1794900000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE support_saved_replies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scope varchar(8) NOT NULL CHECK(scope IN ('personal','team')), title varchar(120) NOT NULL CHECK(char_length(title) BETWEEN 3 AND 120),
      body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 4000),
      created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds',now()), updated_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds',now()))`);
    await q.query("CREATE INDEX support_saved_replies_owner ON support_saved_replies(owner_id,scope)");
    await q.query("ALTER TABLE support_tickets ADD COLUMN merged_into_id uuid NULL REFERENCES support_tickets(id) ON DELETE SET NULL");
    await q.query("ALTER TABLE support_tickets ADD CONSTRAINT support_merge_self CHECK(merged_into_id IS NULL OR merged_into_id<>id)");
    await q.query("ALTER TABLE support_tickets ADD CONSTRAINT support_merge_resolved CHECK(merged_into_id IS NULL OR status='resolved')");
    await q.query("CREATE INDEX support_tickets_merged ON support_tickets(merged_into_id) WHERE merged_into_id IS NOT NULL");
    await q.query(`CREATE FUNCTION support_merge_guard() RETURNS trigger AS $$ BEGIN
      IF NEW.merged_into_id IS NULL THEN RETURN NEW; END IF;
      PERFORM pg_advisory_xact_lock(hashtext('sf-support-merge'));
      IF NEW.id=NEW.merged_into_id OR EXISTS(SELECT 1 FROM support_tickets WHERE id=NEW.merged_into_id AND merged_into_id IS NOT NULL)
        OR EXISTS(SELECT 1 FROM support_tickets WHERE merged_into_id=NEW.id)
      THEN RAISE EXCEPTION 'Support merge chains and cycles are forbidden' USING ERRCODE='23514'; END IF;
      RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await q.query("CREATE TRIGGER support_merge_guard BEFORE INSERT OR UPDATE OF merged_into_id ON support_tickets FOR EACH ROW EXECUTE FUNCTION support_merge_guard()");
    await q.query("ALTER TABLE support_activity DROP CONSTRAINT support_activity_action_check");
    await q.query("ALTER TABLE support_activity ADD CONSTRAINT support_activity_action_check CHECK(action IN ('create','reply','note','status','priority','assign','reopen','merge','unmerge','saved_create','saved_update','saved_delete'))");
    await q.query("ALTER TABLE support_activity ALTER COLUMN ticket_id DROP NOT NULL, ALTER COLUMN ticket_ref DROP NOT NULL");
    await q.query("ALTER TABLE support_activity ADD CONSTRAINT support_activity_ticket_required CHECK((ticket_id IS NOT NULL AND ticket_ref IS NOT NULL) OR action IN ('saved_create','saved_update','saved_delete'))");
  }
  async down(q: QueryRunner): Promise<void> {
    const [{n}] = await q.query("SELECT (SELECT count(*) FROM support_saved_replies)+(SELECT count(*) FROM support_tickets WHERE merged_into_id IS NOT NULL)+(SELECT count(*) FROM support_activity WHERE action IN ('merge','unmerge','saved_create','saved_update','saved_delete')) AS n");
    if(Number(n)>0) throw new Error("Cannot undo SupportExtras while saved replies, merges or their audit history exist");
    await q.query("ALTER TABLE support_activity DROP CONSTRAINT support_activity_ticket_required");
    await q.query("ALTER TABLE support_activity ALTER COLUMN ticket_id SET NOT NULL, ALTER COLUMN ticket_ref SET NOT NULL");
    await q.query("ALTER TABLE support_activity DROP CONSTRAINT support_activity_action_check");
    await q.query("ALTER TABLE support_activity ADD CONSTRAINT support_activity_action_check CHECK(action IN ('create','reply','note','status','priority','assign','reopen'))");
    await q.query("DROP TRIGGER support_merge_guard ON support_tickets");
    await q.query("DROP FUNCTION support_merge_guard()");
    await q.query("ALTER TABLE support_tickets DROP COLUMN merged_into_id");
    await q.query("DROP TABLE support_saved_replies");
  }
}
