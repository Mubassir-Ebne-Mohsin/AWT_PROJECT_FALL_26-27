import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * AI Design Copilot groundwork (docs/AI-COPILOT-SCOPE.md). Two additive changes:
 *  - a design made from a typed description by a model can be recorded honestly as source 'ai' (the old CHECK allowed four values);
 *  - ai_task_calls keeps one row per task request: who, which task, which model, how many tokens, how long, the outcome, and only
 *    the length and a SHA-256 hash of the user's text, never the text itself.
 * Down refuses to run while any 'ai' design exists: it never deletes or relabels a person's design to make a constraint fit.
 */
export class AiDesignSource1794500000000 implements MigrationInterface {
  name = "AiDesignSource1794500000000";

  private async replaceSourceCheck(q: QueryRunner, values: string) {
    await q.query(`DO $$ DECLARE c text; BEGIN
      FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'designs'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%scripted%' LOOP
        EXECUTE format('ALTER TABLE designs DROP CONSTRAINT %I', c);
      END LOOP;
    END $$`);
    await q.query(`ALTER TABLE designs ADD CONSTRAINT designs_source_check CHECK(source IN (${values}))`);
  }

  async up(q: QueryRunner) {
    await this.replaceSourceCheck(q, "'blank','template','import','scripted','ai'");
    await q.query(`CREATE TABLE ai_task_calls (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task varchar(24) NOT NULL CHECK(task IN ('describe','whatif','fixes')),
      provider varchar(16) NOT NULL,
      model varchar(80) NOT NULL,
      returned_model varchar(80),
      outcome varchar(32) NOT NULL,
      prompt_tokens integer CHECK(prompt_tokens >= 0),
      completion_tokens integer CHECK(completion_tokens >= 0),
      total_tokens integer CHECK(total_tokens >= 0),
      latency_ms integer CHECK(latency_ms >= 0),
      input_length integer NOT NULL CHECK(input_length >= 0),
      input_hash char(64) NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query("CREATE INDEX ix_ai_task_calls_owner_created ON ai_task_calls(owner_id, created_at DESC)");
  }

  async down(q: QueryRunner) {
    await q.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM designs WHERE source = 'ai') THEN
        RAISE EXCEPTION 'Designs made by the AI Copilot exist; this migration will not delete or relabel them';
      END IF;
    END $$`);
    await q.query("DROP TABLE ai_task_calls");
    await this.replaceSourceCheck(q, "'blank','template','import','scripted'");
  }
}
