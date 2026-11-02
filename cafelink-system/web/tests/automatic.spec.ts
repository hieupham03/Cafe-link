import {
  openGuestZone,
  openGuestPayment,
  acceptGuestOrders,
} from "./guest-navigation";
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
async function leaveWhenClear(context: BrowserContext) {
  const response = await context.request.get("/api/session");
  if (!response.ok()) return;
  const info = await response.json();
  if (info.identity.role !== "GUEST") return;
  const snapshot = await state(context);
  for (const ticket of snapshot.tickets.filter(
    (item: any) =>
      item.status === "OPEN" && item.visitId === info.identity.visitId,
  ))
    await command(owner, "HANDLE_TICKET", {
      ticketId: ticket.id,
      reply: "E2E cleanup",
    });
  for (const order of snapshot.orders.filter(
    (item: any) => item.visitId === info.identity.visitId,
  )) {
    if (["UNPAID", "PENDING"].includes(order.paymentState ?? ""))
      await command(context, "CANCEL_UNPAID_ORDER", {
        visitId: info.identity.visitId,
        orderId: order.id,
      });
    else if (
      order.paymentState === "PAID" &&
      order.acceptanceState === "WAITING"
    )
      await command(owner, "ACCEPT_ORDER", { orderId: order.id });
    if (
      order.paymentState === "PAID" &&
      ["SUBMITTED", "PREPARING", "READY"].includes(order.status)
    ) {
      const next = ["SUBMITTED", "PREPARING", "READY"];
      for (const status of next.slice(next.indexOf(order.status)))
        await command(owner, "SET_ORDER_STATUS", {
          orderId: order.id,
          status: status === "SUBMITTED" ? "PREPARING" : status === "PREPARING" ? "READY" : "SERVED",
        });
    }
  }
  await context.request.post("/api/guest/leave", {
    headers: { Origin: origin },
    data: {},
  });
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
  await openGuestZone(page, "Thực đơn");
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
    await leaveWhenClear(context);
    await context.close();
  }
  await admin.close();
});
test.afterAll(async () => {
  await owner.close();
});

test("Admin đăng nhập tạm ngưng QR; Mở tất cả bàn mới tải lại QR", async ({
  browser,
}) => {
  const login = await other.request.post("/api/login", {
    headers: { Origin: origin },
    data: { username: "admin", password: "CafeLink@123" },
  });
  expect(login.ok(), await login.text()).toBe(true);
  const snapshot = await state(other);
  expect(snapshot.tables.every((table: any) => !table.acceptingOrders)).toBe(true);
  expect(snapshot.tables[0].activeSessions).toBeGreaterThan(0);
  await admin.reload();
  await expect(admin.locator(".table-inline-qr svg")).toHaveCount(0);
  await expect(
    admin.locator(".table-card .pill").filter({ hasText: "Tạm ngưng" }).first(),
  ).toBeVisible();

  const visitor = await browser.newContext();
  const denied = await visitor.request.post("/api/guest/join", {
    headers: { Origin: origin },
    data: { grant: qr.grant, table: true },
  });
  expect(denied.status()).toBe(409);
  expect((await denied.json()).code).toBe("TABLE_PAUSED");

  expect(await command(guest, "GET_OWN_TABLE_QR", {})).toHaveProperty("grant");
  await admin
    .getByRole("button", { name: "Mở tất cả bàn", exact: true })
    .click();
  await expect(admin.locator(".table-inline-qr svg")).toHaveCount(6);
  await visitor.close();
});

test("Quản lý kết thúc phiên bỏ quên và bàn trở về trống đang nhận đơn", async () => {
  await admin.getByRole("button", { name: "Xem Bàn 1", exact: true }).click();
  const details = admin.getByRole("dialog", { name: "Chi tiết Bàn 1" });
  await details.getByRole("button", { name: "Kết thúc phiên", exact: true }).click();
  const confirmation = admin.getByRole("alertdialog", {
    name: "Xác nhận kết thúc phiên",
  });
  await confirmation
    .getByRole("button", { name: "Xác nhận kết thúc phiên", exact: true })
    .click();

  await expect
    .poll(async () => (await state()).tables[0].activeSessions)
    .toBe(0);
  await expect(
    admin.getByText("Bàn trống · Đang nhận đơn").first(),
  ).toBeVisible();
  await expect(admin.locator(".table-inline-qr svg")).toHaveCount(6);
});

