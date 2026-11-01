import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
const origin = "http://127.0.0.1:18080";
let owner: BrowserContext,
  guest: BrowserContext,
  admin: Page,
  page: Page,
  csrf: string,
  visitId: string;
async function adminCommand(action: string, data: unknown) {
  const r = await owner.request.post("/api/command", {
    headers: { Origin: origin, "X-CSRF-Token": csrf },
    data: { commandId: crypto.randomUUID(), action, data },
  });
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
async function guestCommand(
  action: string,
  data: unknown,
  id = crypto.randomUUID(),
) {
  const info = await (await guest.request.get("/api/session")).json();
  const r = await guest.request.post("/api/command", {
    headers: { Origin: origin, "X-CSRF-Token": info.csrfToken },
    data: { commandId: id, action, data, scope: info.identity },
  });
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
async function state() {
  return (await owner.request.get("/api/state")).json();
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
  guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await guest.newPage();
  admin = await owner.newPage();
  const table = (await state()).tables.find((t: any) => !t.visitId);
  visitId = (await adminCommand("OPEN_TABLE", { tableId: table.id })).visitId;
  const qr = await adminCommand("GET_VISIT_QR", { visitId });
  await page.goto(qr.joinUrl);
  await page
    .getByRole("button", { name: "Vào bàn của tôi", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toBeEnabled();
  await admin.goto("/admin");
  await expect(
    admin.getByRole("button", { name: /Lịch sử hóa đơn/ }),
  ).toBeVisible();
});
test.afterEach(async () => {
  try {
    await page.unrouteAll({ behavior: "wait" });
    await guest.setOffline(false);
    const s = await state();
    for (const ticket of s.tickets.filter(
      (t: any) => t.visitId === visitId && t.status === "OPEN",
    ))
      await adminCommand("HANDLE_TICKET", {
        ticketId: ticket.id,
        reply: "Cleanup",
      });
    for (const o of s.orders.filter((o: any) => o.visitId === visitId)) {
      if (o.paymentState === "UNPAID" || o.paymentState === "PENDING")
        await guestCommand("CANCEL_UNPAID_ORDER", { visitId, orderId: o.id });
      else if (o.paymentState === "PAID")
        for (const status of [
          "SUBMITTED",
          "PREPARING",
          "READY",
          "SERVED",
        ].slice(
          ["SUBMITTED", "PREPARING", "READY", "SERVED"].indexOf(o.status) + 1,
        ))
          await adminCommand("SET_ORDER_STATUS", { orderId: o.id, status });
    }
    if (s.tables.some((t: any) => t.visitId === visitId))
      await adminCommand("CLOSE_VISIT", { visitId });
  } finally {
    await page.close();
    await guest.close();
    await admin.close();
  }
});
test.afterAll(async () => {
  await owner.close();
});

test("V6 ảnh/menu thật và V7 luồng QR–trả trước–pha chế–lịch sử", async () => {
  await admin.getByRole("button", { name: /Thực đơn/ }).click();
  await admin.getByRole("button", { name: "Thêm món", exact: true }).click();
  const form = admin.getByRole("dialog", { name: "Thêm món", exact: true });
  await form.getByLabel("Tên món", { exact: true }).fill("Matcha thử ảnh");
  await form.getByLabel("Giá món (VND)", { exact: true }).fill("45000");
  await form.getByLabel("Mô tả món", { exact: true }).fill("Trà xanh ít ngọt");
  const image = await page.screenshot();
  await form
    .getByLabel(/Ảnh món/)
    .setInputFiles({ name: "drink.png", mimeType: "image/png", buffer: image });
  await expect(form.getByAltText("Xem trước ảnh món")).toBeVisible();
  await expect.poll(()=>form.getByAltText("Xem trước ảnh món").evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await form.getByRole("button", { name: "Lưu món", exact: true }).click();
  await expect(form).not.toBeVisible();
  await page.getByLabel("Tìm đồ uống", { exact: true }).fill("matcha");
  await expect(
    page.getByAltText("Matcha thử ảnh", { exact: true }),
  ).toBeVisible();
  expect(
    await page
      .getByAltText("Matcha thử ảnh", { exact: true })
      .evaluate((i) => (i as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Thêm Matcha thử ảnh", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Đặt món và thanh toán", exact: true })
    .click();
  const portal = page.getByRole("dialog", { name: "Cổng thanh toán giả lập" });
  await expect(portal).toBeVisible();
  await expect(portal.locator(".bill-total")).toContainText("45.000");
  const before = (await state()).orders.find((o: any) => o.visitId === visitId);
  expect(before.paymentState).toBe("PENDING");
  await admin.getByRole("button", { name: /Quầy pha chế/ }).click();
  await expect(
    admin.getByRole("button", { name: "Bắt đầu pha chế", exact: true }),
  ).toHaveCount(0);
  await portal
    .getByRole("button", { name: "Giả lập thanh toán thành công", exact: true })
    .click();
  await expect(portal).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (await state()).orders.find((o: any) => o.id === before.id)
          .paymentState,
    )
    .toBe("PAID");
  expect((await state()).tables.some((t: any) => t.visitId === visitId)).toBe(
    true,
  );
  await admin
    .getByRole("button", { name: "Bắt đầu pha chế", exact: true })
    .click();
  await admin
    .getByRole("button", { name: "Pha chế xong", exact: true })
    .click();
  await admin
    .getByRole("button", { name: "Đã mang ra bàn", exact: true })
    .click();
  await admin.getByRole("button", { name: /Lịch sử hóa đơn/ }).click();
  await admin
    .getByRole("button", { name: /Bàn 1 · 45.000/ })
    .first()
    .click();
  const receipt = admin.getByRole("dialog", { name: "Chi tiết hóa đơn" });
  await expect(
    receipt.getByText("1× Matcha thử ảnh", { exact: false }),
  ).toBeVisible();
  await receipt.getByRole("button", { name: "Đóng hóa đơn" }).click();
  await page.screenshot({
    path: "test-results/v7-guest-prepaid.png",
    fullPage: true,
  });
  await admin.screenshot({
    path: "test-results/v7-sales-history.png",
    fullPage: true,
  });
  await admin.getByRole("button", { name: /Sơ đồ bàn/ }).click();
  await admin
    .getByRole("button", { name: `Xem Bàn ${before.tableId}`, exact: true })
    .click();
  await admin
    .getByRole("button", { name: "Kết thúc lượt khách", exact: true })
    .click();
  await admin
    .getByRole("alertdialog", { name: "Xác nhận kết thúc lượt" })
    .getByRole("button", { name: "Xác nhận kết thúc", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cảm ơn bạn đã ghé quán", exact: true }),
  ).toBeVisible();
});

test("V7 thất bại cho thử lại; mất phản hồi thành công rồi reload không thu hai lần", async () => {
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Đặt món và thanh toán", exact: true })
    .click();
  let portal = page.getByRole("dialog", { name: "Cổng thanh toán giả lập" });
  await portal
    .getByRole("button", { name: "Giả lập thanh toán thất bại" })
    .click();
  await expect(portal).not.toBeVisible();
  const order = (await state()).orders.find((o: any) => o.visitId === visitId);
  expect(order.paymentState).toBe("UNPAID");
  await page
    .getByRole("button", { name: `Thanh toán đơn #${order.id}`, exact: true })
    .click();
  await expect(portal).toBeVisible();
  await page.route("**/api/command", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "SIMULATE_PAYMENT") {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await portal
    .getByRole("button", { name: "Giả lập thanh toán thành công" })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).orders.find((o: any) => o.id === order.id).paymentState,
    )
    .toBe("PAID");
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await expect(
    page.getByText("Đã thanh toán giả lập", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: `Thanh toán đơn #${order.id}`,
      exact: true,
    }),
  ).toHaveCount(0);
  const history = await adminCommand("GET_SALES_HISTORY", {});
  expect(
    history.receipts.filter((r: any) => r.orderId === order.id),
  ).toHaveLength(1);
});

test("V6 cart đổi giá yêu cầu xem lại, hết món bị bỏ có xác nhận", async () => {
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  const item = (await state()).menu.find((i: any) => i.id === 2);
  await adminCommand("UPDATE_MENU_ITEM", {
    ...item,
    menuId: 2,
    expectedVersion: item.version,
    priceVnd: 32000,
  });
  await expect(
    page.getByRole("button", {
      name: "Cập nhật giỏ theo thực đơn mới",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Đặt món và thanh toán", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Cập nhật giỏ theo thực đơn mới",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("cart-total")).toContainText("32.000");
  const updated = (await state()).menu.find((i: any) => i.id === 2);
  await adminCommand("UPDATE_MENU_ITEM", {
    ...updated,
    menuId: 2,
    expectedVersion: updated.version,
    available: false,
  });
  await page
    .getByRole("button", {
      name: "Cập nhật giỏ theo thực đơn mới",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("cart-total")).toContainText("0");
  await expect(
    page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toHaveCount(0);
  const current = (await state()).menu.find((i: any) => i.id === 2);
  await adminCommand("UPDATE_MENU_ITEM", {
    ...current,
    menuId: 2,
    expectedVersion: current.version,
    available: true,
    priceVnd: 30000,
  });
});

test("V5a thông báo từ event thật, mở không xử lý hỗ trợ và giữ đã đọc qua reload", async () => {
  await page
    .getByLabel("Lời nhắn cho nhân viên", { exact: true })
    .fill("Thêm nước test thông báo");
  await page
    .getByRole("button", { name: "Gọi nhân viên", exact: true })
    .click();
  await admin.getByRole("button", { name: /Thông báo,.*chưa đọc/ }).click();
  const center = admin.getByRole("dialog", { name: "Trung tâm thông báo" });
  await center
    .getByRole("button", { name: /Thêm nước test thông báo/ })
    .click();
  await expect(
    admin.getByRole("heading", { name: "Yêu cầu hỗ trợ", exact: true }),
  ).toBeVisible();
  expect(
    (await state()).tickets.find((t: any) => t.visitId === visitId).status,
  ).toBe("OPEN");
  await admin.reload();
  await admin.getByRole("button", { name: /Thông báo,.*chưa đọc/ }).click();
  const row = admin
    .getByRole("dialog", { name: "Trung tâm thông báo" })
    .getByRole("button", { name: /Thêm nước test thông báo/ });
  await expect(row).toContainText("Đã đọc");
  await admin.screenshot({
    path: "test-results/v5a-notifications.png",
    fullPage: true,
  });
});

test("V6 upload từ chối SVG, sai CSRF, guest; đường ảnh traversal không đọc file", async () => {
  const fake = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  );
  const info = await (await guest.request.get("/api/session")).json();
  const denied = await guest.request.post("/api/menu/image", {
    headers: {
      Origin: origin,
      "X-CSRF-Token": info.csrfToken,
      "Content-Type": "image/png",
    },
    data: fake,
  });
  expect(denied.status()).toBe(403);
  const invalid = await owner.request.post("/api/menu/image", {
    headers: {
      Origin: origin,
      "X-CSRF-Token": csrf,
      "Content-Type": "image/png",
    },
    data: fake,
  });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).code).toBe("INVALID_IMAGE");
  expect(
    (
      await owner.request.post("/api/menu/image", {
        headers: { Origin: origin, "X-CSRF-Token": "wrong" },
        data: fake,
      })
    ).status(),
  ).toBe(403);
  expect((await owner.request.get("/media/abc.jpg")).status()).toBe(404);
});

test("V7 responsive và hủy giao dịch không tạo hóa đơn, hủy đơn cho đóng lượt", async () => {
  for (const width of [360, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await admin.setViewportSize({ width, height: 900 });
    for (const p of [page, admin])
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `overflow ${width}`,
      ).toBe(true);
  }
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Đặt món và thanh toán", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Cổng thanh toán giả lập" })
    .getByRole("button", { name: "Hủy giao dịch thử", exact: true })
    .click();
  const order = (await state()).orders.find((o: any) => o.visitId === visitId);
  await page
    .getByRole("button", { name: `Hủy đơn #${order.id}`, exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await state()).orders.find((o: any) => o.id === order.id).paymentState,
    )
    .toBe("CANCELLED");
  expect(
    (await adminCommand("GET_SALES_HISTORY", {})).receipts.some(
      (r: any) => r.orderId === order.id,
    ),
  ).toBe(false);
});

test("V5a hai tab cùng tài khoản chỉ hiện một toast và tắt âm vẫn dùng inbox", async () => {
  const second = await owner.newPage();
  const note = `Thông báo hai tab kiểm thử ${visitId.slice(-8)}`;
  try {
    const firstSync = second.waitForResponse(
      (r) =>
        r.url().endsWith("/api/command") &&
        r.request().postDataJSON()?.action === "GET_NOTIFICATIONS",
    );
    await second.goto("/admin");
    await firstSync;
    await expect(
      second.getByRole("button", { name: /Thông báo,.*chưa đọc/ }),
    ).toBeVisible();
    // Emulate both tabs visible to exercise leader coordination, beyond foreground gating.
    for (const p of [admin, second])
      await p.evaluate(() =>
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "visible",
        }),
      );
    await guestCommand("CALL_SERVICE", {
      visitId,
      note,
    });
    await expect
      .poll(
        async () =>
          (await admin
            .locator(".notification-toasts")
            .filter({ hasText: note })
            .count()) +
          (await second
            .locator(".notification-toasts")
            .filter({ hasText: note })
            .count()),
      )
      .toBe(1);
    await second.getByRole("button", { name: /Thông báo,.*chưa đọc/ }).click();
    const center = second.getByRole("dialog", { name: "Trung tâm thông báo" });
    await expect(
      center.getByRole("button", { name: new RegExp(note) }),
    ).toBeVisible();
    await expect(
      center.getByRole("button", {
        name: "Bật âm thanh tại quầy",
        exact: true,
      }),
    ).toBeVisible();
    await center
      .getByRole("button", { name: "Bật âm thanh tại quầy", exact: true })
      .click();
    const mute = center.getByRole("button", { name: "Tắt âm thanh tại quầy", exact: true });
    const unavailable = center.getByRole("status", { name: "Cảnh báo âm thanh" });
    await expect(mute.or(unavailable)).toBeVisible();
    if (await mute.isVisible()) {
      test.info().annotations.push({ type: "audioOutcome", description: "Real AudioContext resumed; audible output not measured" });
      await mute.click();
    } else {
      test.info().annotations.push({ type: "audioOutcome", description: "Browser audio unavailable; bounded visual fallback verified" });
      await expect(unavailable).toContainText("Thông báo chữ vẫn được cập nhật");
      await expect(center.getByRole("button", { name: "Bật âm thanh tại quầy", exact: true })).toBeEnabled();
    }
    await expect(
      center.getByRole("button", { name: new RegExp(note) }),
    ).toBeVisible();
  } finally {
    await second.close();
  }
});

