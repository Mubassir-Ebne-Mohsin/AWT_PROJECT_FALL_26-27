import { randomBytes, randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { dataSourceOptions } from "@/config/database.config";
import { getTemplates } from "@/modules/simulation/engine/templates";

/**
 * Demo helper for the Admin live dashboard (docs/ADMIN-DASHBOARD-SCOPE.md, item 29).
 *
 *   pnpm demo:activity          registers a few clearly named demo accounts, then, at a human pace, creates designs from the
 *                               templates, runs simulations and shares some, so the dashboard numbers visibly tick
 *   pnpm demo:activity:clean    removes exactly those accounts and everything that belongs to them
 *
 * Every account is `demo-N-<tag>@demo.stressforge.test`, so nothing here can be mistaken for a real person, and the Accounts page
 * lists them openly. Real accounts are never read or changed. The AI rows it adds are labelled provider "demo", model "demo-fake":
 * no model is called and no key is used. Development only: it refuses to run in production.
 */
const DEMO_DOMAIN = "demo.stressforge.test";
const api = (process.env.SF_API_URL ?? "http://localhost:5001/v1").replace(/\/$/, "");
const arg = (name: string, fallback: number) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const n = hit ? Number(hit.split("=")[1]) : fallback;
  return Number.isInteger(n) && n > 0 ? n : fallback;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (text: string) => console.log(text);

async function call<T>(path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<{ status: number; data: T }> {
  const res = await fetch(api + path, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...(init.token ? { authorization: "Bearer " + init.token } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T };
  return { status: res.status, data: json.data as T };
}

async function clean(db: DataSource) {
  const rows: { id: string }[] = await db.query("SELECT id FROM users WHERE email LIKE $1", [`%@${DEMO_DOMAIN}`]);
  if (rows.length === 0) return say("No demo accounts to remove.");
  const ids = rows.map((r) => r.id);
  await db.transaction(async (m) => {
    await m.query("DELETE FROM ai_task_calls WHERE owner_id = ANY($1)", [ids]);
    await m.query("DELETE FROM challenge_attempts WHERE learner_id = ANY($1)", [ids]);
    await m.query("DELETE FROM users WHERE id = ANY($1) AND email LIKE $2", [ids, `%@${DEMO_DOMAIN}`]);
  });
  say(`Removed ${ids.length} demo account${ids.length === 1 ? "" : "s"} and everything that belonged to them.`);
}

async function simulate(token: string, design: { id: string; revision: number }) {
  const started = await call<{ statusUrl: string }>(`/designs/${design.id}/simulate`, { method: "POST", token, body: { expectedRevision: design.revision, requestId: randomUUID() } });
  if (started.status !== 202) return false;
  for (let i = 0; i < 100; i++) {
    const r = await call<{ status: string }>(started.data.statusUrl.replace(/^.*\/v1/, ""), { token });
    if (r.data?.status && r.data.status !== "pending") return r.data.status === "completed";
    await sleep(100);
  }
  return false;
}

async function activity(db: DataSource) {
  const people = Math.min(arg("accounts", 4), 8);
  const rounds = arg("rounds", 20);
  const pace = arg("pace-ms", 3000);
  const templates = getTemplates();
  const accounts: { id: string; token: string }[] = [];
  const stamp = Date.now().toString(36);
  for (let i = 1; i <= people; i++) {
    const email = `demo-${i}-${stamp}@${DEMO_DOMAIN}`;
    const res = await call<{ user: { id: string }; accessToken: string }>("/auth/register", {
      method: "POST",
      body: { email, password: randomBytes(12).toString("base64url") + "aA1!", displayName: `Demo person ${i}` },
    });
    if (res.status !== 201) throw new Error(`Could not register a demo account (HTTP ${res.status}). Is the API running at ${api}?`);
    accounts.push({ id: res.data.user.id, token: res.data.accessToken });
    say(`Registered ${email}`);
    await sleep(pace / 2);
  }
  for (let round = 1; round <= rounds; round++) {
    const who = accounts[round % accounts.length];
    const t = templates[round % templates.length];
    const made = await call<{ id: string; revision: number }>("/designs", {
      method: "POST",
      token: who.token,
      body: { schemaVersion: 1, name: `${t.name} (demo ${round})`, description: "Demo activity. Safe to delete.", source: "template", templateId: t.id, graph: t.graph, traffic: t.traffic },
    });
    if (made.status !== 201) {
      say(`Round ${round}: could not create a design (HTTP ${made.status}).`);
      continue;
    }
    const ran = await simulate(who.token, made.data);
    if (round % 3 === 0) await call(`/designs/${made.data.id}/shares`, { method: "POST", token: who.token, body: { scope: "design" } });
    if (round % 2 === 0) {
      const outcome = round % 8 === 0 ? "PROVIDER_RATE_LIMITED" : round % 6 === 0 ? "INVALID_OUTPUT" : "completed";
      await db.query(
        `INSERT INTO ai_task_calls (id, owner_id, task, provider, model, outcome, total_tokens, latency_ms, input_length, input_hash, created_at)
         VALUES ($1,$2,$3,'demo','demo-fake',$4,$5,$6,40,$7,now())`,
        [randomUUID(), who.id, ["describe", "whatif", "fixes"][round % 3], outcome, outcome === "completed" ? 400 + round * 7 : null, outcome === "completed" ? 300 + round * 11 : null, randomBytes(32).toString("hex")],
      );
    }
    say(`Round ${round}/${rounds}: design "${t.name}" ${ran ? "simulated" : "created (simulation did not finish)"}${round % 3 === 0 ? ", shared" : ""}`);
    await sleep(pace);
  }
  say(`Done. Remove everything with: pnpm demo:activity:clean`);
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo activity is for development only and will not run in production.");
  const db = new DataSource(dataSourceOptions);
  await db.initialize();
  try {
    if (process.argv.includes("--clean")) await clean(db);
    else await activity(db);
  } finally {
    await db.destroy();
  }
}

main().catch((error: { message?: string }) => {
  console.error(`Not done: ${error.message ?? error}`);
  process.exit(1);
});