test("tạm ngưng tất cả bàn chặn khách mới nhưng khách hiện tại vẫn gọi món", async () => {
  await admin.setViewportSize({ width: 390, height: 844 });
  expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await admin.getByRole("button", { name: "Tạm ngưng tất cả bàn", exact: true }).click();
  const dialog = admin.getByRole("alertdialog", { name: "Tạm ngưng tất cả bàn" });
  await expect(dialog.getByRole("button", { name: "Xác nhận tạm ngưng", exact: true })).toBeVisible();
  expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole("button", { name: "Xác nhận tạm ngưng", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await state()).tables.every((table: any) => !table.acceptingOrders)).toBe(true);
  const denied = await other.request.post("/api/guest/join", { headers: { Origin: origin }, data: { grant: qr.grant, table: true } });
  expect(denied.status()).toBe(409);
  expect((await denied.json()).code).toBe("TABLE_PAUSED");
  const visitId = (await (await guest.request.get("/api/session")).json()).identity.visitId;
  const order = await command(guest, "PLACE_ORDER", { visitId, items: [{ menuId: 2, quantity: 1, expectedVersion: 1, expectedPriceVnd: 30000 }] });
  expect(order.orderId).toBeTruthy();
  await command(guest, "CANCEL_UNPAID_ORDER", { visitId, orderId: order.orderId });
});