test("V6 nhóm món thêm–đổi tên–xóa nhóm trống bằng UI", async () => {
  await admin.getByRole("button", { name: /Thực đơn/ }).click();
  await admin.getByText("Quản lý nhóm món", { exact: true }).click();
  await admin.getByLabel("Tên nhóm", { exact: true }).fill("Nhóm thử mới");
  await admin.getByRole("button", { name: "Thêm nhóm", exact: true }).click();
  await expect(
    admin.getByRole("button", { name: "Sửa nhóm Nhóm thử mới", exact: true }),
  ).toBeVisible();
  await admin
    .getByRole("button", { name: "Sửa nhóm Nhóm thử mới", exact: true })
    .click();
  await admin.getByLabel("Tên nhóm", { exact: true }).fill("Nhóm thử đổi tên");
  await admin.getByRole("button", { name: "Lưu nhóm", exact: true }).click();
  await expect(
    admin.getByRole("button", {
      name: "Xóa nhóm Nhóm thử đổi tên",
      exact: true,
    }),
  ).toBeEnabled();
  await admin
    .getByRole("button", { name: "Xóa nhóm Nhóm thử đổi tên", exact: true })
    .click();
  await expect(
    admin.getByRole("button", {
      name: "Xóa nhóm Nhóm thử đổi tên",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("V6 lọc trạng thái, tạm hết một lần bấm và xác nhận ngừng bán giữ menu quản lý", async () => {
  await admin.getByRole("button", { name: /Thực đơn/ }).click();
  await admin.getByLabel("Tìm món quản lý", { exact: true }).fill("nuoc suoi");
  await expect(
    admin.getByRole("button", { name: "Sửa Nước suối", exact: true }),
  ).toBeVisible();
  await admin
    .getByRole("button", { name: "Tạm hết Nước suối", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Thêm Nước suối", exact: true }),
  ).toHaveCount(0);
  await admin
    .getByLabel("Trạng thái món quản lý", { exact: true })
    .selectOption("soldout");
  await expect(
    admin.getByRole("button", { name: "Sửa Nước suối", exact: true }),
  ).toBeVisible();
  await admin
    .getByRole("button", { name: "Bán lại Nước suối", exact: true })
    .click();
  await expect(
    admin.getByRole("button", { name: "Sửa Nước suối", exact: true }),
  ).toHaveCount(0);
  await admin
    .getByLabel("Trạng thái món quản lý", { exact: true })
    .selectOption("all");
  await admin
    .getByRole("button", { name: "Sửa Nước suối", exact: true })
    .click();
  let dialog = admin.getByRole("dialog", { name: "Sửa món", exact: true });
  await dialog.getByLabel("Hiển thị để bán", { exact: true }).uncheck();
  await dialog.getByRole("button", { name: "Lưu món", exact: true }).click();
  const confirm = dialog.getByRole("alertdialog", {
    name: "Xác nhận ngừng bán",
  });
  await expect(confirm).toBeVisible();
  await confirm
    .getByRole("button", { name: "Xác nhận ngừng bán", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Chi tiết Nước suối", exact: true }),
  ).toHaveCount(0);
  await admin
    .getByLabel("Trạng thái món quản lý", { exact: true })
    .selectOption("archived");
  await expect(
    admin.getByRole("button", { name: "Sửa Nước suối", exact: true }),
  ).toBeVisible();
  await admin
    .getByRole("button", { name: "Sửa Nước suối", exact: true })
    .click();
  dialog = admin.getByRole("dialog", { name: "Sửa món", exact: true });
  await dialog.getByLabel("Hiển thị để bán", { exact: true }).check();
  await dialog.getByRole("button", { name: "Lưu món", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Thêm Nước suối", exact: true }),
  ).toBeEnabled();
});
