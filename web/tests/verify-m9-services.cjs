// Explicitly opt in; dedicated audit containers, ports and the audit API process are checked before stopping anything.
// SF_M9_REAL_OUTAGES=1 node tests/verify-m9-services.cjs
const assert = require("node:assert/strict"),
  { execFileSync, spawn } = require("node:child_process"),
  { chromium, expect } = require("@playwright/test");
const docker = "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
  api = "http://localhost:5003/v1",
  web = "http://localhost:3003",
  names = ["stressforge-m9-postgres", "stressforge-m9-redis"];
const command = (...args) => execFileSync(docker, args, { encoding: "utf8", windowsHide: true }).trim();
const ps = (script) => execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8", windowsHide: true }).trim();
async function health(status, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(api + "/health", { signal: AbortSignal.timeout(4000) })).status === status) return;
    } catch {
      if (status === 0) return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error("Health did not become " + status);
}
/** Identify (and check) only the compiled audit API listening on 5003 before anything is stopped. */
function auditApiPid() {
  const pid = ps("(Get-NetTCPConnection -LocalPort 5003 -State Listen).OwningProcess | Select-Object -First 1");
  const line = ps(`(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`);
  assert.match(line, /docs[\\/]audit[\\/]m9-api\.cjs/, "5003 is not the instrumented M9 API");
  return pid;
}
// Only taskkill runs at the critical moment; the slow identity check happened beforehand.
const killPid = (pid) => process.kill(Number(pid), "SIGKILL");
function startAuditApi() {
  // Fixed audit bootstrap with explicit disposable configuration, never a normal server.
  // Its output goes to a temp log so a failed start is diagnosable.
  const log = require("node:fs").openSync(require("node:path").join(require("node:os").tmpdir(), "m9-api-restart.log"), "a");
  const child=spawn(process.execPath, [require("node:path").resolve(__dirname,"../../docs/audit/m9-api.cjs")], {cwd:require("node:path").join(require("node:os").tmpdir(),"stressforge-m9-work/nest-boilerplate/nest-boilerplate"),detached:true,stdio:["ignore",log,log],windowsHide:true});child.on("error",e=>console.error("Audit restart failed",e.code));child.unref();console.log("M9 audit restart requested");
}
const statusLine = (page) => page.locator(".m8-live [role=status]");

