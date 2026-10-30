import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
const origin = "http://127.0.0.1:18080";
let owner: BrowserContext,
  guest: BrowserContext,
  page: Page,
  csrf: string,
  visitId: string;
async function command(action: string, data: unknown) {
  const r = await owner.request.post("/api/command", {
    headers: { Origin: origin, "X-CSRF-Token": csrf },
    data: { commandId: crypto.randomUUID(), action, data },
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
test.afterAll(async () => {
  await owner.request.post("/api/logout", {
    headers: { Origin: origin, "X-CSRF-Token": csrf },
    data: {},
  });
  await owner.close();
});
test.beforeEach(async ({ browser }) => {
  guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await guest.newPage();
  const table = (await state()).tables.find(
    (t: { visitId?: string }) => !t.visitId,
  );
  visitId = (await command("OPEN_TABLE", { tableId: table.id })).visitId;
  const qr = await command("GET_VISIT_QR", { visitId });
  await page.goto(qr.joinUrl);
  await page
    .getByRole("button", { name: "Vào bàn của tôi", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toBeEnabled();
});
test.afterEach(async () => {
  try {
    await guest.setOffline(false);
    let s = await state();
    for (const t of s.tickets.filter(
      (t: { visitId: string; status: string }) =>
        t.visitId === visitId && t.status === "OPEN",
    ))
      await command("HANDLE_TICKET", {
        ticketId: t.id,
        reply: "Fixture cleanup",
      });
    const orders = s.orders.filter(
      (o: { visitId: string }) => o.visitId === visitId,
    );
    for (const o of orders)
      for (const status of ["SUBMITTED", "PREPARING", "READY", "SERVED"].slice(
        ["SUBMITTED", "PREPARING", "READY", "SERVED"].indexOf(o.status) + 1,
      ))
        await command("SET_ORDER_STATUS", { orderId: o.id, status });
    if (s.tables.some((t: { visitId: string }) => t.visitId === visitId)) {
      if (orders.length) {
        s = await state();
        let t = s.tables.find(
            (t: { visitId: string }) => t.visitId === visitId,
          ),
          c = s.checkouts.find(
            (c: { visitId: string }) => c.visitId === visitId,
          );
        await command("REQUEST_CHECKOUT", {
          visitId,
          expectedVisitVersion: t.version,
          expectedCheckoutVersion: c?.version ?? 0,
        });
        s = await state();
        t = s.tables.find((t: { visitId: string }) => t.visitId === visitId);
        c = s.checkouts.find((c: { visitId: string }) => c.visitId === visitId);
        if (c.state === "REQUESTED")
          await command("ACK_CHECKOUT", {
            visitId,
            expectedVisitVersion: t.version,
            expectedCheckoutVersion: c.version,
          });
        const bill = await command("GET_BILL", { visitId });
        await command("PAY_AND_CLOSE", {
          visitId,
          expectedBillVersion: bill.billVersion,
          expectedTotalVnd: bill.totalVnd,
        });
      } else await command("CLOSE_EMPTY_TABLE", { visitId });
    }
    await guest.request.post("/api/guest/leave", {
      headers: { Origin: origin },
      data: {},
    });
  } finally {
    await guest.close();
  }
});
test("khách tìm món không dấu, lọc nhóm và chọn số lượng bằng dialog", async () => {
  await page.getByLabel("Tìm đồ uống", { exact: true }).fill("ca phe sua");
  await expect(page.locator(".menu-grid .menu-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Chi tiết Cà phê sữa", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Cà phê sữa", exact: true });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Tăng số lượng", exact: true })
    .click();
  await expect(dialog.getByText("60.000", { exact: false })).toBeVisible();
  await dialog
    .getByRole("button", { name: "Thêm vào giỏ", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("cart-total")).toContainText("60.000");
  await page.getByLabel("Tìm đồ uống", { exact: true }).fill("");
  await page
    .getByRole("button", { name: "Nhóm Trà và đồ uống khác", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Tìm đồ uống", { exact: true })
    .fill("khong co mon nay");
  await expect(
    page.getByText("Không tìm thấy đồ uống phù hợp.", { exact: true }),
  ).toBeVisible();
});
test("sửa giỏ, lưu ghi chú qua reload và gửi đúng nội dung lên Core", async () => {
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Tăng Cà phê sữa", exact: true })
    .click();
  await expect(page.getByTestId("cart-total")).toContainText("60.000");
  await page
    .getByLabel("Ghi chú cho đơn", { exact: true })
    .fill("Ít đá, không đường");
  await expect(page.getByText("Ghi chú đã lưu", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Ghi chú cho đơn", { exact: true })).toHaveValue(
    "Ít đá, không đường",
  );
  await page.getByRole("link", { name: "Giỏ hàng", exact: true }).click();
  await page
    .getByRole("button", { name: "Gửi đơn gọi món", exact: true })
    .click();
  await expect(page.getByText(/Quán đã nhận đơn/)).toBeVisible();
  const orders = (await state()).orders.filter(
    (o: { visitId: string }) => o.visitId === visitId,
  );
  expect(orders).toHaveLength(1);
  expect(orders[0].note).toBe("Ít đá, không đường");
  expect(orders[0].totalVnd).toBe(60000);
  await expect(page.getByLabel("Ghi chú cho đơn", { exact: true })).toHaveValue(
    "",
  );
});
test("quản lý có hàng đợi hỗ trợ và thu ngân, giữ nháp phản hồi qua điều hướng/push", async () => {
  const info = await (await guest.request.get("/api/session")).json(),
    scope = {
      storeId: info.identity.storeId,
      visitId,
      membershipId: info.identity.membershipId,
    };
  async function guestAction(action: string, data: unknown) {
    const r = await guest.request.post("/api/command", {
      headers: { Origin: origin, "X-CSRF-Token": info.csrfToken },
      data: { commandId: crypto.randomUUID(), action, data, scope },
    });
    expect(r.ok()).toBe(true);
    return r.json();
  }
  const ticket = await guestAction("CALL_SERVICE", {
    visitId,
    note: "Cần thêm nước",
  });
  const adminPage = await owner.newPage();
  try {
    await adminPage.goto("/admin");
    await adminPage.getByRole("button", { name: /Yêu cầu hỗ trợ/ }).click();
    const input = adminPage.getByLabel(`Phản hồi yêu cầu ${ticket.ticketId}`);
    await input.fill("Nhân viên đang chuẩn bị nước");
    await adminPage.getByRole("button", { name: /Quầy pha chế/ }).click();
    await guestAction("PLACE_ORDER", {
      visitId,
      items: [{ menuId: 2, quantity: 1 }],
      note: "Ít đá",
    });
    await adminPage.getByRole("button", { name: /Yêu cầu hỗ trợ/ }).click();
    await expect(input).toHaveValue("Nhân viên đang chuẩn bị nước");
    await adminPage
      .getByRole("button", { name: "Đã xử lý", exact: true })
      .click();
    await expect(page.getByRole("region", { name: "Hỗ trợ tại bàn", exact: true })
      .getByRole("status").filter({ hasText: `Yêu cầu #${ticket.ticketId} · Nhân viên đã phản hồi:` }))
      .toContainText("Nhân viên đang chuẩn bị nước");
    const snapshot = await state(),
      table = snapshot.tables.find(
        (t: { visitId: string }) => t.visitId === visitId,
      );
    await guestAction("REQUEST_CHECKOUT", {
      visitId,
      expectedVisitVersion: table.version,
      expectedCheckoutVersion: 0,
    });
    await adminPage.getByRole("button", { name: /Thu ngân/ }).click();
    await expect(
      adminPage.getByRole("heading", { name: "Bàn 1", exact: true }),
    ).toBeVisible();
    await expect(adminPage.getByText(/Còn 1 đơn chưa phục vụ/)).toBeVisible();
    await adminPage
      .getByRole("button", { name: "Xem hóa đơn Bàn 1", exact: true })
      .click();
    await expect(
      adminPage.getByRole("dialog", { name: "Chi tiết Bàn 1", exact: true }),
    ).toBeVisible();
  } finally {
    await adminPage.close();
  }
});
test("giao diện 360/390/768/1366 không tràn ngang, nút chính đủ lớn và dialog giữ focus", async () => {
  const adminPage = await owner.newPage();
  try {
    await adminPage.goto("/admin");
    await expect(
      adminPage.getByRole("button", { name: /Thu ngân/ }),
    ).toBeVisible();
    for (const width of [360, 390, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      await adminPage.setViewportSize({ width, height: 900 });
      for (const p of [page, adminPage])
        expect(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `overflow at ${width}`,
        ).toBe(true);
      const add = page.getByRole("button", {
        name: "Thêm Cà phê sữa",
        exact: true,
      });
      const rect = await add.boundingBox();
      expect(rect!.height).toBeGreaterThanOrEqual(44);
      expect(rect!.width).toBeGreaterThanOrEqual(44);
      if (width === 390)
        await page.screenshot({
          path: "test-results/ux-guest-mobile.png",
          fullPage: true,
        });
      if (width === 1366)
        await adminPage.screenshot({
          path: "test-results/ux-admin-desktop.png",
          fullPage: true,
        });
    }
    const trigger = page.getByRole("button", {
      name: "Chi tiết Cà phê sữa",
      exact: true,
    });
    await trigger.click();
    await expect(
      page.getByRole("button", { name: "Đóng chi tiết món", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      page.getByRole("button", { name: "Thêm vào giỏ", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  } finally {
    await adminPage.close();
  }
});
test("bộ lọc quầy giữ nguyên sau push, trạng thái rỗng chỉ đúng việc bị lọc", async () => {
  const info = await (await guest.request.get("/api/session")).json(),
    scope = {
      storeId: info.identity.storeId,
      visitId,
      membershipId: info.identity.membershipId,
    };
  await guest.request.post("/api/command", {
    headers: { Origin: origin, "X-CSRF-Token": info.csrfToken },
    data: {
      commandId: crypto.randomUUID(),
      action: "PLACE_ORDER",
      data: { visitId, items: [{ menuId: 2, quantity: 1 }], note: "Ít đá" },
      scope,
    },
  });
  const adminPage = await owner.newPage();
  try {
    await adminPage.goto("/admin");
    await adminPage.getByRole("button", { name: /Quầy pha chế/ }).click();
    await expect(
      adminPage.getByText("Ghi chú: Ít đá", { exact: true }),
    ).toBeVisible();
    await adminPage
      .getByRole("button", { name: "Chờ mang ra", exact: true })
      .click();
    await expect(
      adminPage.getByText("Không có đơn khớp bộ lọc", { exact: true }),
    ).toBeVisible();
    const order = (await state()).orders.find(
      (o: { visitId: string }) => o.visitId === visitId,
    );
    await command("SET_ORDER_STATUS", {
      orderId: order.id,
      status: "PREPARING",
    });
    await expect(
      adminPage.getByRole("button", { name: "Chờ mang ra", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await adminPage
      .getByRole("button", { name: "Xem tất cả đơn chờ", exact: true })
      .click();
    await expect(
      adminPage.getByText("Ghi chú: Ít đá", { exact: true }),
    ).toBeVisible();
    await adminPage.getByRole("button", { name: /Sơ đồ bàn/ }).click();
    await adminPage
      .getByLabel("Lọc bàn", { exact: true })
      .selectOption("available");
    await expect(
      adminPage.getByRole("button", { name: "Xem Bàn 1", exact: true }),
    ).toHaveCount(0);
  } finally {
    await adminPage.close();
  }
});
test("lỗi lưu ghi chú khóa gửi mới và cho thử lưu lại, không âm thầm gửi nội dung cũ", async () => {
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  // Activate the quota fault after the independent add-to-cart transaction commits.
  await expect(page.getByTestId("cart-total")).toContainText("30.000");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).restoreCartPut = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = function (
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "carts")
        throw new DOMException("fixture quota", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.getByLabel("Ghi chú cho đơn", { exact: true }).fill("Ít đá");
  await expect(
    page.getByRole("button", { name: "Thử lưu ghi chú", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Gửi đơn gọi món", exact: true }),
  ).toBeDisabled();
  expect(
    (await state()).orders.filter(
      (o: { visitId: string }) => o.visitId === visitId,
    ),
  ).toHaveLength(0);
  await page.evaluate(() => (window as any).restoreCartPut());
  await page
    .getByRole("button", { name: "Thử lưu ghi chú", exact: true })
    .click();
  await expect(page.getByText("Ghi chú đã lưu", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Gửi đơn gọi món", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
