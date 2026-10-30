import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
// Each group owns a fresh real Core/Gateway. Do not weaken production rate limits
// just because an automated suite creates many browser identities on one IP.
const groups = [
  {
    name: "regression",
    files: ["tests/dashboard.spec.ts", "tests/qr.spec.ts"],
  },
  { name: "recovery", files: ["tests/orders.spec.ts"] },
  { name: "ux", files: ["tests/ux.spec.ts"] },
  { name: "v7", files: ["tests/v7.spec.ts"] },
  { name: "automatic", files: ["tests/automatic.spec.ts"] },
  { name: "convenience", files: ["tests/convenience.spec.ts"] },
  { name: "workflow", files: ["tests/workflow.spec.ts"] },
  { name: "shop", files: ["tests/shop.spec.ts"] },
  { name: "policy", files: ["tests/recovery-policy.spec.ts"] },
  { name: "diagnostics", files: ["tests/diagnostics.spec.ts"] },
  { name: "audio", files: ["tests/audio.spec.ts"] },
];
let failed = false;
const results = [];
for (const group of groups) {
  // A failed process must never inherit an older successful report.
  await rm(`test-results/${group.name}-results.json`, { force: true });
  const exit = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["node_modules/@playwright/test/cli.js", "test", ...group.files],
      {
        stdio: "inherit",
        windowsHide: true,
        env: { ...process.env, CAFELINK_E2E_GROUP: group.name },
      },
    );
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
  failed ||= exit !== 0;
  try {
    results.push(
      JSON.parse(
        await readFile(`test-results/${group.name}-results.json`, "utf8"),
      ),
    );
  } catch {
    failed = true;
  }
}
const stats = {
  startTime: results[0]?.stats.startTime,
  duration: 0,
  expected: 0,
  unexpected: 0,
  flaky: 0,
  skipped: 0,
};
for (const result of results)
  for (const key of ["duration", "expected", "unexpected", "flaky", "skipped"])
    stats[key] += result.stats[key];
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/results.json",
  JSON.stringify(
    {
      stats,
      suites: results.flatMap((result) => result.suites),
      errors: results.flatMap((result) => result.errors ?? []),
    },
    null,
    2,
  ),
);
process.exitCode = failed ? 1 : 0;
