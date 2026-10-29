import { test, expect, type Page, type Route } from "@playwright/test";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

async function setup(page: Page, tag: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("M12 Explain");
  await page.getByLabel("Email", { exact: true }).fill("m12-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("M12-Explain-2026!");
  await page.locator("#reg-terms").check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { errors };
}
async function openTemplate(page: Page) {
  await page.goto("/new/template");
  await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
  await expect(page.getByLabel("Component", { exact: true })).toBeVisible();
  return new URL(page.url()).pathname.split("/")[2];
}
/** Saves a recorded run and lands on Results. Returns the design and run ids. */
async function recordRun(page: Page) {
  const accepted = page.waitForResponse((r) => r.url().endsWith("/simulate") && [200, 202].includes(r.status()));
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  const run = (await (await accepted).json()).data.run;
  await expect(page).toHaveURL(new RegExp("/results\\?run=" + run.id));
  await expect(page.getByRole("heading", { name: "Topology under load" })).toBeVisible({ timeout: 30_000 });
  return { designId: new URL(page.url()).pathname.split("/")[2], runId: run.id as string };
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
const drawer = (page: Page) => page.getByRole("complementary", { name: "Result explanation" });
const explain = (page: Page) => drawer(page).getByRole("button", { name: /^(Explain this result|Explain again)$/ });

/** A controllable stand-in for the local AI endpoints. The real server path is covered by the API e2e suite. */
function controlledAi(page: Page, ids: { designId: string; runId: string }) {
  const ai = {
    reason: "AVAILABLE" as string,
    status: "pending" as "pending" | "completed" | "cancelled" | "failed",
    dropFirstAck: false,
    holdJob: null as null | Promise<void>,
    submits: [] as { requestId: string; designId: string; expectedRevision: number; runId: string }[],
    created: false,
    summary: "The recorded run misses its latency target.",
    cancels: 0,
  };
  const jobId = "55555555-5555-4555-8555-555555555555";
  const job = () => ({
    id: jobId, designId: ids.designId, requestId: ai.submits[0]?.requestId ?? "66666666-6666-4666-8666-666666666666",
    designRevision: ai.submits[0]?.expectedRevision ?? 1, versionId: "77777777-7777-4777-8777-777777777777", runId: ids.runId,
    fingerprint: "a".repeat(64), model: "qwen2.5:1.5b", modelDigest: "b".repeat(64), promptVersion: "m12-explain-v1",
    schemaVersion: "m12-explanation-v1", status: ai.status, createdAt: new Date(Date.now() - 4000).toISOString(),
    completedAt: ai.status === "pending" ? null : new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(),
    result: ai.status === "completed" ? { summary: ai.summary, evidenceIds: ["verdict", "p95"], claims: ["latency_above_target"] } : null,
    failure: ai.status === "cancelled" ? { reason: "CANCELLED", message: "x" } : ai.status === "failed" ? { reason: "INVALID_OUTPUT", message: "x" } : null,
    experimental: true,
  });
  const evidence = () => ({
    jobId, designId: ids.designId, runId: ids.runId, designRevision: 1, fingerprint: "a".repeat(64), engineVersion: "reference-port-v1",
    structured: true,
    facts: { verdict: "fail", p95Ms: 2068.67, p95TargetMs: 300, errorRateFraction: 0.99012, errorBudgetFraction: 0.01, bottleneck: { id: "app", label: "App servers", utilizationFraction: 0.99152 } },
    evidenceIds: ["verdict", "p95", "errorRate", "bottleneck"],
    statements: ["p95 latency 2,068.67 ms is above the 300 ms target."],
    limitations: ["Mathematical model estimates, not measured infrastructure performance.", "Generated prose is experimental and can be wrong. Compare it with the verified facts."],
  });
  const ok = (route: Route, data: unknown, status = 200) => route.fulfill({ status, json: { data } });
  return {
    ai,
    async install() {
      await page.route(api + "/ai/**", async (route) => {
        const req = route.request();
        const path = new URL(req.url()).pathname.replace(/^\/v1/, "");
        if (path === "/ai/readiness") return ok(route, { enabled: ai.reason !== "DISABLED", ready: ai.reason === "AVAILABLE", model: "qwen2.5:1.5b", reason: ai.reason });
        if (path === "/ai/jobs" && req.method() === "POST") {
          const body = req.postDataJSON();
          ai.submits.push(body);
          const replay = ai.created;
          ai.created = true;
          if (ai.dropFirstAck && ai.submits.length === 1) return route.abort("failed");
          return ok(route, { job: job(), statusUrl: "/v1/ai/jobs/" + jobId }, replay ? 200 : 202);
        }
        if (path === "/ai/jobs/" + jobId + "/cancel") {
          ai.cancels++;
          ai.status = "cancelled";
          return ok(route, job());
        }
        if (path === "/ai/jobs/" + jobId + "/evidence") return ok(route, evidence());
        if (path === "/ai/jobs/" + jobId) {
          if (ai.holdJob) await ai.holdJob;
          return ok(route, job());
        }
        return route.continue();
      });
    },
  };
}

test("M12 AI is off by default: no explain UI at all, numerical Results stay fully usable", async ({ page }, info) => {
  const { errors } = await setup(page, "disabled-" + info.project.name);
  const probe = page.waitForResponse((r) => r.url().endsWith("/ai/readiness"));
  await openTemplate(page); // the editor mounting is what triggers the one readiness probe
  await recordRun(page);
  const readiness = (await (await probe).json()).data;
  expect(readiness.enabled, "this test runs against the real API with AI_ENABLED unset").toBe(false);
  await expect(page.getByRole("button", { name: "Explain this result", exact: true })).toHaveCount(0);
  await expect(page.getByText(/Local, experimental AI/)).toHaveCount(0);
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.locator(".sys-title")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Topology under load" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run test", exact: true })).toBeEnabled();
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("M12 facts stay separate from the AI interpretation, with checked statements, limits, provenance, reload recovery and no duplicate request", async ({ page }, info) => {
  await setup(page, "flow-" + info.project.name);
  const ids = { designId: "", runId: "" };
  const c = controlledAi(page, ids);
  await c.install(); // before the workspace loads: the UI shows AI only when the backend reports it enabled
  await openTemplate(page);
  Object.assign(ids, await recordRun(page));
  await page.getByRole("button", { name: "Explain this result", exact: true }).first().click();
  const facts = drawer(page).getByRole("region", { name: "Verified facts" });
  await expect(facts).toBeVisible();
  await expect(facts.getByText("Recorded run")).toBeVisible();
  await expect(drawer(page).getByRole("region", { name: "AI interpretation" })).toHaveCount(0);
  await explain(page).click();
  await expect(drawer(page).getByText(/Generating locally… running for/)).toBeVisible();
  await expect(drawer(page).getByText(/no progress estimate/)).toBeVisible();
  expect(c.ai.submits).toHaveLength(1);
  expect(c.ai.submits[0]).toMatchObject({ designId: ids.designId, runId: ids.runId, expectedRevision: 1 });
  await expect(page).toHaveURL(/explain=55555555-5555-4555-8555-555555555555/);
  expect(page.url()).toContain("run=" + ids.runId);
  c.ai.status = "completed";
  const ai = drawer(page).getByRole("region", { name: "AI interpretation" });
  await expect(ai).toBeVisible({ timeout: 15_000 });
  await expect(ai.getByText("The recorded run misses its latency target.")).toBeVisible();
  await expect(ai.getByText("Experimental · generated locally")).toBeVisible();
  await expect(ai.getByText("Verdict", { exact: true })).toBeVisible();
  await expect(ai.getByText("p95 latency 2,068.67 ms is above the 300 ms target.")).toBeVisible();
  await expect(ai.getByText(/wording written by the server/)).toBeVisible();
  await expect(ai.getByText(/not measured infrastructure performance/)).toBeVisible();
  await ai.getByText("Provenance").click();
  await expect(ai.getByText(/qwen2.5:1.5b · bbbbbbbbbbbb/)).toBeVisible();
  await expect(facts.getByText("Server evidence for this job")).toBeVisible();
  await expect(facts.getByText("2,068.67 ms")).toBeVisible();
  await expect(facts.getByText(/App servers · 99% utilization/)).toBeVisible();
  await page.reload();
  await expect(drawer(page)).toBeVisible({ timeout: 15_000 });
  await expect(drawer(page).getByRole("region", { name: "AI interpretation" })).toBeVisible({ timeout: 15_000 });
  expect(c.ai.submits, "reload recovery must not submit a second request").toHaveLength(1);
  await noOverflow(page);
});

test("M12 a lost acknowledgement retries the same request id and creates exactly one job", async ({ page }, info) => {
  await setup(page, "lost-" + info.project.name);
  const ids = { designId: "", runId: "" };
  const c = controlledAi(page, ids);
  c.ai.dropFirstAck = true;
  await c.install();
  await openTemplate(page);
  Object.assign(ids, await recordRun(page));
  await page.getByRole("button", { name: "Explain this result", exact: true }).first().click();
  await explain(page).click();
  await expect(drawer(page).getByText(/did not confirm the request/)).toBeVisible();
  await drawer(page).getByRole("button", { name: "Check the same request", exact: true }).click();
  await expect(drawer(page).getByText(/Generating locally/)).toBeVisible();
  expect(c.ai.submits).toHaveLength(2);
  expect(c.ai.submits[1].requestId).toBe(c.ai.submits[0].requestId);
});

test("M12 cancel is terminal at once while a still-resident runner keeps new generation unavailable", async ({ page }, info) => {
  await setup(page, "cancel-" + info.project.name);
  const ids = { designId: "", runId: "" };
  const c = controlledAi(page, ids);
  await c.install(); // before the workspace loads: the UI shows AI only when the backend reports it enabled
  await openTemplate(page);
  Object.assign(ids, await recordRun(page));
  await page.getByRole("button", { name: "Explain this result", exact: true }).first().click();
  await explain(page).click();
  await expect(drawer(page).getByText(/Generating locally/)).toBeVisible();
  c.ai.reason = "BUSY"; // the runner is still resident after cancel
  await drawer(page).getByRole("button", { name: "Cancel explanation", exact: true }).click();
  await expect(drawer(page).getByText(/You cancelled this explanation/)).toBeVisible();
  await expect(drawer(page).getByText(/still stopping/)).toBeVisible();
  await expect(explain(page)).toBeDisabled();
  c.ai.reason = "AVAILABLE";
  await expect(explain(page)).toBeEnabled({ timeout: 15_000 });
  expect(c.ai.cancels).toBe(1);
  await expect(page.getByRole("heading", { name: "Topology under load" })).toBeVisible();
});

test("M12 provider and API failures stay inside the panel and never replace Results", async ({ page }, info) => {
  await setup(page, "outage-" + info.project.name);
  const ids = { designId: "", runId: "" };
  const c = controlledAi(page, ids);
  await c.install(); // before the workspace loads: the UI shows AI only when the backend reports it enabled
  await openTemplate(page);
  Object.assign(ids, await recordRun(page));
  c.ai.reason = "MODEL_MISSING";
  await page.getByRole("button", { name: "Explain this result", exact: true }).first().click();
  await expect(drawer(page).getByText(/not installed/)).toBeVisible();
  c.ai.reason = "MEMORY_PRESSURE";
  await drawer(page).getByRole("button", { name: "Check again", exact: true }).click();
  await expect(drawer(page).getByText(/free memory/)).toBeVisible();
  // A real network failure of the AI endpoint must not trigger the global unreachable screen.
  await page.unroute(api + "/ai/**");
  await page.route(api + "/ai/**", (route) => route.abort("failed"));
  await drawer(page).getByRole("button", { name: "Check again", exact: true }).click();
  await expect(drawer(page).getByText(/could not be reached/)).toBeVisible();
  await expect(page.locator(".sys-title")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Topology under load" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run test", exact: true })).toBeEnabled();
});

