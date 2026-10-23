import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 360_000,
  expect: { timeout: 15_000 },
  workers: 1, // Shared audit API rate limits; separate cookie jar per test.
  retries: 0,
  reporter: [["list", { printSteps: true }]],
  use: {
    baseURL: process.env.SF_WEB_URL ?? "http://localhost:3000",
    browserName: "chromium",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    channel: process.env.SF_BROWSER_CHANNEL || undefined,
    trace: "off", // Auth responses contain tokens; do not persist traces/storage state.
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [1024, 1440].flatMap(width => (["light", "dark"] as const).map(colorScheme => ({
    name: `${width}-${colorScheme}`,
    use: { viewport: { width, height: 900 }, colorScheme },
  }))),
});
