import { test, expect, type Page } from "@playwright/test";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

// "What if the traffic changed?" on the Results tab, against the real server and engine. No AI is involved in these journeys.
type Headers = { Authorization: string };
async function setup(page: Page, tag: string) {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("WhatIf");
  await page.getByLabel("Email", { exact: true }).fill("wi-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("WhatIf-Journey-2026!");
  await page.locator("#reg-terms").check();
  const reg = page.waitForResponse((r) => r.url() === api + "/auth/register" && r.status() === 201);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const token = (await (await reg).json()).data.accessToken as string;
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  return { Authorization: "Bearer " + token } as Headers;
}
async function openTemplate(page: Page) {
  await page.goto("/new/template");
  await page.getByRole("button", { name: "Use Single-server MVP", exact: true }).click();
  await expect(page.getByLabel("Component", { exact: true })).toBeVisible();
  return new URL(page.url()).pathname.split("/")[2];
}
const getDesign = async (page: Page, headers: Headers, id: string) => (await (await page.request.get(api + "/designs/" + id, { headers })).json()).data;
async function simulate(page: Page, headers: Headers, id: string, revision: number) {
  const accepted = await page.request.post(api + "/designs/" + id + "/simulate", { headers, data: { expectedRevision: revision, requestId: crypto.randomUUID() } });
  expect(accepted.status()).toBe(202);
  const statusUrl = (await accepted.json()).data.statusUrl as string;
  for (let i = 0; i < 150; i++) {
    const run = (await (await page.request.get(statusUrl.startsWith("http") ? statusUrl : api.replace(/\/v1$/, "") + statusUrl, { headers })).json()).data;
    if (run.status !== "pending") return run;
    await page.waitForTimeout(50);
  }
  throw new Error("run stayed pending");
}
async function withRun(page: Page, tag: string) {
  const headers = await setup(page, tag);
  const id = await openTemplate(page);
  const design = await getDesign(page, headers, id);
  const run = await simulate(page, headers, id, design.revision);
  await page.goto("/designs/" + id + "/results?run=" + run.id);
  await expect(page.getByTestId("whatif-panel")).toBeVisible();
  return { headers, id, design, run };
}
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
const ms = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " ms";

test("the panel is labelled as calculated with no AI, and nothing can be run until something is chosen", async ({ page }, info) => {
  await withRun(page, "idle-" + info.project.name);
  await expect(page.getByTestId("whatif-panel")).toContainText("Calculated by the model, no AI");
  await expect(page.getByTestId("whatif-button")).toBeDisabled();
  await expect(page.getByTestId("whatif-problem")).toContainText("Choose something to change");
  await page.getByTestId("whatif-shape").selectOption("spike");
  await expect(page.getByTestId("whatif-button")).toBeEnabled();
});

test("multiplying the traffic sends exactly that change and shows the server's figures beside the recorded run", async ({ page }, info) => {
  const { headers, design, run } = await withRun(page, "mult-" + info.project.name);
  await page.getByTestId("whatif-mode").selectOption("multiply");
  await page.getByTestId("whatif-value").fill("3");
  const sent = page.waitForRequest((r) => r.url().endsWith("/what-if") && r.method() === "POST");
  await page.getByTestId("whatif-button").click();
  expect((await sent).postDataJSON()).toEqual({ expectedRevision: design.revision, runId: run.id, change: { trafficMode: "multiply", value: 3, shape: "keep", readShare: "keep" } });
  await expect(page.getByTestId("whatif-table")).toBeVisible();
  await expect(page.getByTestId("whatif-sentence")).toHaveText("Changed: the request rate multiplied by 3.");
  // Every figure is what the server's own preview gives for the same design under the same changed traffic.
  const fresh = (await (await page.request.post(api + "/simulation/preview", { headers, data: { editorSessionId: crypto.randomUUID(), sequence: 0, schemaVersion: 1, graph: design.graph, traffic: { ...design.traffic, rps: design.traffic.rps * 3 } } })).json()).data.summary;
  const cells = await page.getByTestId("whatif-table").locator("tbody tr").evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll("th,td")].map((c) => (c.textContent ?? "").trim())));
  const row = (label: string) => cells.find((c) => c[0] === label)!;
  expect(row("p95")[2]).toBe(ms(fresh.p95));
  expect(row("Requests per second")[2]).toBe((design.traffic.rps * 3).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  expect(row("p95")[1]).toBe(ms(run.result.summary.p95));
  // No difference column: exactly the two figure columns.
  await expect(page.getByTestId("whatif-table").locator("thead th")).toHaveCount(3);
  await expect(page.getByTestId("whatif-table")).not.toContainText(/difference|change in|delta/i);
});