test("M12 a late answer cannot attach to another design after navigating away", async ({ page }, info) => {
  await setup(page, "late-" + info.project.name);
  const first = { designId: "", runId: "" };
  const c = controlledAi(page, first);
  let release: () => void = () => undefined;
  c.ai.holdJob = new Promise<void>((r) => (release = r));
  await c.install();
  await openTemplate(page);
  Object.assign(first, await recordRun(page));
  await page.getByRole("button", { name: "Explain this result", exact: true }).first().click();
  await explain(page).click();
  await expect(drawer(page).getByText(/Generating locally/)).toBeVisible();
  await page.getByRole("link", { name: "Dashboard", exact: true }).first().click(); // client-side navigation
  await expect(page).toHaveURL(/\/dashboard/);
  const second = await openTemplate(page);
  expect(second).not.toBe(first.designId);
  await recordRun(page);
  c.ai.status = "completed";
  release();
  await page.getByRole("button", { name: "Explain this result", exact: true }).first().click();
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByRole("region", { name: "AI interpretation" })).toHaveCount(0);
  await expect(drawer(page).getByText("The recorded run misses its latency target.")).toHaveCount(0);
  await expect(explain(page)).toBeEnabled();
});

test("M12 unsaved edits stay untouched and are never part of the explanation", async ({ page }, info) => {
  await setup(page, "dirty-" + info.project.name);
  const ids = { designId: "", runId: "" };
  const c = controlledAi(page, ids);
  await c.install(); // before the workspace loads: the UI shows AI only when the backend reports it enabled
  await openTemplate(page);
  Object.assign(ids, await recordRun(page));
  await page.getByRole("link", { name: /^Traffic/ }).click();
  const rps = page.getByLabel("Average requests per second", { exact: true });
  await rps.fill("1234");
  await page.getByRole("link", { name: "Results", exact: true }).click();
  await page.getByRole("button", { name: "Explain this result", exact: true }).first().click();
  await expect(drawer(page).getByText(/unsaved edits are kept and not included/)).toBeVisible();
  await explain(page).click();
  await expect(drawer(page).getByText(/Generating locally/)).toBeVisible();
  expect(c.ai.submits[0].expectedRevision).toBe(1);
  await page.getByRole("link", { name: /^Traffic/ }).click();
  await expect(rps).toHaveValue("1234");
});

