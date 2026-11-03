import { test, expect, type Page } from "@playwright/test";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

// Choosing what to try in the fix suggestions: leave kinds out, choose what comes first, and (only when the server has the task on)
// say it in words so a hosted model fills those choices. The model is stubbed here; nothing in these journeys calls a real one.
type Headers = { Authorization: string };
async function setup(page: Page, tag: string) {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Goal");
  await page.getByLabel("Email", { exact: true }).fill("fg-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Goal-Journey-2026!");
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
/** A design under a load that makes it fail, and its recorded run. */
async function failingRun(page: Page, headers: Headers, id: string) {
  const d = await getDesign(page, headers, id);
  const patched = await page.request.patch(api + "/designs/" + id, { headers, data: { expectedRevision: d.revision, traffic: { ...d.traffic, rps: d.traffic.rps * 3 } } });
  expect(patched.status()).toBe(200);
  const saved = (await patched.json()).data;
  const run = await simulate(page, headers, id, saved.revision);
  expect(run.result.summary.verdict).not.toBe("pass");
  return run;
}
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
const readiness = (fixes: boolean) => ({
  data: {
    tasks: ["describe", "whatif", "fixes"].map((task) => ({ task, enabled: task === "fixes" && fixes, available: task === "fixes" && fixes, provider: "groq", model: "openai/gpt-oss-20b", reason: task === "fixes" && fixes ? "AVAILABLE" : "DISABLED" })),
  },
});
const stubReadiness = (page: Page, fixes: boolean) => page.route(api + "/ai/tasks/readiness", (route) => route.fulfill({ json: readiness(fixes) }));
const intent = (over: Record<string, unknown> = {}) => ({
  data: { understood: true, filter: { exclude: ["replicas"], preference: "default" }, interpretation: ["Left out: more copies."], provider: "groq", model: "openai/gpt-oss-20b", ...over },
});
const fixesRequest = (page: Page) => page.waitForRequest((r) => r.url().endsWith("/fixes") && r.method() === "POST");
const afterP95 = async (card: ReturnType<Page["getByTestId"]>) => Number(((await card.locator("dd").nth(1).innerText()).match(/to ([\d,.]+) ms/) as RegExpMatchArray)[1].replace(/,/g, ""));

async function failing(page: Page, tag: string) {
  const headers = await setup(page, tag);
  const id = await openTemplate(page);
  const run = await failingRun(page, headers, id);
  await page.goto("/designs/" + id + "/results?run=" + run.id);
  await expect(page.getByTestId("fixes-panel")).toBeVisible();
  return { id, run };
}

test("with AI off the panel offers the choices but no goal box, and asking for nothing sends exactly the old request", async ({ page }, info) => {
  await stubReadiness(page, false);
  await failing(page, "off-" + info.project.name);
  await expect(page.getByTestId("fix-choices")).toBeVisible();
  await expect(page.getByTestId("fix-goal")).toHaveCount(0);
  await expect(page.getByTestId("fix-goal-input")).toHaveCount(0);
  await expect(page.getByTestId("fix-choices")).not.toHaveAttribute("open", "");
  const sent = fixesRequest(page);
  await page.getByTestId("fixes-button").click();
  expect(Object.keys((await sent).postDataJSON()).sort()).toEqual(["expectedRevision", "runId"]);
  await expect(page.getByTestId("fix-card").first()).toBeVisible();
});

test("leaving a kind out sends that filter, and the suggestions never include it", async ({ page }, info) => {
  await stubReadiness(page, false);
  await failing(page, "leave-" + info.project.name);
  await page.getByTestId("fix-choices").locator("summary").click();
  await expect(page.getByTestId("fix-exclude-capacity")).not.toBeChecked();
  await page.getByTestId("fix-exclude-capacity").check();
  const sent = fixesRequest(page);
  await page.getByTestId("fixes-button").click();
  expect((await sent).postDataJSON().filter).toEqual({ exclude: ["capacity"], preference: "default" });
  const cards = page.getByTestId("fix-card");
  await expect(cards.first()).toBeVisible();
  for (let i = 0; i < (await cards.count()); i++) await expect(cards.nth(i)).not.toContainText("bigger size");
  await expect(cards.first()).toContainText("Add one more copy");
  // Unticking brings it back and the request goes back to carrying no filter at all.
  await page.getByTestId("fix-exclude-capacity").uncheck();
  const again = fixesRequest(page);
  await page.getByTestId("fixes-button").click();
  expect(Object.keys((await again).postDataJSON()).sort()).toEqual(["expectedRevision", "runId"]);
});

test("leaving out every kind that could be tried says so plainly and shows no fix", async ({ page }, info) => {
  await stubReadiness(page, false);
  await failing(page, "all-" + info.project.name);
  await page.getByTestId("fix-choices").locator("summary").click();
  for (const kind of ["replicas", "capacity", "cache", "readReplica"]) await page.getByTestId("fix-exclude-" + kind).check();
  await page.getByTestId("fixes-button").click();
  await expect(page.getByTestId("fixes-status")).toContainText("You left out every kind of fix that could be tried here, so none was tried");
  await expect(page.getByTestId("fix-card")).toHaveCount(0);
});

test("choosing what comes first sends it and orders the suggestions by it", async ({ page }, info) => {
  await stubReadiness(page, false);
  await failing(page, "pref-" + info.project.name);
  await page.getByTestId("fix-choices").locator("summary").click();
  await page.getByTestId("fix-preference").selectOption("lowest_latency");
  const sent = fixesRequest(page);
  await page.getByTestId("fixes-button").click();
  expect((await sent).postDataJSON().filter).toEqual({ exclude: [], preference: "lowest_latency" });
  const cards = page.getByTestId("fix-card");
  await expect(cards.first()).toBeVisible();
  const p95s: number[] = [];
  for (let i = 0; i < (await cards.count()); i++) p95s.push(await afterP95(cards.nth(i)));
  expect(p95s).toEqual([...p95s].sort((a, b) => a - b));
});

test("with the task on, a typed goal sets the choices, shows what was understood, and the person can change it before asking", async ({ page }, info) => {
  await stubReadiness(page, true);
  const goals: unknown[] = [];
  await page.route(api + "/ai/tasks/fix-intent", (route) => {
    goals.push(route.request().postDataJSON());
    return route.fulfill({ json: intent() });
  });
  await failing(page, "goal-" + info.project.name);
  await expect(page.getByTestId("fix-goal")).toBeVisible();
  await expect(page.getByTestId("fix-goal")).toContainText("AI-assisted, experimental");
  await expect(page.getByTestId("fix-goal-experimental")).toContainText("Experimental: it narrowly missed its own test and is off by default.");
  await expect(page.getByTestId("fix-goal-experimental").getByRole("link", { name: "What was measured is on the Evaluation page." })).toHaveAttribute("href", "/evaluation/ai");
  await expect(page.getByTestId("fix-goal")).toContainText("sends the sentence you typed to Groq");
  await expect(page.getByTestId("fix-goal-button")).toBeDisabled();
  await page.getByTestId("fix-goal-input").fill("I can't run more servers");
  await page.getByTestId("fix-goal-button").click();
  await expect(page.getByTestId("fix-goal-result")).toContainText("Left out: more copies.");
  expect(goals).toEqual([{ goal: "I can't run more servers" }]);
  await expect(page.getByTestId("fix-exclude-replicas")).toBeChecked();
  await expect(page.getByTestId("fix-exclude-capacity")).not.toBeChecked();
  // The person disagrees with part of it: the request carries what they chose, not what the AI said.
  await page.getByTestId("fix-exclude-replicas").uncheck();
  await page.getByTestId("fix-exclude-cache").check();
  const sent = fixesRequest(page);
  await page.getByTestId("fixes-button").click();
  expect((await sent).postDataJSON().filter).toEqual({ exclude: ["cache"], preference: "default" });
  await expect(page.getByTestId("fix-card").first()).toBeVisible();
});

test("a goal the AI could not read, or a quota that is used up, leaves the choices usable and says what to do", async ({ page }, info) => {
  await stubReadiness(page, true);
  let mode: "quota" | "weather" = "quota";
  await page.route(api + "/ai/tasks/fix-intent", (route) =>
    mode === "quota"
      ? route.fulfill({ status: 429, json: { error: { code: "RATE_LIMITED", message: "busy", details: { reason: "AI_QUOTA", retryAfterSeconds: 120 } } } })
      : route.fulfill({ json: intent({ understood: false, filter: { exclude: [], preference: "default" }, interpretation: ["That did not read as a wish about the fixes, so the usual suggestions are shown."] }) }),
  );
  await failing(page, "bad-" + info.project.name);
  await page.getByTestId("fix-goal-input").fill("no cache");
  await page.getByTestId("fix-goal-button").click();
  await expect(page.getByTestId("fix-goal-error")).toContainText("quota is used up for now. You can try again in about 2 minutes");
  await expect(page.getByTestId("fix-goal-error")).toContainText("Use the choices below");
  await page.getByTestId("fix-exclude-capacity").check();
  mode = "weather";
  await page.getByTestId("fix-goal-input").fill("what is the weather");
  await page.getByTestId("fix-goal-button").click();
  await expect(page.getByTestId("fix-goal-result")).toContainText("did not read as a wish about the fixes");
  await expect(page.getByTestId("fix-goal-error")).toHaveCount(0);
  await expect(page.getByTestId("fix-exclude-capacity")).not.toBeChecked();
});

test("when the task is on but unavailable the box says why and cannot be used, and the choices still work", async ({ page }, info) => {
  await page.route(api + "/ai/tasks/readiness", (route) =>
    route.fulfill({ json: { data: { tasks: [{ task: "fixes", enabled: true, available: false, provider: "groq", model: "openai/gpt-oss-20b", reason: "QUOTA_EXHAUSTED", retryAfterSeconds: 300 }] } } }),
  );
  await failing(page, "unavail-" + info.project.name);
  await page.getByTestId("fix-goal-input").fill("cheapest first");
  await expect(page.getByTestId("fix-goal-button")).toBeDisabled();
  await expect(page.getByTestId("fix-goal-blocked")).toContainText("The free AI quota is used up for now. You can try again in about 5 minutes.");
  await page.getByTestId("fix-preference").selectOption("simplest");
  await page.getByTestId("fixes-button").click();
  await expect(page.getByTestId("fix-card").first()).toBeVisible();
});

test("the goal box and choices fit at every width and can be used with the keyboard", async ({ page }, info) => {
  await stubReadiness(page, true);
  await failing(page, "fit-" + info.project.name);
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
  }
  await page.getByTestId("fix-goal-input").focus();
  await page.keyboard.type("no cache");
  await expect(page.getByTestId("fix-goal-button")).toBeEnabled();
  await page.getByTestId("fix-exclude-cache").focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("fix-exclude-cache")).toBeChecked();
});
