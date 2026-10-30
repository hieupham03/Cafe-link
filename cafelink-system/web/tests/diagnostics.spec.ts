import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("Tài khoản", { exact: true }).fill("admin");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("CafeLink@123");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("button", { name: "Chẩn đoán hệ thống", exact: false }).click();
  await expect(page.getByRole("status").filter({ hasText: "Hệ thống sẵn sàng phục vụ" })).toBeVisible();
}

test("quản lý xem số liệu thật, lọc mã yêu cầu và không giữ payload riêng tư", async ({ page }) => {
  await login(page);
  const session = await (await page.request.get("/api/session")).json();
  const id = crypto.randomUUID();
  const response = await page.request.post("/api/command", {
    headers: { Origin: "http://127.0.0.1:18080", "X-CSRF-Token": session.csrfToken },
    data: { commandId: id, action: "GET_SALES_HISTORY", data: { note: "PRIVATE_PAYLOAD" }, scope: session.identity },
  });
  expect(response.ok(), await response.text()).toBe(true);
  await page.getByRole("button", { name: "Làm mới chẩn đoán" }).click();
  await expect(page.getByRole("button", { name: "Làm mới chẩn đoán" })).toBeEnabled();
  await page.getByLabel("Tìm mã yêu cầu, lệnh hoặc kết quả").fill(id);
  const history = page.getByRole("region", { name: "Lịch sử yêu cầu TCP" });
  await expect(history.getByRole("row")).toHaveCount(2);
  await expect(history).toContainText("GET_SALES_HISTORY");
  await expect(history).toContainText("OK");
  await expect(history).not.toContainText("PRIVATE_PAYLOAD");
  await page.getByLabel("Tìm mã yêu cầu, lệnh hoặc kết quả").clear();
  await page.screenshot({ path: "test-results/diagnostics-desktop.png", fullPage: true });
});

test("lỗi cập nhật giữ số liệu cũ nhưng cảnh báo rõ, thử lại phục hồi được", async ({ page }) => {
  await login(page);
  await page.route("**/api/admin/diagnostics", (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ code: "CORE_UNAVAILABLE", message: "TCP Core tạm mất kết nối." }),
  }));
  await page.getByRole("button", { name: "Làm mới chẩn đoán" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Chưa cập nhật được chẩn đoán" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Dữ liệu lần kiểm trước" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Hệ thống sẵn sàng phục vụ" })).toHaveCount(0);
  await expect(page.getByText("Kết nối TCP đang mở", { exact: true })).toBeVisible();
  await page.unroute("**/api/admin/diagnostics");
  await page.getByRole("button", { name: "Làm mới chẩn đoán" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Hệ thống sẵn sàng phục vụ" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Chưa cập nhật được chẩn đoán" })).toHaveCount(0);
});

test("màn hình nhỏ không tràn ngang và ngừng lấy chẩn đoán khi rời trang", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/diagnostics-mobile.png", fullPage: true });
  let requests = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/admin/diagnostics")) requests++; });
  await page.getByRole("button", { name: "Sơ đồ bàn", exact: false }).click();
  await page.waitForTimeout(5500);
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Chẩn đoán hệ thống", exact: false }).click();
  await expect(page.getByRole("status").filter({ hasText: "Hệ thống sẵn sàng phục vụ" })).toBeVisible();
  expect(requests).toBeGreaterThan(0);
});

test("khách chưa đăng nhập không thể đọc endpoint chẩn đoán", async ({ request }) => {
  expect((await request.get("/api/admin/diagnostics")).status()).toBe(401);
  const ready = await request.get("/api/ready");
  expect(ready.status()).toBe(200);
  expect((await ready.json()).status).toBe("READY");
});