test("a value outside the bounds is explained before anything is sent, and the server's own refusal is shown in words if it ever arrives", async ({ page }, info) => {
  await withRun(page, "range-" + info.project.name);
  await page.getByTestId("whatif-mode").selectOption("multiply");
  await page.getByTestId("whatif-value").fill("1000000");
  await expect(page.getByTestId("whatif-button")).toBeDisabled();
  await expect(page.getByTestId("whatif-problem")).toContainText("from 0.1 to 20");
  await page.getByTestId("whatif-mode").selectOption("set");
  await page.getByTestId("whatif-value").fill("10000000000");
  await expect(page.getByTestId("whatif-problem")).toContainText("from 1 to 10,000,000 requests per second");
  // The server refuses it too (the form is only a courtesy): the message is plain and nothing is shown as a result.
  await page.route(api + "/designs/*/what-if", (route) => route.fulfill({ status: 422, json: { error: { code: "VALIDATION_FAILED", message: "Set the traffic to between 1 and 10,000,000 requests per second.", details: { reason: "WHATIF_OUT_OF_RANGE" } } } }));
  await page.getByTestId("whatif-value").fill("5000");
  await page.getByTestId("whatif-button").click();
  await expect(page.getByTestId("whatif-error")).toContainText("outside the allowed range, so nothing was calculated");
  await expect(page.getByTestId("whatif-table")).toHaveCount(0);
});

test("changing a control drops the old answer, so a table never sits beside controls that no longer describe it", async ({ page }, info) => {
  await withRun(page, "drop-" + info.project.name);
  await page.getByTestId("whatif-shape").selectOption("spike");
  await page.getByTestId("whatif-button").click();
  await expect(page.getByTestId("whatif-table")).toBeVisible();
  await page.getByTestId("whatif-readshare").selectOption("mostly_writes");
  await expect(page.getByTestId("whatif-table")).toHaveCount(0);
});

test("a change that cannot be calculated is said plainly: a rate beyond the model's limit is never shown as a result", async ({ page }, info) => {
  await withRun(page, "large-" + info.project.name);
  await page.route(api + "/designs/*/what-if", async (route) => {
    const real = await route.fetch();
    const json = await real.json();
    json.data.after = { ...json.data.after, rps: 20_000_000, status: "TOO_LARGE", measure: null, limiter: null };
    await route.fulfill({ response: real, json });
  });
  await page.getByTestId("whatif-mode").selectOption("multiply");
  await page.getByTestId("whatif-value").fill("2");
  await page.getByTestId("whatif-button").click();
  const whatIfCell = page.getByTestId("whatif-result-row").locator("td").nth(1);
  await expect(whatIfCell).toHaveText("Beyond the model's limit");
  await expect(whatIfCell).not.toContainText("passes");
});

test("the panel fits at every width and can be used with the keyboard", async ({ page }, info) => {
  await withRun(page, "fit-" + info.project.name);
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
  }
  await page.getByTestId("whatif-shape").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("whatif-button")).toBeEnabled();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("whatif-table")).toBeVisible();
});

// "Say it in words": only when the server has the task on. The model is stubbed here; nothing in these journeys calls a real one.
const readiness = (whatif: boolean) => ({
  data: { tasks: ["describe", "whatif", "fixes"].map((task) => ({ task, enabled: task === "whatif" && whatif, available: task === "whatif" && whatif, provider: "groq", model: "openai/gpt-oss-120b", reason: task === "whatif" && whatif ? "AVAILABLE" : "DISABLED" })) },
});
const stubReadiness = (page: Page, whatif: boolean) => page.route(api + "/ai/tasks/readiness", (route) => route.fulfill({ json: readiness(whatif) }));
const proposal = (over: Record<string, unknown> = {}) => ({
  data: { status: "SUPPORTED", change: { trafficMode: "multiply", value: 2, shape: "spike", readShare: "keep" }, interpretation: ["Understood: the request rate multiplied by 2, a spike shape."], provider: "groq", model: "openai/gpt-oss-120b", ...over },
});

test("with the AI task off there is no sentence box, and the controls work as before", async ({ page }, info) => {
  await stubReadiness(page, false);
  await withRun(page, "ai-off-" + info.project.name);
  await expect(page.getByTestId("whatif-ai")).toHaveCount(0);
  await expect(page.getByTestId("whatif-mode")).toBeVisible();
});