test("kết thúc tất cả phiên báo bàn còn đơn và chỉ đóng khi mọi bàn đã xử lý", async () => {
  const secondQr = await command(owner, "GET_TABLE_QR", { tableId: 2 });
  const joined = await other.request.post("/api/guest/join", { headers: { Origin: origin }, data: { grant: secondQr.grant, table: true } });
  expect(joined.ok()).toBe(true);
  const visitId = (await (await guest.request.get("/api/session")).json()).identity.visitId;
  const order = await command(guest, "PLACE_ORDER", { visitId, items: [{ menuId: 2, quantity: 1, expectedVersion: 1, expectedPriceVnd: 30000 }] });
  await admin.getByRole("button", { name: "Kết thúc tất cả phiên QR", exact: true }).click();
  let dialog = admin.getByRole("alertdialog", { name: "Kết thúc tất cả phiên QR" });
  await expect(dialog.getByRole("alert")).toContainText("Bàn 1");
  await expect(dialog.getByRole("button", { name: "Xác nhận kết thúc tất cả phiên" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
  await command(guest, "CANCEL_UNPAID_ORDER", { visitId, orderId: order.orderId });
  await admin.getByRole("button", { name: "Kết thúc tất cả phiên QR", exact: true }).click();
  dialog = admin.getByRole("alertdialog", { name: "Kết thúc tất cả phiên QR" });
  await expect(dialog.getByText(/Cần xử lý đơn/)).toHaveCount(0);
  await expect(dialog).toContainText("2 phiên khách tại 2 bàn");
  await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
  await admin.getByRole("button", { name: "Kết thúc tất cả phiên QR", exact: true }).click();
  dialog = admin.getByRole("alertdialog", { name: "Kết thúc tất cả phiên QR" });
  await dialog.getByRole("button", { name: "Xác nhận kết thúc tất cả phiên", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await state()).tables.reduce((n: number, table: any) => n + table.activeSessions, 0)).toBe(0);
  expect((await guest.request.get("/api/session")).status()).toBe(401);
  expect((await other.request.get("/api/session")).status()).toBe(401);
  await expect(admin.locator(".table-inline-qr svg")).toHaveCount(6);
});

test("mất phản hồi kết thúc tất cả phiên được đối chiếu, không đóng khách đến sau", async () => {
  let intercepted = false;
  await admin.route("**/api/command", async route => {
    if (route.request().postDataJSON()?.action !== "END_ALL_TABLE_SESSIONS" || intercepted) return route.continue();
    intercepted = true;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort("failed");
  });
  await admin.getByRole("button", { name: "Kết thúc tất cả phiên QR", exact: true }).click();
  const dialog = admin.getByRole("alertdialog", { name: "Kết thúc tất cả phiên QR" });
  await dialog.getByRole("button", { name: "Xác nhận kết thúc tất cả phiên", exact: true }).click();
  await expect.poll(() => intercepted).toBe(true);
  const next = await join(other);
  await admin.unrouteAll();
  await admin.reload();
  await expect.poll(async () => admin.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("cafelink-staff-journal", 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { return await new Promise<string | undefined>((resolve, reject) => { const r = db.transaction("commands").objectStore("commands").getAll(); r.onsuccess = () => resolve(r.result.filter((entry: any) => entry.action === "END_ALL_TABLE_SESSIONS").at(-1)?.status); r.onerror = () => reject(r.error); }); }
    finally { db.close(); }
  })).toBe("ACCEPTED");
  expect((await (await other.request.get("/api/session")).json()).identity.visitId).toBe(next.identity.visitId);
  expect((await state()).tables[0].activeSessions).toBe(1);
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

test("Đặt, thanh toán, giao đồ vẫn giữ phiên; chỉ rời phiên mới trả bàn", async () => {
  const before = await (await guest.request.get("/api/session")).json();
  await openGuestZone(page, "Thực đơn");
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await openGuestZone(page, "Giỏ hàng");
  await page
    .getByRole("button", { name: "Gửi đơn gọi món", exact: true })
    .click();
  await openGuestPayment(owner, page);
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
  ).toHaveCount(0);
  await expect.poll(async () => (await state()).tables[0].activeSessions).toBeGreaterThan(0);
  await page.screenshot({
    path: "test-results/auto-completed.png",
    fullPage: true,
  });
  await openGuestZone(page, "Thực đơn");
  await expect(
    page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toBeEnabled();
  const after = await (await guest.request.get("/api/session")).json();
  expect(after.identity.visitId).toBe(before.identity.visitId);
  expect((await state(guest)).orders).toHaveLength(1);
  await page.getByRole("button", { name: "Rời phiên", exact: true }).click();
  await expect
    .poll(async () => (await state()).tables[0].activeSessions)
    .toBe(0);
  await expect(
    admin.getByText("Bàn trống · Đang nhận đơn").first(),
  ).toBeVisible();
});

test("Tạm dừng chỉ chặn khách mới; phiên đang dùng vẫn gọi món", async () => {
  await command(owner, "SET_TABLE_ACCEPTING", { tableId: 1, enabled: 0 });
  const denied = await other.request.post("/api/guest/join", {
    headers: { Origin: origin },
    data: { grant: qr.grant, table: true },
  });
  expect(denied.status()).toBe(409);
  expect((await denied.json()).code).toBe("TABLE_PAUSED");
  await openGuestZone(page, "Thực đơn");
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await openGuestZone(page, "Giỏ hàng");
  await expect(page.getByTestId("cart-total")).toContainText("30.000");
  await command(owner, "SET_TABLE_ACCEPTING", { tableId: 1, enabled: 1 });
  expect((await join(other)).identity.visitId).toBeTruthy();
});

test("Link đặt món mở cùng hồ sơ quản lý giải thích đổi trình duyệt và giữ nguyên phiên", async ({
  browserName,
}) => {
  // Playwright supports these permission names only in Chromium. For other
  // engines observe the argument only after the real browser write succeeds.
  if (browserName === "chromium")
    await owner.grantPermissions(["clipboard-read", "clipboard-write"]);
  async function observeClipboard(current: Page) {
    if (browserName === "chromium") return;
    await current.evaluate(() => {
      const write = navigator.clipboard.writeText.bind(navigator.clipboard);
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: async (text: string) => {
          await write(text);
          (window as Window & { copiedLink?: string }).copiedLink = text;
        },
      });
    });
  }
  async function copiedLink(current: Page) {
    return browserName === "chromium"
      ? current.evaluate(() => navigator.clipboard.readText())
      : current.evaluate(
          () => (window as Window & { copiedLink?: string }).copiedLink,
        );
  }
  const before = await (await owner.request.get("/api/session")).json();
  const beforeTables = (await state()).tables;
  await admin.getByRole("button", { name: "Xem Bàn 1", exact: true }).click();
  await expect(
    admin.getByRole("link", { name: "Mở trang đặt món Bàn 1", exact: true }),
  ).toBeVisible();
  const popupPromise = admin.waitForEvent("popup");
  await admin
    .getByRole("link", { name: "Mở trang đặt món Bàn 1", exact: true })
    .click();
  const popup = await popupPromise;
  try {
    await expect(
      popup.getByRole("heading", {
        name: "Bạn đang đăng nhập quản lý",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      popup.getByRole("button", { name: "Mở tất cả bàn", exact: true }),
    ).toHaveCount(0);
    await observeClipboard(admin);
    await admin
      .getByRole("button", { name: "Sao chép link đặt món", exact: true })
      .click();
    await expect.poll(() => copiedLink(admin)).toBe(qr.joinUrl);
    await expect(
      popup.getByText(/Khách vui lòng quét mã QR bằng điện thoại/),
    ).toBeVisible();
    await expect(popup.getByText(/Ctrl\+Shift\+N/)).toHaveCount(0);
    await expect(popup).toHaveURL(origin + "/join");
    await expect(popup.getByLabel("Link đặt món", { exact: true })).toHaveValue(
      qr.joinUrl,
    );
    await observeClipboard(popup);
    await popup
      .getByRole("button", { name: "Sao chép link đặt món", exact: true })
      .click();
    await expect.poll(() => copiedLink(popup)).toBe(qr.joinUrl);
    const copied = (await copiedLink(popup))!;
    expect(
      await popup.evaluate(() =>
        Object.values(localStorage).some((v) => v.includes("#table=")),
      ),
    ).toBe(false);
    await popup.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: () => Promise.reject(new Error("Permission denied")),
      });
    });
    await popup
      .getByRole("button", { name: "Sao chép link đặt món", exact: true })
      .click();
    await expect(popup.getByRole("alert")).toContainText(
      "Chọn ô link bên dưới",
    );
    const fresh = await other.newPage();
    await fresh.goto(copied);
    await fresh
      .getByRole("button", { name: "Vào bàn của tôi", exact: true })
      .click();
    await expect(
      fresh.getByRole("heading", { name: "Bàn 1", exact: true }),
    ).toBeVisible();
    const current = await (await owner.request.get("/api/session")).json();
    expect(current.identity).toEqual(before.identity);
    expect(current.csrfToken).toBe(before.csrfToken);
    expect((await state()).tables[0].activeSessions).toBe(
      beforeTables[0].activeSessions + 1,
    );
    await expect(
      admin.getByRole("button", { name: "Mở tất cả bàn", exact: true }),
    ).toBeEnabled();
    await popup.screenshot({
      path: "test-results/qr-admin-role-conflict.png",
      fullPage: true,
    });
    await popup.reload();
    await expect(
      popup.getByRole("heading", {
        name: "Bạn đang đăng nhập quản lý",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      popup.getByRole("button", { name: "Sao chép link đặt món", exact: true }),
    ).toHaveCount(0);
    await popup.goto("/guest");
    await expect(
      popup.getByRole("heading", {
        name: "Bạn đang đăng nhập quản lý",
        exact: true,
      }),
    ).toBeVisible();
    await popup
      .getByRole("link", { name: "Về màn hình quản lý", exact: true })
      .click();
    await expect(
      popup.getByRole("button", { name: "Mở tất cả bàn", exact: true }),
    ).toBeEnabled();
  } finally {
    await popup.close();
  }
});

test("Mất phản hồi đặt món ở phiên riêng vẫn đối chiếu được, không tạo đơn trùng", async () => {
  const visitId = (await (await guest.request.get("/api/session")).json())
    .identity.visitId;
  await openGuestZone(page, "Thực đơn");
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await openGuestZone(page, "Giỏ hàng");
  await expect(page.getByTestId("cart-total")).toContainText("30.000");
  await page.route("**/api/command", async (route) => {
    if (route.request().postDataJSON().action === "PLACE_ORDER") {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await openGuestZone(page, "Giỏ hàng");
  await page
    .getByRole("button", { name: "Gửi đơn gọi món", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).orders.filter((o: any) => o.visitId === visitId).length,
    )
    .toBe(1);
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await openGuestZone(page, "Thực đơn");
  await expect(
    page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toBeEnabled();
  expect(
    (await state()).orders.filter((o: any) => o.visitId === visitId),
  ).toHaveLength(1);
});
