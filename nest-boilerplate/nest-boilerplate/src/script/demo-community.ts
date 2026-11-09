import { randomBytes, randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { dataSourceOptions } from "@/config/database.config";
import { getTemplates } from "@/modules/simulation/engine/templates";

/**
 * Demo helper for the community gallery.
 *
 *   pnpm demo:community          registers three clearly named demo accounts, then publishes each of the six templates twice (as it comes,
 *                                and at a quiet-hours load so it passes), after running a test on each, so the gallery is never empty at a demonstration
 *   pnpm demo:community:clean    removes exactly those accounts; their designs and posts go with them
 *
 * Accounts are `demo-community-<n>-<tag>@demo.stressforge.test`, so nothing here can be mistaken for a real person.
 * Real accounts are never read or changed. Development only: it refuses to run in production.
 * Each account publishes four designs (the daily limit is five).
 */
const DEMO_DOMAIN = "demo.stressforge.test";
const api = (process.env.SF_API_URL ?? "http://localhost:5001/v1").replace(/\/$/, "");
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

async function simulate(token: string, design: { id: string; revision: number }) {
  const started = await call<{ statusUrl: string }>(`/designs/${design.id}/simulate`, {
    method: "POST",
    token,
    body: { expectedRevision: design.revision, requestId: randomUUID() },
  });
  if (started.status !== 202) return false;
  for (let i = 0; i < 100; i++) {
    const r = await call<{ status: string }>(started.data.statusUrl.replace(/^.*\/v1/, ""), { token });
    if (r.data?.status && r.data.status !== "pending") return r.data.status === "completed";
    await sleep(100);
  }
  return false;
}

async function clean(db: DataSource) {
  const rows: { id: string }[] = await db.query("SELECT id FROM users WHERE email LIKE $1", [`demo-community-%@${DEMO_DOMAIN}`]);
  if (rows.length === 0) return say("No demo community accounts to remove.");
  const ids = rows.map((r) => r.id);
  await db.query("DELETE FROM users WHERE id = ANY($1) AND email LIKE $2", [ids, `demo-community-%@${DEMO_DOMAIN}`]);
  say(`Removed ${ids.length} demo account${ids.length === 1 ? "" : "s"}; their designs and gallery posts went with them.`);
}

async function seed() {
  const templates = getTemplates();
  const stamp = Date.now().toString(36);
  const names = ["Demo builder A", "Demo builder B", "Demo builder C"];
  // Each template is published twice: as it comes, and at a quiet-hours load (a quarter of the traffic) so that, for every limiting
  // component, the gallery has a design that passes. The Improve tab's "See how others solved this" shows such passing designs.
  // Four posts per account stays under the daily limit of five.
  for (let n = 0; n < names.length; n++) {
    const email = `demo-community-${n + 1}-${stamp}@${DEMO_DOMAIN}`;
    const res = await call<{ accessToken: string }>("/auth/register", {
      method: "POST",
      body: { email, password: randomBytes(12).toString("base64url") + "aA1!", displayName: names[n] },
    });
    if (res.status !== 201) throw new Error(`Could not register a demo account (HTTP ${res.status}). Is the API running at ${api}?`);
    const token = res.data.accessToken;
    say(`Registered ${email}`);
    for (const t of templates.filter((_, i) => i % names.length === n)) {
      for (const quiet of [false, true]) {
        const traffic = quiet ? { ...t.traffic, rps: Math.max(1, Math.round(t.traffic.rps / 4)), burst: 1.1 } : t.traffic;
        const label = quiet ? `${t.name} (quiet hours)` : t.name;
        const made = await call<{ id: string; revision: number }>("/designs", {
          method: "POST",
          token,
          body: { schemaVersion: 1, name: label, description: t.blurb, source: "template", templateId: t.id, graph: t.graph, traffic },
        });
        if (made.status !== 201) {
          say(`Could not create "${label}" (HTTP ${made.status}).`);
          continue;
        }
        if (!(await simulate(token, made.data))) {
          say(`"${label}": the test did not finish, so it was not published.`);
          continue;
        }
        const post = await call(`/designs/${made.data.id}/gallery`, {
          method: "POST",
          token,
          body: { title: "Demo: " + label, description: t.blurb, allowRemix: true, confirmOwnership: true },
        });
        say(`"${label}": ${post.status === 201 ? "published" : "not published (HTTP " + post.status + ")"}`);
      }
    }
  }
  say("Done. Remove everything with: pnpm demo:community:clean");
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo data is for development only and will not run in production.");
  const db = new DataSource(dataSourceOptions);
  await db.initialize();
  try {
    if (process.argv.includes("--clean")) await clean(db);
    else await seed();
  } finally {
    await db.destroy();
  }
}

main().catch((error: { message?: string; cause?: { code?: string; message?: string } }) => {
  console.error(`Not done: ${error.message ?? error}${error.cause ? " (" + (error.cause.code ?? error.cause.message) + ")" : ""}`);
  process.exit(1);
});
