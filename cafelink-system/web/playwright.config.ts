import { defineConfig, devices } from "@playwright/test";

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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node tests/start-server.mjs",
    url: "http://127.0.0.1:18080/api/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
