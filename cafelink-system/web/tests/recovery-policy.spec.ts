import { test, expect } from "@playwright/test";
test("REVIEW keeps an unaccepted service call pending; SEMANTIC cancels it", async ({
  browser,
}) => {
  const origin = "http://127.0.0.1:18080",
    owner = await browser.newContext();
  const login = await owner.request.post("/api/login", {
    headers: { Origin: origin },
    data: { username: "admin", password: "CafeLink@123" },
  });
  const csrf = (await login.json()).csrfToken;
  async function command(action: string, data: unknown) {
    const r = await owner.request.post("/api/command", {
      headers: { Origin: origin, "X-CSRF-Token": csrf },
      data: { commandId: crypto.randomUUID(), action, data },
    });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  }
  await command("OPEN_ALL_TABLES", {});
  const qr = await command("GET_TABLE_QR", { tableId: 1 });
  try {
    for (const [policy, expected] of [
      ["REPLAY_ALL", "ACCEPTED"],
      ["REVIEW", "CONFIRM_REQUIRED"],
      ["SEMANTIC", "CANCELLED"],
    ]) {
      const context = await browser.newContext();
      try {
        const r = await context.request.post("/api/guest/join", {
          headers: { Origin: origin },
          data: { grant: qr.grant, table: true },
        });
        expect(r.ok()).toBe(true);
        const page = await context.newPage();
        await page.goto("/experiment.html");
        await page.waitForFunction(() =>
          Boolean((window as any).cafeExperiment),
        );
        await page.route("**/api/command", (route) =>
          route.request().postDataJSON().action === "CALL_SERVICE"
            ? route.abort("failed")
            : route.continue(),
        );
        await page.evaluate(() =>
          (window as any).cafeExperiment.queueAndSend("CALL_SERVICE"),
        );
        await page.unrouteAll({ behavior: "wait" });
        const result = await page.evaluate(
          (p) => (window as any).cafeExperiment.recover(p),
          policy,
        );
        expect(result.entries[0].status).toBe(expected);
        expect(result.state.tickets).toHaveLength(policy === "REPLAY_ALL" ? 1 : 0);
      } finally {
        await context.request.post("/api/guest/leave", {
          headers: { Origin: origin },
          data: {},
        });
        await context.close();
      }
    }
  } finally {
    await owner.close();
  }
});
