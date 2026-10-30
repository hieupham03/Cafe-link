import { defineConfig, devices } from "@playwright/test";

const engine = process.env.CAFELINK_E2E_ENGINE ?? "chromium";
if (engine !== "chromium" && engine !== "firefox" && engine !== "webkit")
  throw new Error("CAFELINK_E2E_ENGINE must be chromium, firefox or webkit");
const profile = engine === "firefox" ? devices["Desktop Firefox"]
  : engine === "webkit" ? devices["Desktop Safari"] : devices["Desktop Chrome"];

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: `test-results/artifacts-${process.env.CAFELINK_E2E_GROUP ?? "focused"}`,
  reporter: [["list"], ["json", { outputFile: `test-results/${process.env.CAFELINK_E2E_GROUP ?? "focused"}-results.json` }]],
  use: {
    baseURL: "http://127.0.0.1:18080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: engine, use: { ...profile } }],
  webServer: {
    command: "node tests/start-server.mjs",
    url: "http://127.0.0.1:18080/api/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
