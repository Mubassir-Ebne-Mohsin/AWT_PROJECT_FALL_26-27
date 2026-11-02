import { test, expect, type Page, type Route } from "@playwright/test";
const api = process.env.SF_API_URL ?? "http://localhost:5001/v1";

// The describe page with a hosted model. The AI endpoints are faked here; creating the design goes to the real backend, so the
// new "ai" design source is stored and listed for real. The real server path is covered by the API e2e suite.
async function setup(page: Page, tag: string) {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("AI Describe");
  await page.getByLabel("Email", { exact: true }).fill("aid-" + Date.now() + "-" + tag + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill("AI-Describe-2026!");
  await page.locator("#reg-terms").check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
}
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

type Mode = { reason?: "AVAILABLE" | "DISABLED" | "QUOTA_EXHAUSTED" | "PROVIDER_NOT_CONFIGURED"; retryAfterSeconds?: number; describe?: "ok" | "limited" | "invalid" | "slow" };
const readiness = (mode: Mode) => {
  const reason = mode.reason ?? "AVAILABLE";
  const task = (name: string) => ({
    task: name, enabled: reason !== "DISABLED", available: reason === "AVAILABLE", provider: "groq", model: "openai/gpt-oss-20b", reason,
    ...(mode.retryAfterSeconds ? { retryAfterSeconds: mode.retryAfterSeconds } : {}),
  });
  return { tasks: [task("describe"), task("whatif"), task("fixes")] };
};
const prepared = () => ({
  design: {
    schemaVersion: 1, name: "School portal", description: "A school portal for 2,000 students.\n\nAI assumptions (review before creating):\n- Suggested by a hosted AI model (Groq, openai/gpt-oss-20b) from your description. Review every part before creating.",
    source: "ai", templateId: null,
    graph: {
      nodes: [
        { id: "n1", type: "client", label: "Users", x: 40, y: 220, props: { region: "us-east" } },
        { id: "n2", type: "lb", label: "Load balancer", x: 280, y: 220, props: { region: "us-east" } },
        { id: "n3", type: "app", label: "App servers", x: 520, y: 220, props: { replicas: 2, region: "us-east" } },
        { id: "n4", type: "db", label: "Database", x: 760, y: 220, props: { region: "us-east" } },
      ],
      edges: [{ id: "e1", from: "n1", to: "n2" }, { id: "e2", from: "n2", to: "n3" }, { id: "e3", from: "n3", to: "n4" }],
    },
    traffic: { preset: "custom", rps: 120, burst: 1.5, readRatio: 0.85, sloP95: 300, errorBudget: 0.01, durationMin: 10, shape: "steady" },
  },
  assumptions: [
    "Suggested by a hosted AI model (Groq, openai/gpt-oss-20b) from your description. Review every part before creating.",
    "The model's reason (its own words): A small portal with mostly reads.",
    "Components: US East, 2 app servers, load balancer, database.",
  ],
  provider: "groq",
  model: "openai/gpt-oss-20b",
});
async function fakeAi(page: Page, mode: Mode, sent: string[] = []) {
  await page.route(api + "/ai/tasks/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/v1/, "");
    if (path === "/ai/tasks/readiness") return route.fulfill({ status: 200, json: { data: readiness(mode) } });
    if (path === "/ai/tasks/describe" && req.method() === "POST") {
      sent.push(JSON.parse(req.postData() ?? "{}").text);
      if (mode.describe === "slow") await new Promise((r) => setTimeout(r, 1500));
      if (mode.describe === "limited")
        return route.fulfill({ status: 429, json: { error: { code: "RATE_LIMITED", message: "The hosted AI quota does not allow another request yet", details: { reason: "AI_QUOTA", limit: "requests per minute", retryAfterSeconds: 120 } } } });
      if (mode.describe === "invalid")
        return route.fulfill({ status: 422, json: { error: { code: "VALIDATION_FAILED", message: "Hosted AI returned an unusable answer", details: { reason: "INVALID_OUTPUT" } } } });
      return route.fulfill({ status: 200, json: { data: prepared() } });
    }
    return route.continue();
  });
}
const DESCRIPTION = "A school portal for 2,000 students, mostly reads, behind a load balancer.";
const box = (page: Page) => page.getByLabel("Your system, in your own words");

test("AI off: the page is the keyword-rules page, with no AI button, notice or counter", async ({ page }, info) => {
  await setup(page, "off-" + info.project.name);
  await fakeAi(page, { reason: "DISABLED" });
  await page.goto("/new/describe");
  await expect(page.getByRole("button", { name: "Draft the design", exact: true })).toBeVisible();
  await expect(page.getByText("Scripted mock")).toBeVisible();
  await expect(page.getByTestId("draft-with-ai")).toHaveCount(0);
  await expect(page.getByTestId("describe-ai-notice")).toHaveCount(0);
  await expect(page.getByTestId("describe-ai-count")).toHaveCount(0);
  await noOverflow(page);
});