test("M12 an earlier-revision result is labelled and cannot be explained as the current design", async ({ page }, info) => {
  await setup(page, "stale-" + info.project.name);
  const ids = { designId: "", runId: "" };
  const c = controlledAi(page, ids);
  await c.install(); // before the workspace loads: the UI shows AI only when the backend reports it enabled
  await openTemplate(page);
  Object.assign(ids, await recordRun(page));
  await page.getByRole("link", { name: /^Traffic/ }).click();
  await page.getByLabel("Average requests per second", { exact: true }).fill("777");
  await expect(page.getByRole("status").filter({ hasText: /^Saved ·/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "Results", exact: true }).click();
  await page.getByRole("button", { name: "Explain this result", exact: true }).first().click();
  await expect(drawer(page).getByText(/Earlier revision/)).toBeVisible();
  await expect(explain(page)).toBeDisabled();
  expect(c.ai.submits).toHaveLength(0);
});

test("M12 drawer keyboard behaviour, focus return and a 390 px layout without horizontal overflow", async ({ page }, info) => {
  await setup(page, "a11y-" + info.project.name);
  const ids = { designId: "", runId: "" };
  const c = controlledAi(page, ids);
  await c.install(); // before the workspace loads: the UI shows AI only when the backend reports it enabled
  await openTemplate(page);
  Object.assign(ids, await recordRun(page));
  const trigger = page.getByRole("button", { name: "Explain this result", exact: true }).first();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(drawer(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Result explanation" })).toBeFocused();
  await explain(page).focus();
  await page.keyboard.press("Enter"); // keyboard-operable start
  await expect(drawer(page).getByText(/Generating locally/)).toBeVisible();
  await drawer(page).getByRole("button", { name: "Close assistant" }).focus();
  await page.keyboard.press("Enter");
  await expect(drawer(page)).toHaveCount(0);
  expect(c.ai.cancels, "closing the panel must not cancel an accepted request").toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Explain this result", exact: true }).first().click();
  await expect(drawer(page)).toBeVisible();
  await noOverflow(page);
  await expect(drawer(page).getByRole("region", { name: "Verified facts" })).toBeVisible();
});