test("with the task on, a sentence becomes a proposal that changes nothing until Apply, and nothing runs until Run what-if", async ({ page }, info) => {
  await stubReadiness(page, true);
  const asked: unknown[] = [];
  await page.route(api + "/ai/tasks/what-if", (route) => (asked.push(route.request().postDataJSON()), route.fulfill({ json: proposal() })));
  let whatIfCalls = 0;
  await page.route(api + "/designs/*/what-if", (route) => (whatIfCalls++, route.continue()));
  await withRun(page, "ai-on-" + info.project.name);
  await expect(page.getByTestId("whatif-ai")).toContainText("AI-assisted, experimental");
  await expect(page.getByTestId("whatif-ai-experimental")).toContainText("Experimental: it has not passed an acceptance run");
  await expect(page.getByTestId("whatif-ai-experimental").getByRole("link", { name: "What was measured is on the Evaluation page." })).toHaveAttribute("href", "/evaluation/ai");
  await expect(page.getByTestId("whatif-ai")).toContainText("sends the text you typed to Groq");
  await expect(page.getByTestId("whatif-ai-button")).toBeDisabled();
  await page.getByTestId("whatif-ai-input").fill("what if traffic doubles during a flash sale?");
  await page.getByTestId("whatif-ai-button").click();
  await expect(page.getByTestId("whatif-ai-result")).toContainText("Understood: the request rate multiplied by 2, a spike shape.");
  expect(asked).toEqual([{ text: "what if traffic doubles during a flash sale?" }]);
  await expect(page.getByTestId("whatif-mode")).toHaveValue("keep");
  await expect(page.getByTestId("whatif-shape")).toHaveValue("keep");
  await page.getByTestId("whatif-ai-apply").click();
  await expect(page.getByTestId("whatif-mode")).toHaveValue("multiply");
  await expect(page.getByTestId("whatif-value")).toHaveValue("2");
  await expect(page.getByTestId("whatif-shape")).toHaveValue("spike");
  expect(whatIfCalls).toBe(0);
  await page.getByTestId("whatif-button").click();
  await expect(page.getByTestId("whatif-table")).toBeVisible();
  expect(whatIfCalls).toBe(1);
});

test("a refused value or an unreadable sentence changes nothing, and typing again drops the proposal", async ({ page }, info) => {
  await stubReadiness(page, true);
  let mode: "range" | "none" | "ok" = "range";
  await page.route(api + "/ai/tasks/what-if", (route) =>
    route.fulfill({
      json:
        mode === "range" ? proposal({ status: "OUT_OF_RANGE", change: { trafficMode: "keep", value: 0, shape: "keep", readShare: "keep" }, interpretation: ["That would multiply the traffic by 1,000,000, outside the allowed 0.1 to 20, so it was not applied."] })
        : mode === "none" ? proposal({ status: "UNSUPPORTED", change: { trafficMode: "keep", value: 0, shape: "keep", readShare: "keep" }, interpretation: ["That did not read as a change of the traffic, its shape or the read share, so nothing was filled in."] })
        : proposal(),
    }),
  );
  await withRun(page, "ai-refuse-" + info.project.name);
  await page.getByTestId("whatif-shape").selectOption("ramp");
  await page.getByTestId("whatif-ai-input").fill("a million times");
  await page.getByTestId("whatif-ai-button").click();
  await expect(page.getByTestId("whatif-ai-result")).toContainText("so it was not applied");
  await expect(page.getByTestId("whatif-ai-apply")).toHaveCount(0);
  mode = "none";
  await page.getByTestId("whatif-ai-input").fill("is it good?");
  await page.getByTestId("whatif-ai-button").click();
  await expect(page.getByTestId("whatif-ai-result")).toContainText("nothing was filled in");
  await expect(page.getByTestId("whatif-ai-apply")).toHaveCount(0);
  // The person's own choice is untouched by both.
  await expect(page.getByTestId("whatif-shape")).toHaveValue("ramp");
  mode = "ok";
  await page.getByTestId("whatif-ai-input").fill("doubles");
  await page.getByTestId("whatif-ai-button").click();
  await expect(page.getByTestId("whatif-ai-apply")).toBeVisible();
  await page.getByTestId("whatif-ai-input").fill("doubles and more");
  await expect(page.getByTestId("whatif-ai-result")).toHaveCount(0);
});

test("a quota that is used up leaves the controls usable and says what to do", async ({ page }, info) => {
  await stubReadiness(page, true);
  await page.route(api + "/ai/tasks/what-if", (route) => route.fulfill({ status: 429, json: { error: { code: "RATE_LIMITED", message: "busy", details: { reason: "AI_QUOTA", retryAfterSeconds: 120 } } } }));
  await withRun(page, "ai-quota-" + info.project.name);
  await page.getByTestId("whatif-ai-input").fill("doubles");
  await page.getByTestId("whatif-ai-button").click();
  await expect(page.getByTestId("whatif-ai-error")).toContainText("quota is used up for now. You can try again in about 2 minutes");
  await expect(page.getByTestId("whatif-ai-error")).toContainText("Use the controls above");
  await page.getByTestId("whatif-shape").selectOption("spike");
  await expect(page.getByTestId("whatif-button")).toBeEnabled();
});