test("AI on: the notice says what is sent to Groq, and both drafting buttons are offered", async ({ page }, info) => {
  await setup(page, "on-" + info.project.name);
  await fakeAi(page, {});
  await page.goto("/new/describe");
  const notice = page.getByTestId("describe-ai-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("sends the description you typed to Groq");
  await expect(notice).toContainText("Do not put secrets or personal data in it");
  await expect(notice).toContainText("30 days unless Zero Data Retention");
  await expect(notice).toContainText("Nothing is saved until you create the design");
  await expect(page.getByRole("button", { name: "Draft with keyword rules", exact: true })).toBeVisible();
  const ai = page.getByTestId("draft-with-ai");
  await expect(ai).toBeVisible();
  await expect(ai).toBeDisabled();
  await box(page).fill(DESCRIPTION);
  await expect(ai).toBeEnabled();
  await expect(page.getByTestId("describe-ai-count")).toHaveText(DESCRIPTION.length + "/500 characters for an AI draft");
  await noOverflow(page);
});

test("AI draft: the description is sent as typed, the review card says AI made it, and creating stores it as an AI draft", async ({ page }, info) => {
  await setup(page, "draft-" + info.project.name);
  const sent: string[] = [];
  await fakeAi(page, {}, sent);
  await page.goto("/new/describe");
  await box(page).fill(DESCRIPTION);
  await page.getByTestId("draft-with-ai").click();
  await expect(page.getByRole("heading", { name: "Review your draft" })).toBeVisible();
  expect(sent).toEqual([DESCRIPTION]);
  await expect(page.getByTestId("ai-draft-tag")).toHaveText("AI draft · Groq · openai/gpt-oss-20b");
  await expect(page.getByText("Suggested by a hosted AI model (Groq, openai/gpt-oss-20b)")).toBeVisible();
  await expect(page.getByText("The model's reason (its own words)")).toBeVisible();
  await expect(page.getByText("Assumptions to review")).toBeVisible();
  await expect(page.getByRole("button", { name: "Draft with AI again" })).toBeVisible();
  await noOverflow(page);
  await page.getByRole("button", { name: "Open in the editor" }).click();
  await expect(page).toHaveURL(/\/designs\/[0-9a-f-]+\/edit/, { timeout: 30_000 });
  await page.goto("/dashboard");
  await expect(page.getByText("AI draft", { exact: true }).first()).toBeVisible();
});

test("a description over 500 characters cannot be sent to the AI; keyword rules still accept it", async ({ page }, info) => {
  await setup(page, "long-" + info.project.name);
  const sent: string[] = [];
  await fakeAi(page, {}, sent);
  await page.goto("/new/describe");
  await box(page).fill("A news site. ".repeat(40));
  await expect(page.getByTestId("describe-ai-count")).toContainText("519/500");
  await expect(page.getByTestId("draft-with-ai")).toBeDisabled();
  await page.getByRole("button", { name: "Draft with keyword rules", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review your draft" })).toBeVisible();
  expect(sent).toEqual([]);
  await expect(page.getByTestId("ai-draft-tag")).toHaveCount(0);
});

test("quota used up: the AI button is off with the wait, and keyword rules still work", async ({ page }, info) => {
  await setup(page, "quota-" + info.project.name);
  await fakeAi(page, { reason: "QUOTA_EXHAUSTED", retryAfterSeconds: 300 });
  await page.goto("/new/describe");
  await box(page).fill(DESCRIPTION);
  await expect(page.getByTestId("draft-with-ai")).toBeDisabled();
  await expect(page.getByTestId("describe-ai-unavailable")).toContainText("The free AI quota is used up for now. You can try again in about 5 minutes. Keyword rules still work.");
  await page.getByRole("button", { name: "Draft with keyword rules", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review your draft" })).toBeVisible();
});

test("service not set up: the AI button is off and says so", async ({ page }, info) => {
  await setup(page, "nokey-" + info.project.name);
  await fakeAi(page, { reason: "PROVIDER_NOT_CONFIGURED" });
  await page.goto("/new/describe");
  await box(page).fill(DESCRIPTION);
  await expect(page.getByTestId("draft-with-ai")).toBeDisabled();
  await expect(page.getByTestId("describe-ai-unavailable")).toContainText("The AI service is not set up on this server.");
});

test("a refused request shows plain words, keeps the description, and the person can try keyword rules", async ({ page }, info) => {
  await setup(page, "refused-" + info.project.name);
  await fakeAi(page, { describe: "limited" });
  await page.goto("/new/describe");
  await box(page).fill(DESCRIPTION);
  await page.getByTestId("draft-with-ai").click();
  await expect(page.locator(".note.fail[role=alert]")).toContainText("The free AI quota is used up for now. You can try again in about 2 minutes. You can use keyword rules meanwhile.");
  await expect(box(page)).toHaveValue(DESCRIPTION);
  await expect(page.getByRole("heading", { name: "Review your draft" })).toHaveCount(0);
  await page.getByRole("button", { name: "Draft with keyword rules", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review your draft" })).toBeVisible();
});

test("an unusable suggestion is explained and nothing is shown as a draft", async ({ page }, info) => {
  await setup(page, "invalid-" + info.project.name);
  await fakeAi(page, { describe: "invalid" });
  await page.goto("/new/describe");
  await box(page).fill(DESCRIPTION);
  await page.getByTestId("draft-with-ai").click();
  await expect(page.locator(".note.fail[role=alert]")).toContainText("The AI's suggestion could not be used. Try rewording your description, or use keyword rules.");
  await expect(page.getByTestId("ai-draft-tag")).toHaveCount(0);
});

test("while the model is working the form is locked, and the AI button works from the keyboard", async ({ page }, info) => {
  await setup(page, "busy-" + info.project.name);
  await fakeAi(page, { describe: "slow" });
  await page.goto("/new/describe");
  await box(page).fill(DESCRIPTION);
  const ai = page.getByTestId("draft-with-ai");
  await ai.focus();
  await expect(ai).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Working…" })).toBeVisible();
  await expect(box(page)).toBeDisabled();
  await expect(ai).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Review your draft" })).toBeVisible({ timeout: 15_000 });
  await expect(box(page)).toBeEnabled();
});
