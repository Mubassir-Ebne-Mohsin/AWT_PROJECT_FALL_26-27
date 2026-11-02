import { randomUUID, createHash } from "node:crypto";
import { DataSource } from "typeorm";
import { dataSourceOptions } from "@/config/database.config";
import { CreateUsers1761000000000 } from "@/database/migrations/1761000000000-CreateUsers";
import { CreateDesigns1792800000000 } from "@/database/migrations/1792800000000-CreateDesigns";
import { AiDesignSource1794500000000 } from "@/database/migrations/1794500000000-AiDesignSource";
import { getTemplates } from "@/modules/simulation/engine/templates";

// The Copilot migration, on a throwaway database holding only the tables it touches: the new design source, the task-call log,
// the cascade, and a down migration that refuses to destroy a person's design.
describe("AI Copilot migration", () => {
  let admin: DataSource, db: DataSource, name: string;
  const user = randomUUID();
  const mvp = getTemplates().find((t) => t.id === "mvp")!;
  const design = (source: string) =>
    db.query("INSERT INTO designs(id,owner_id,name,description,source,template_id,schema_version,graph,traffic,revision) VALUES($1,$2,'d','x',$3,NULL,1,$4,$5,1)", [randomUUID(), user, source, JSON.stringify(mvp.graph), JSON.stringify(mvp.traffic)]);
  const call = (over: Record<string, unknown> = {}) => {
    const row = { task: "describe", tokens: 80, length: 12, hash: createHash("sha256").update("x").digest("hex"), ...over };
    return db.query(
      "INSERT INTO ai_task_calls(owner_id,task,provider,model,outcome,total_tokens,input_length,input_hash) VALUES($1,$2,'groq','openai/gpt-oss-20b','completed',$3,$4,$5)",
      [user, row.task, row.tokens, row.length, row.hash],
    );
  };
  const rejected = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return String((e as Error).message);
    }
    throw new Error("expected the database to refuse");
  };

  beforeAll(async () => {
    if (dataSourceOptions.type !== "postgres") throw new Error("These checks require PostgreSQL");
    name = "sf_copilot_migration_" + randomUUID().replaceAll("-", "").slice(0, 12);
    admin = new DataSource({ ...dataSourceOptions, type: "postgres" as const, database: "postgres" });
    await admin.initialize();
    await admin.query(`CREATE DATABASE "${name}"`);
    db = new DataSource({ ...dataSourceOptions, type: "postgres" as const, database: name, migrations: [CreateUsers1761000000000, CreateDesigns1792800000000, AiDesignSource1794500000000] });
    await db.initialize();
    await db.runMigrations();
    await db.query("INSERT INTO users(id,email,password_hash,display_name,role) VALUES($1,$2,'test-only-not-a-real-hash','Copilot','user')", [user, user + "@example.test"]);
  });
  afterAll(async () => {
    await db?.destroy();
    await admin?.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin?.destroy();
  });

  it("accepts the new design source and still accepts the old ones, but nothing else", async () => {
    for (const source of ["blank", "template", "import", "scripted", "ai"]) await design(source);
    expect(await rejected(design("robot"))).toMatch(/designs_source_check|check constraint/i);
  });

  it("keeps exactly one source constraint, with the five values", async () => {
    const rows = await db.query("SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'designs'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%scripted%'");
    expect(rows).toHaveLength(1);
    expect(rows[0].conname).toBe("designs_source_check");
    expect(rows[0].def).toContain("'ai'");
  });

  it("stores a task call and refuses malformed ones", async () => {
    await call();
    const rows = await db.query("SELECT * FROM ai_task_calls");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ task: "describe", provider: "groq", total_tokens: 80, input_length: 12 });
    expect(rows[0].created_at).toBeInstanceOf(Date);
    expect(await rejected(call({ task: "chat" }))).toMatch(/check/i);
    expect(await rejected(call({ tokens: -1 }))).toMatch(/check/i);
    expect(await rejected(call({ length: -1 }))).toMatch(/check/i);
    expect(await rejected(call({ hash: "abc" }))).toMatch(/check/i);
    expect(await rejected(call({ hash: "G".repeat(64) }))).toMatch(/check/i);
  });

  it("removes a person's task calls when the account is deleted", async () => {
    const other = randomUUID();
    await db.query("INSERT INTO users(id,email,password_hash,display_name,role) VALUES($1,$2,'test-only-not-a-real-hash','Other','user')", [other, other + "@example.test"]);
    await db.query("INSERT INTO ai_task_calls(owner_id,task,provider,model,outcome,input_length,input_hash) VALUES($1,'whatif','groq','m','completed',3,$2)", [other, "a".repeat(64)]);
    await db.query("DELETE FROM users WHERE id=$1", [other]);
    expect(await db.query("SELECT 1 FROM ai_task_calls WHERE owner_id=$1", [other])).toHaveLength(0);
  });

  it("will not go down while a design made by the Copilot exists, and changes nothing when it refuses", async () => {
    expect(await rejected(db.undoLastMigration())).toMatch(/will not delete or relabel/);
    expect((await db.query("SELECT 1 FROM designs WHERE source='ai'")).length).toBeGreaterThan(0);
    expect((await db.query("SELECT 1 FROM ai_task_calls")).length).toBeGreaterThan(0);
  });

  it("goes down cleanly once no such design exists: the old constraint returns and the log table is gone", async () => {
    await db.query("DELETE FROM designs WHERE source='ai'");
    await db.undoLastMigration();
    expect(await rejected(design("ai"))).toMatch(/check/i);
    await expect(design("scripted")).resolves.toBeDefined();
    expect(await db.query("SELECT to_regclass('ai_task_calls') AS t")).toEqual([{ t: null }]);
    await db.runMigrations();
    await expect(design("ai")).resolves.toBeDefined();
  });
});
