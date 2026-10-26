// Explicitly opt in; dedicated audit containers and ports are checked before stopping anything.
const assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process"),
  { chromium, expect } = require("@playwright/test"),
  { createInterface } = require("node:readline");
const docker = "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
  api = "http://localhost:5003/v1",
  names = ["stressforge-m7-postgres", "stressforge-m7-redis"];
const command = (...args) =>
  execFileSync(docker, args, { encoding: "utf8", windowsHide: true }).trim();
async function health(status) {
  for (let i = 0; i < 50; i++) {
    try {
      if (
        (await fetch(api + "/health", { signal: AbortSignal.timeout(4000) }))
          .status === status
      )
        return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw Error("Health did not become " + status);
}
(async () => {
  if (process.env.SF_M7_REAL_OUTAGES !== "1")
    throw Error(
      "Set SF_M7_REAL_OUTAGES=1 for dedicated M7 audit services only.",
    );
  for (const n of names)
    assert.equal(
      command(
        "inspect",
        "--format",
        '{{index .Config.Labels "stressforge.audit"}}',
        n,
      ),
      "m7",
    );
  assert.match(command("port", names[0], "5432"), /:5550/);
  assert.match(command("port", names[1], "6379"), /:6397/);
  const browser = await chromium.launch({ channel: "chrome", headless: true }),
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const input = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  const next = () => new Promise((r) => input.once("line", r));
  const saved = () =>
    expect(
      page.getByRole("status").filter({ hasText: /^Saved ·/ }),
    ).toBeVisible();
  try {
    await health(200);
    await page.goto("http://localhost:3003/register");
    await page.getByLabel("Name", { exact: true }).fill("M7 Outages");
    await page
      .getByLabel("Email", { exact: true })
      .fill("m7-outage-" + Date.now() + "@example.test");
    await page.getByLabel("Password", { exact: true }).fill("M7-Outage-2026!");
    await page.locator("#reg-terms").check();
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Account menu", exact: true }),
    ).toBeVisible();
    await page.goto("http://localhost:3003/new/template");
    await page
      .getByRole("button", { name: "Use Single-server MVP", exact: true })
      .click();
    await page.getByRole("link", { name: "Traffic", exact: true }).click();
    await expect(
      page.getByLabel("Average requests per second", { exact: true }),
    ).toBeVisible();
    command("stop", names[0]);
    await health(503);
    await page
      .getByLabel("Average requests per second", { exact: true })
      .fill("875");
    await expect(
      page.getByRole("status").filter({ hasText: /Save failed/ }),
    ).toBeVisible({ timeout: 25000 });
    await expect(
      page.getByRole("button", { name: "Undo", exact: true }),
    ).toBeEnabled();
    command("start", names[0]);
    await health(200);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await saved();
    await expect(
      page.getByLabel("Average requests per second", { exact: true }),
    ).toHaveValue("875");
    command("stop", names[1]);
    await health(503);
    await page.getByLabel("Burst multiplier", { exact: true }).fill("2.5");
    await page.waitForFunction(
      () =>
        document.querySelector(".sys-title") ||
        document.querySelector("main [role=alert]"),
      undefined,
      { timeout: 25000 },
    );
    command("start", names[1]);
    await health(200);
    await expect(
      page.getByLabel("Burst multiplier", { exact: true }),
    ).toHaveValue("2.5", { timeout: 30000 });
    const save = page.getByRole("button", { name: "Save", exact: true });
    if (await save.isEnabled()) await save.click();
    await saved();
    console.log("READY_TO_STOP_M7_AUDIT_API");
    await next();
    await page.getByLabel("p95 target", { exact: true }).fill("450");
    await page.locator(".sys-title").waitFor({ timeout: 25000 });
    await page.screenshot({ path: "../docs/audit/m7-api-unreachable.png" });
    console.log("M7_API_UNREACHABLE_OBSERVED");
    await next();
    await health(200);
    await expect(page.getByLabel("p95 target", { exact: true })).toHaveValue(
      "450",
      { timeout: 30000 },
    );
    if (await save.isEnabled()) await save.click();
    await saved();
    await expect(
      page.getByRole("button", { name: "Undo", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(
      page.getByLabel("p95 target", { exact: true }),
    ).not.toHaveValue("450");
    await saved();
    await page.getByRole("button", { name: "Run test", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Model results", exact: true }),
    ).toBeVisible();
    console.log(
      JSON.stringify({
        postgresHealthDown: 503,
        redisHealthDown: 503,
        recoveredHealth: 200,
        apiUnreachableState: true,
        trafficRetained: true,
        historyRetained: true,
        undoRecovered: true,
        runAfterRecovery: true,
      }),
    );
  } finally {
    for (const name of names) command("start", name);
    input.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
