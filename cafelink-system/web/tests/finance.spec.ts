import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const origin = "http://127.0.0.1:18080";
let owner: BrowserContext, admin: Page, csrf: string;
async function command(action: string, data: unknown) {
  const response = await owner.request.post("/api/command", { headers: { Origin: origin, "X-CSRF-Token": csrf }, data: { action, data, commandId: crypto.randomUUID() } });
  expect(response.ok(), await response.text()).toBe(true); return response.json();
}
test.beforeAll(async ({ browser }) => {
  owner = await browser.newContext();
  const login = await owner.request.post("/api/login", { headers: { Origin: origin }, data: { username: "admin", password: "CafeLink@123" } });
  csrf = (await login.json()).csrfToken;
});
test.beforeEach(async () => {
  admin = await owner.newPage(); await admin.goto("/admin");
  await admin.getByRole("button", { name: "Thu chi & thuế", exact: true }).click();
  await expect(admin.getByRole("heading", { name: "Nắm rõ dòng tiền mỗi ngày" })).toBeVisible();
});
test.afterEach(async () => { await admin.close(); });
test.afterAll(async () => {
  const settings = await command("GET_TAX_SETTINGS", {});
  await command("SAVE_TAX_SETTINGS", { ...settings, enabled: false, expectedVersion: settings.version });
  await owner.close();
});

test("owner configures tax; guest cart, payment and saved invoice agree", async ({ browser }) => {
  await admin.getByRole("button", { name: "Cấu hình thuế hóa đơn", exact: true }).click();
  await admin.getByLabel("Áp dụng thuế trên hóa đơn").check();
  await admin.getByLabel("Thuế suất (%)", { exact: true }).fill("8");
  await admin.getByLabel("Cách tính thuế").selectOption("added");
  await admin.getByRole("button", { name: "Lưu cấu hình thuế" }).click();
  await expect(admin.getByText("Đã lưu cấu hình thuế. Áp dụng cho các đơn mới.")).toBeVisible();
  await admin.screenshot({ path: "test-results/finance-tax-desktop.png", fullPage: true });
  await command("OPEN_ALL_TABLES", {});
  const qr = await command("GET_TABLE_QR", { tableId: 1 });
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await guest.newPage();
  try {
    await page.goto(qr.joinUrl); await page.getByRole("button", { name: "Vào bàn của tôi", exact: true }).click();
    await page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }).click();
    await expect(page.getByTestId("cart-total")).toContainText("32.400");
    await expect(page.locator("#guest-cart")).toContainText("VAT (8%)");
    await page.screenshot({ path: "test-results/finance-guest-mobile.png", fullPage: true });
    await page.getByRole("button", { name: "Đặt món và thanh toán", exact: true }).click();
    const portal = page.getByRole("dialog", { name: "Cổng thanh toán giả lập" });
    await expect(portal).toContainText("32.400"); await expect(portal).toContainText("2.400");
    await portal.getByRole("button", { name: "Giả lập thanh toán thành công", exact: true }).click(); await expect(portal).not.toBeVisible();
    const settings = await command("GET_TAX_SETTINGS", {});
    await command("SAVE_TAX_SETTINGS", { ...settings, rateBps: 1000, expectedVersion: settings.version });
    await admin.getByRole("button", { name: "Lịch sử hóa đơn", exact: true }).click();
    await admin.locator(".receipt-row").filter({ hasText: "32.400" }).first().click();
    const receipt = admin.getByRole("dialog", { name: "Chi tiết hóa đơn" });
    await expect(receipt).toContainText("VAT (8%)"); await expect(receipt).toContainText("2.400"); await expect(receipt).toContainText("32.400");
    const info = await (await guest.request.get("/api/session")).json();
    const denied = await guest.request.post("/api/command", { headers: { Origin: origin, "X-CSRF-Token": info.csrfToken }, data: { action: "CREATE_CASH_ENTRY", data: {}, commandId: crypto.randomUUID(), scope: info.identity } });
    expect(denied.ok()).toBe(false);
  } finally { await guest.close(); }
});

test("owner records, exports and voids expenses, with responsive report", async () => {
  await admin.getByRole("button", { name: "+ Ghi khoản chi", exact: true }).click();
  const form = admin.getByRole("dialog", { name: "Ghi khoản chi", exact: true });
  await form.getByLabel("Số tiền (VND)").fill("125000");
  await form.getByLabel("Nhóm thu chi").fill("Nguyên liệu kiểm thử");
  await form.getByLabel("Ghi chú").fill("Mua sữa và cà phê");
  await form.getByRole("button", { name: "Lưu bút toán" }).click(); await expect(form).not.toBeVisible();
  const row = admin.locator(".finance-entry").filter({ hasText: "Nguyên liệu kiểm thử" }); await expect(row).toContainText("125.000");
  const expenseMetric = admin.locator(".finance-metrics article").nth(1);
  await expect(expenseMetric).toContainText("125.000");
  const downloadPromise = admin.waitForEvent("download"); await admin.getByRole("button", { name: "Xuất CSV" }).click();
  const download = await downloadPromise; const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("125000"); expect(csv).toContain("Tổng thu");
  await admin.screenshot({ path: "test-results/finance-report-desktop.png", fullPage: true });
  await admin.setViewportSize({ width: 390, height: 844 });
  expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await admin.screenshot({ path: "test-results/finance-report-mobile.png", fullPage: true });
  await row.getByRole("button", { name: /Hủy bút toán/ }).click();
  const cancel = admin.getByRole("dialog", { name: "Hủy bút toán", exact: true });
  await cancel.getByLabel("Lý do hủy").fill("Nhập sai chứng từ");
  await cancel.getByRole("button", { name: "Xác nhận hủy bút toán" }).click(); await expect(cancel).not.toBeVisible();
  await expect(row).toContainText("Đã hủy: Nhập sai chứng từ"); await expect(expenseMetric.locator("strong")).toHaveText(/0\s*₫/);
});

test("uncertain cash entry response retries the same command without duplication", async () => {
  let dropped = false;
  await admin.route("**/api/command", async route => {
    const body = route.request().postDataJSON();
    if (body.action === "CREATE_CASH_ENTRY" && !dropped) { dropped = true; await route.fetch(); await route.abort("connectionreset"); }
    else await route.continue();
  });
  await admin.getByRole("button", { name: "+ Ghi khoản thu", exact: true }).click();
  const form = admin.getByRole("dialog", { name: "Ghi khoản thu", exact: true });
  await form.getByLabel("Số tiền (VND)").fill("50000"); await form.getByLabel("Nhóm thu chi").fill("Thu thử mất kết nối");
  await form.getByRole("button", { name: "Lưu bút toán" }).click();
  await expect(form.getByRole("button", { name: "Kiểm tra và tiếp tục" })).toBeEnabled();
  await form.getByRole("button", { name: "Kiểm tra và tiếp tục" }).click(); await expect(form).not.toBeVisible();
  await expect(admin.locator(".finance-entry").filter({ hasText: "Thu thử mất kết nối" })).toHaveCount(1);
});
