import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
const origin = "http://127.0.0.1:18080";
let owner: BrowserContext,
  guest: BrowserContext,
  other: BrowserContext,
  admin: Page,
  page: Page,
  csrf: string,
  qr: any;
async function command(
  context: BrowserContext,
  action: string,
  data: unknown,
  id = crypto.randomUUID(),
) {
  const info = await (await context.request.get("/api/session")).json();
  const response = await context.request.post("/api/command", {
    headers: { Origin: origin, "X-CSRF-Token": info.csrfToken },
    data: { commandId: id, action, data, scope: info.identity },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function state(context = owner) {
  return (await context.request.get("/api/state")).json();
}
async function join(context: BrowserContext) {
  const response = await context.request.post("/api/guest/join", {
    headers: { Origin: origin },
    data: { grant: qr.grant, table: true },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
test.beforeAll(async ({ browser }) => {
  owner = await browser.newContext();
  const r = await owner.request.post("/api/login", {
    headers: { Origin: origin },
    data: { username: "admin", password: "CafeLink@123" },
  });
  expect(r.ok()).toBe(true);
  csrf = (await r.json()).csrfToken;
});
test.beforeEach(async ({ browser }) => {
  await command(owner, "OPEN_ALL_TABLES", {});
  qr = await command(owner, "GET_TABLE_QR", { tableId: 1 });
  guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  other = await browser.newContext();
  page = await guest.newPage();
  admin = await owner.newPage();
  await page.goto(qr.joinUrl);
  await page
    .getByRole("button", { name: "Vào bàn của tôi", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toBeEnabled();
  await admin.goto("/admin");
  await expect(
    admin.getByRole("button", { name: "Mở tất cả bàn", exact: true }),
  ).toBeEnabled();
});
test.afterEach(async () => {
  for (const context of [guest, other]) {
    await context.request.post("/api/guest/leave", {
      headers: { Origin: origin },
      data: {},
    });
    await context.close();
  }
  await admin.close();
});
test.afterAll(async () => {
  await owner.close();
});

test("QR cố định, mở toàn quán và hai khách cùng bàn có đơn riêng", async () => {
  const before = await (await guest.request.get("/api/session")).json(),
    second = await join(other);
  expect(second.identity.visitId).not.toBe(before.identity.visitId);
  await admin
    .getByRole("button", { name: "Mở tất cả bàn", exact: true })
    .click();
  await admin.getByRole("button", { name: "Xem Bàn 1", exact: true }).click();
  await expect(
    admin.getByRole("heading", { name: "Quét QR đặt món · Bàn 1" }),
  ).toBeVisible();
  await expect(
    admin.getByRole("button", { name: "Mở lượt khách", exact: true }),
  ).toHaveCount(0);
  const download = admin.waitForEvent("download");
  await admin.getByRole("button", { name: "Tải QR bàn", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("cafelink-ban-1.svg");
  expect((await command(owner, "GET_TABLE_QR", { tableId: 1 })).joinUrl).toBe(
    qr.joinUrl,
  );
  const visitId = before.identity.visitId;
  await command(guest, "PLACE_ORDER", {
    visitId,
    items: [
      { menuId: 2, quantity: 1, expectedVersion: 1, expectedPriceVnd: 30000 },
    ],
  });
  await command(guest, "CALL_SERVICE", { visitId, note: "Riêng điện thoại A" });
  expect((await state(other)).orders).toHaveLength(0);
  expect((await state(other)).tickets).toHaveLength(0);
  expect((await join(guest)).identity.visitId).toBe(visitId);
  expect((await state()).tables).toHaveLength(6);
  const newPhone = await other.newPage();
  await newPhone.goto("/guest");
  await expect(
    newPhone.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toBeEnabled();
  await admin.screenshot({
    path: "test-results/auto-table-qr.png",
    fullPage: true,
  });
  await newPhone.screenshot({
    path: "test-results/auto-private-mobile.png",
    fullPage: true,
  });
});

test("Đặt, thanh toán, giao đồ và tự kết thúc; đặt tiếp không cần nhân viên mở bàn", async () => {
  const before = await (await guest.request.get("/api/session")).json();
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Đặt món và thanh toán", exact: true })
    .click();
  const portal = page.getByRole("dialog", { name: "Cổng thanh toán giả lập" });
  await expect(portal).toBeVisible();
  await portal
    .getByRole("button", { name: "Giả lập thanh toán thành công", exact: true })
    .click();
  await expect(portal).not.toBeVisible();
  const order = (await state(guest)).orders[0];
  expect(order.paymentState).toBe("PAID");
  for (const status of ["PREPARING", "READY", "SERVED"])
    await command(owner, "SET_ORDER_STATUS", { orderId: order.id, status });
  await expect(
    page.getByRole("heading", { name: "Cảm ơn bạn đã ghé quán", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bắt đầu lần đặt mới", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/auto-completed.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Bắt đầu lần đặt mới", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toBeEnabled();
  const after = await (await guest.request.get("/api/session")).json();
  expect(after.identity.visitId).not.toBe(before.identity.visitId);
  expect((await state(guest)).orders).toHaveLength(0);
  const stale = await guest.request.post("/api/command", {
    headers: { Origin: origin, "X-CSRF-Token": after.csrfToken },
    data: {
      commandId: crypto.randomUUID(),
      action: "GET_OWN_TABLE_QR",
      data: {},
      scope: before.identity,
    },
  });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).code).toBe("SCOPE_CHANGED");
});

test("Tạm dừng chỉ chặn khách mới; phiên đang dùng vẫn gọi món", async () => {
  await command(owner, "SET_TABLE_ACCEPTING", { tableId: 1, enabled: 0 });
  const denied = await other.request.post("/api/guest/join", {
    headers: { Origin: origin },
    data: { grant: qr.grant, table: true },
  });
  expect(denied.status()).toBe(409);
  expect((await denied.json()).code).toBe("TABLE_PAUSED");
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await expect(page.getByTestId("cart-total")).toContainText("30.000");
  await command(owner, "SET_TABLE_ACCEPTING", { tableId: 1, enabled: 1 });
  expect((await join(other)).identity.visitId).toBeTruthy();
});

test("Link đặt món mở cùng hồ sơ quản lý giải thích đổi trình duyệt và giữ nguyên phiên", async ({ browserName }) => {
  // Playwright supports these permission names only in Chromium. For other
  // engines observe the argument only after the real browser write succeeds.
  if (browserName === "chromium") await owner.grantPermissions(["clipboard-read", "clipboard-write"]);
  async function observeClipboard(current: Page) {
    if (browserName === "chromium") return;
    await current.evaluate(() => {
      const write = navigator.clipboard.writeText.bind(navigator.clipboard);
      Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: async (text: string) => {
        await write(text);
        (window as Window & { copiedLink?: string }).copiedLink = text;
      } });
    });
  }
  async function copiedLink(current: Page) {
    return browserName === "chromium" ? current.evaluate(() => navigator.clipboard.readText())
      : current.evaluate(() => (window as Window & { copiedLink?: string }).copiedLink);
  }
  const before = await (await owner.request.get("/api/session")).json();
  const beforeTables = (await state()).tables;
  await admin.getByRole("button", { name: "Xem Bàn 1", exact: true }).click();
  await expect(admin.getByRole("link", { name: "Mở trang đặt món Bàn 1", exact: true })).toBeVisible();
  const popupPromise = admin.waitForEvent("popup");
  await admin.getByRole("link", { name: "Mở trang đặt món Bàn 1", exact: true }).click();
  const popup = await popupPromise;
  try {
    await expect(popup.getByRole("heading", { name: "Bạn đang đăng nhập quản lý", exact: true })).toBeVisible();
    await expect(popup.getByRole("button", { name: "Mở tất cả bàn", exact: true })).toHaveCount(0);
    await observeClipboard(admin);
    await admin.getByRole("button", { name: "Sao chép link đặt món", exact: true }).click();
    await expect.poll(() => copiedLink(admin)).toBe(qr.joinUrl);
    await expect(popup.getByText(/Ctrl\+Shift\+N/)).toBeVisible();
    await expect(popup).toHaveURL(origin + "/join");
    await expect(popup.getByLabel("Link đặt món", { exact: true })).toHaveValue(qr.joinUrl);
    await observeClipboard(popup);
    await popup.getByRole("button", { name: "Sao chép link đặt món", exact: true }).click();
    await expect.poll(() => copiedLink(popup)).toBe(qr.joinUrl);
    const copied = (await copiedLink(popup))!;
    expect(await popup.evaluate(() => Object.values(localStorage).some(v => v.includes("#table=")))).toBe(false);
    await popup.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: () => Promise.reject(new Error("Permission denied")) });
    });
    await popup.getByRole("button", { name: "Sao chép link đặt món", exact: true }).click();
    await expect(popup.getByRole("alert")).toContainText("Chọn ô link bên dưới");
    const fresh = await other.newPage();
    await fresh.goto(copied);
    await fresh.getByRole("button", { name: "Vào bàn của tôi", exact: true }).click();
    await expect(fresh.getByRole("heading", { name: "Bàn 1", exact: true })).toBeVisible();
    const current = await (await owner.request.get("/api/session")).json();
    expect(current.identity).toEqual(before.identity);
    expect(current.csrfToken).toBe(before.csrfToken);
    expect((await state()).tables[0].activeSessions).toBe(beforeTables[0].activeSessions + 1);
    await expect(admin.getByRole("button", { name: "Mở tất cả bàn", exact: true })).toBeEnabled();
    await popup.screenshot({ path: "test-results/qr-admin-role-conflict.png", fullPage: true });
    await popup.reload();
    await expect(popup.getByRole("heading", { name: "Bạn đang đăng nhập quản lý", exact: true })).toBeVisible();
    await expect(popup.getByRole("button", { name: "Sao chép link đặt món", exact: true })).toHaveCount(0);
    await popup.goto("/guest");
    await expect(popup.getByRole("heading", { name: "Bạn đang đăng nhập quản lý", exact: true })).toBeVisible();
    await popup.getByRole("link", { name: "Về màn hình quản lý", exact: true }).click();
    await expect(popup.getByRole("button", { name: "Mở tất cả bàn", exact: true })).toBeEnabled();
  } finally {
    await popup.close();
  }
});

test("Mất phản hồi đặt món ở phiên riêng vẫn đối chiếu được, không tạo đơn trùng", async () => {
  const visitId = (await (await guest.request.get("/api/session")).json())
    .identity.visitId;
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await expect(page.getByTestId("cart-total")).toContainText("30.000");
  await page.route("**/api/command", async (route) => {
    if (route.request().postDataJSON().action === "PLACE_ORDER") {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Đặt món và thanh toán", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).orders.filter((o: any) => o.visitId === visitId).length,
    )
    .toBe(1);
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toBeEnabled();
  expect(
    (await state()).orders.filter((o: any) => o.visitId === visitId),
  ).toHaveLength(1);
});