(async () => {
  if (process.env.SF_M9_REAL_OUTAGES !== "1") throw Error("Set SF_M9_REAL_OUTAGES=1 for dedicated M9 audit services only.");

  for (const n of names) assert.equal(command("inspect", "--format", '{{index .Config.Labels "stressforge.audit"}}', n), "m9");
  assert.match(command("port", names[0], "5432"), /:5552/);
  assert.match(command("port", names[1], "6379"), /:6399/);
  const browser = await chromium.launch({ channel: "chrome", headless: true }),
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const evidence = {};
  // SF_M9_DEBUG=1: log design writes and reads (revisions only; no tokens or bodies beyond the revision).
  if (process.env.SF_M9_DEBUG === "1")
    page.on("response", async (r) => {
      const m = r.request().method();
      if (!/\/designs\/[0-9a-f-]{36}$/.test(r.url()) || !["PATCH", "GET"].includes(m)) return;
      const sent = m === "PATCH" ? r.request().postDataJSON()?.expectedRevision : undefined;
      const body = await r.json().catch(() => null);
      console.error(new Date().toISOString().slice(11, 23), m, r.status(), "sent", sent, "got", body?.data?.revision ?? body?.error?.code);
    });
  try {
    await health(200);
    await page.goto(web + "/register");
    await page.getByLabel("Name", { exact: true }).fill("M9 Outages");
    await page.getByLabel("Email", { exact: true }).fill("m9-outage-" + Date.now() + "@example.test");
    await page.getByLabel("Password", { exact: true }).fill("M9-Outage-2026!");
    await page.locator("#reg-terms").check();
    const reg = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    const headers = { Authorization: "Bearer " + (await (await reg).json()).data.accessToken };
    await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
    await page.goto(web + "/new/template");
    await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
    await page.waitForURL(/\/designs\/[0-9a-f-]{36}\/edit/);
    const id =new URL(page.url()).pathname.split("/")[2];
    await page.getByRole("button", { name: "Load (L)" }).click();
    await expect(page.getByText("Live preview — unsaved inputs").first()).toBeVisible({ timeout: 15000 });
    const slider = page.getByLabel("Traffic", { exact: true });
    const saved = () => expect(page.getByRole("status").filter({ hasText: /^Saved ·/ })).toBeVisible({ timeout: 30000 });

    // Postgres and Redis outages: the draft stays, preview fails inline (or keeps working), nothing resubmits.
    for (const [index, key] of [[0, "postgres"], [1, "redis"]]) {
      command("stop", names[index]);
      await health(503);
      await slider.focus();
      await page.keyboard.press("PageUp");
      const drafted = await slider.inputValue();
      // PostgreSQL: the save fails with 503 (a stopped container can hold the DB connect until its timeout).
      // Redis-dependent requests now fail promptly; preserve and explicitly retry the draft.
      const observed = key === "postgres"
        ? page.getByRole("status").filter({ hasText: /Save failed/ })
        : page.locator(".sys-title, main [role=alert], [role=status]:has-text('Save failed')").first();
      await expect(observed).toBeVisible({ timeout: 60000 });
      evidence[key] = { health: 503, signal: (await observed.textContent())?.trim(), previewDuringOutage: (await statusLine(page).count()) ? await statusLine(page).textContent() : "workspace replaced by the unavailable state" };
      command("start", names[index]);
      await health(200);
      await expect(slider).toHaveValue(drafted, { timeout: 30000 });
      evidence[key].draftKept = true;
      const save = page.getByRole("button", { name: "Save", exact: true });
      if (await save.isEnabled()) await save.click();
      await saved();
      await expect(slider).toHaveValue(drafted);
      const retry = page.getByRole("button", { name: "Retry preview" });
      if (await retry.isVisible()) await retry.click();
      await expect(page.getByText("Live preview — unsaved inputs").first()).toBeVisible({ timeout: 15000 });
      evidence[key].recovered = true;
      evidence[key].savedAfterRecovery = (await (await page.request.get(api + "/designs/" + id, { headers })).json()).data.traffic.rps;
    }

    // API restart while a saved Limits job is pending: startup reconciliation marks it INTERRUPTED; no automatic resubmit.
    const catalog = (await (await page.request.get(api + "/simulation/catalog", { headers })).json()).data;
    const nodes = Array.from({ length: 50 }, (_, i) => ({ id: "node" + i, type: i === 0 ? "client" : "app", label: "Node " + i, x: (i % 10) * 240, y: Math.floor(i / 10) * 110, props: {} }));
    const edges = [];
    for (let a = 0; a < 50 && edges.length < 200; a++) for (let b = a + 1; b < 50 && edges.length < 200; b++) edges.push({ id: "edge" + edges.length, from: "node" + a, to: "node" + b });
    const big = (await (await page.request.post(api + "/designs", { headers, data: { schemaVersion: 1, name: "M9 restart", description: "", source: "blank", templateId: null, graph: { nodes, edges }, traffic: catalog.trafficDefaults } })).json()).data.id;
    let interrupted = null;
    for (let attempt = 1; attempt <= 3 && !interrupted; attempt++) {
      await page.goto(`${web}/designs/${big}/limits`);
      let runId;
      const pid = auditApiPid();
      await page.route("**/limits", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        const response = await route.fetch();
        killPid(pid); // immediately after acceptance, while the job is still running
        runId = (await response.json()).data.run.id;
        await route.fulfill({ response });
      });
      await page.getByRole("button", { name: "Find limits", exact: true }).click();
      await expect.poll(() => runId, { timeout: 20000 }).toBeTruthy();
      await page.unroute("**/limits");
      await health(0);
      startAuditApi();
      // One start retry: the old process can briefly keep the port after taskkill returns.
      await health(200, 60).catch(async () => { startAuditApi(); await health(200, 120); });
      const run = (await (await page.request.get(`${api}/designs/${big}/runs/${runId}`, { headers })).json()).data;
      if (run.status === "failed" && run.failure.code === "INTERRUPTED") interrupted = { attempt, runId };
      else evidence["limitsAttempt" + attempt] = "completed before the kill: " + run.status;
    }
    assert.ok(interrupted, "Limits job always finished before the API was stopped");
    await page.goto(`${web}/designs/${big}/limits?limits=${interrupted.runId}`);
    await expect(page.getByText(/INTERRUPTED:/)).toBeVisible({ timeout: 20000 });
    const runs = (await (await page.request.get(api + "/dashboard", { headers })).json()).data.recentRuns.filter((r) => r.kind === "limits");
    const find = page.getByRole("button", { name: "Find limits", exact: true });
    await expect(find).toBeEnabled();
    await find.click();
    await expect(page.getByText("Saturation order", { exact: true })).toBeVisible({ timeout: 60000 });
    evidence.limitsRestart = { ...interrupted, interruptedShown: true, noAutomaticResubmit: runs.length === interrupted.attempt, newSearchAfterRecovery: true };
    require("node:fs").writeFileSync(require("node:path").resolve(__dirname,"../../docs/audit/m9-services.json"),JSON.stringify(evidence,null,2)+"\n");
    // A fresh page restoration while the API is actually absent must show the real waking state.
    const unavailablePid=auditApiPid();killPid(unavailablePid);await health(0);
    try {
      await page.reload({waitUntil:"domcontentloaded"});
      await expect(page.locator(".sys-title")).toHaveText("Waking up the server.",{timeout:30000});
      await page.screenshot({path:require("node:path").resolve(__dirname,"../../docs/audit/m9-unreachable-1440-light.png")});
      evidence.apiUnreachable={actualApiStopped:true,wakingScreen:true};
    } finally {startAuditApi();await health(200,120);}
    await expect(page.locator(".sys-title")).toHaveCount(0,{timeout:30000});
    await expect(page.getByText("Saturation order",{exact:true})).toBeVisible({timeout:30000});
    evidence.apiUnreachable.restoredSavedLimits=true;
    require("node:fs").writeFileSync(require("node:path").resolve(__dirname,"../../docs/audit/m9-services.json"),JSON.stringify(evidence,null,2)+"\n");
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    for (const name of names) command("start", name);
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
