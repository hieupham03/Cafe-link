import { expect, type Page } from "@playwright/test";

// Legacy manual visits remain an API/data compatibility path. The current
// storefront opens fixed QR tables, so these migration fixtures use the API.
export async function openLegacyTable(page: Page, tableId: number) {
  const info = await (await page.request.get("/api/session")).json();
  const response = await page.request.post("/api/command", {
    headers: { Origin: "http://127.0.0.1:18080", "X-CSRF-Token": info.csrfToken },
    data: { commandId: crypto.randomUUID(), action: "OPEN_TABLE", data: { tableId }, scope: info.identity },
  });
  expect(response.ok(), await response.text()).toBe(true);
}
