import { test, expect, type BrowserContext, type Page } from "@playwright/test";
const origin = "http://127.0.0.1:18080";
let owner: BrowserContext, admin: Page, guest: BrowserContext, page: Page;
async function cmd(
  context: BrowserContext,
  action: string,
  data: unknown = {},
) {
  const info = await (
    await context.request.get(origin + "/api/session")
  ).json();
  const response = await context.request.post(origin + "/api/command", {
    headers: { Origin: origin, "X-CSRF-Token": info.csrfToken },
    data: {
      commandId: crypto.randomUUID(),
      action,
      data,
      scope: info.identity,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function snapshot(context = guest) {
  return (await context.request.get(origin + "/api/state")).json();
}
async function zone(name: string) {
  const link = page
    .getByRole("navigation", { name: "Điều hướng tại bàn" })
    .getByRole("link", { name: new RegExp(`^${name} [0-9]+$`) });
  await link.click();
  await expect(link).toHaveAttribute("aria-current", "location");
}
async function submit() {
  const previousIds = new Set((await snapshot()).orders.map((order: {id:number}) => order.id));
  await zone("Thực đơn");
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await zone("Giỏ hàng");
  await page
    .getByRole("button", { name: "Gửi đơn gọi món", exact: true })
    .click();
  await expect(
    page.getByText(/Đang chờ nhân viên tiếp nhận/).first(),
  ).toBeVisible();
  await expect.poll(async () => (await snapshot()).orders.filter((order: {id:number}) => !previousIds.has(order.id)).length).toBe(1);
  return (await snapshot()).orders.find((order: {id:number}) => !previousIds.has(order.id));
}
async function goAdmin(name: string) {
  await admin
    .getByRole("navigation", { name: "Điều hướng chính" })
    .getByRole("button", { name: new RegExp(name) })
    .click();
}
test.beforeAll(async ({ browser }) => {
  owner = await browser.newContext();
  const r = await owner.request.post(origin + "/api/login", {
    headers: { Origin: origin },
    data: { username: "admin", password: "CafeLink@123" },
  });
  expect(r.ok()).toBe(true);
  await cmd(owner, "OPEN_ALL_TABLES");
});
test.beforeEach(async ({ browser }) => {
  const settings = await cmd(owner, "GET_TAX_SETTINGS");
  await cmd(owner, "SAVE_TAX_SETTINGS", {
    name: "VAT",
    rateBps: 800,
    mode: "EXCLUSIVE",
    expectedVersion: settings.version,
  });
  guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: browser.browserType().name() !== "firefox",
    reducedMotion: "reduce",
  });
  page = await guest.newPage();
  admin = await owner.newPage();
  await admin.goto(origin + "/admin");
  const qr = await cmd(owner, "GET_TABLE_QR", { tableId: 1 });
  await page.goto(qr.joinUrl);
  await page
    .getByRole("button", { name: "Vào bàn của tôi", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toBeEnabled();
});
test.afterEach(async () => {
  await guest.close();
  await admin.close();
});
test.afterAll(async () => {
  await owner.close();
});

test("V10 QR trên mọi thẻ bàn và không có hướng dẫn test trong QR", async () => {
  await expect(admin.locator(".table-inline-qr svg")).toHaveCount(6);
  await admin.getByRole("button", { name: "Xem Bàn 1", exact: true }).click();
  const dialog = admin.getByRole("dialog", { name: "Chi tiết Bàn 1" });
  await expect(dialog.locator(".qr-card svg")).toBeVisible();
  await expect(dialog).not.toContainText("Thử làm khách");
  await expect(dialog).not.toContainText("Ctrl+Shift");
});
test("V10 chờ quán tiếp nhận, tính thuế, trả tiền rồi mới pha chế", async () => {
  const order = await submit();
  expect(order.totalVnd).toBe(32400);
  expect(order.taxVnd).toBe(2400);
  expect(order.acceptanceState).toBe("WAITING");
  await zone("Thanh toán");
  await expect(
    page.getByRole("button", {
      name: `Thanh toán đơn #${order.id}`,
      exact: true,
    }),
  ).toBeDisabled();
  const info = await (await guest.request.get(origin + "/api/session")).json();
  const early = await guest.request.post(origin + "/api/command", {
    headers: { Origin: origin, "X-CSRF-Token": info.csrfToken },
    data: {
      commandId: crypto.randomUUID(),
      action: "START_ORDER_PAYMENT",
      data: { visitId: order.visitId, orderId: order.id },
      scope: info.identity,
    },
  });
  expect((await early.json()).code).toBe("ACCEPTANCE_REQUIRED");
  await goAdmin("Quầy pha chế");
  await admin
    .getByRole("button", { name: `Tiếp nhận đơn #${order.id}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: `Thanh toán đơn #${order.id}`,
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: `Thanh toán đơn #${order.id}`, exact: true })
    .click();
  const payment = page.getByRole("dialog", { name: "Cổng thanh toán giả lập" });
  await expect(payment).toContainText("32.400");
  await payment
    .getByRole("button", { name: "Giả lập thanh toán thành công", exact: true })
    .click();
  await expect
    .poll(async () => (await snapshot()).orders[0].paymentState)
    .toBe("PAID");
  for (const state of ["PREPARING", "READY", "SERVED"])
    await cmd(owner, "SET_ORDER_STATUS", { orderId: order.id, status: state });
  await zone("Đơn đã gọi");
  await expect(
    page.getByRole("heading", { name: "Cảm ơn bạn đã ghé quán", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#guest-orders")).toContainText("Đã giao");
  await goAdmin("Lịch sử hóa đơn");
  await admin
    .getByRole("button", { name: new RegExp(`Bàn 1 · 32.400`) })
    .first()
    .click();
  await expect(
    admin.getByRole("dialog", { name: "Chi tiết hóa đơn" }),
  ).toContainText("VAT (8%)");
});
test("V10 quán từ chối đơn hết nguyên liệu và không phát sinh thanh toán", async () => {
  const order = await submit();
  await goAdmin("Quầy pha chế");
  await admin
    .getByRole("button", { name: `Từ chối đơn #${order.id}`, exact: true })
    .click();
  const dialog = admin.getByRole("dialog", {
    name: "Xử lý đơn không phục vụ được",
  });
  await dialog
    .getByLabel("Lý do xử lý")
    .fill("Quán vừa hết sữa, mời bạn chọn đồ uống khác");
  await dialog
    .getByRole("button", { name: "Xác nhận hủy đơn chưa trả", exact: true })
    .click();
  await expect
    .poll(async () => (await snapshot()).orders[0].acceptanceState)
    .toBe("REJECTED");
  await zone("Đơn đã gọi");
  await expect(page.locator("#guest-orders")).toContainText("Quán vừa hết sữa");
  expect((await snapshot()).orders[0].paymentState).toBe("CANCELLED");
});
test("V10 cấu hình thuế, xem trước và giữ nguyên thuế của đơn đã gửi", async () => {
  const order = await submit();
  await goAdmin("Cài đặt quán");
  await admin.getByLabel("Thuế suất (%)").fill("10");
  await admin
    .getByRole("button", { name: "Lưu cấu hình thuế", exact: true })
    .click();
  await expect(
    admin.getByRole("status").filter({ hasText: "Đã lưu cấu hình thuế" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await snapshot()).taxSettings.rateBps)
    .toBe(1000);
  expect((await snapshot()).orders[0].totalVnd).toBe(order.totalVnd);
  await admin.getByLabel("Cách tính thuế").selectOption("INCLUSIVE");
  await expect(admin.locator(".tax-preview .order-totals-grand")).toContainText(
    "100.000",
  );
  await admin
    .getByRole("button", { name: "Lưu cấu hình thuế", exact: true })
    .click();
  await expect
    .poll(async () => (await snapshot()).taxSettings.mode)
    .toBe("INCLUSIVE");
  const next = await submit();
  expect(next.totalVnd).toBe(30000);
  expect(next.taxVnd).toBe(2727);
  expect(next.subtotalVnd).toBe(27273);
});
test("V10 ghi chi phí, hủy phiếu có lý do và xuất CSV", async () => {
  await goAdmin("Thu chi");
  await expect(admin.locator(".finance-metrics")).toBeVisible();
  const oldReport = await cmd(owner, "GET_FINANCE_REPORT");
  await admin
    .getByRole("button", { name: "Ghi khoản chi", exact: true })
    .click();
  const form = admin.getByRole("dialog", { name: "Ghi khoản chi" });
  await form.getByLabel("Số tiền chi (VND)").fill("125000");
  await form.getByLabel("Nội dung chi").fill("Nhập cà phê cho ca sáng");
  await form
    .getByRole("button", { name: "Lưu khoản chi", exact: true })
    .click();
  await expect(form).not.toBeVisible();
  await expect(admin.locator(".expense-table")).toContainText(
    "Nhập cà phê cho ca sáng",
  );
  const report = await cmd(owner, "GET_FINANCE_REPORT");
  expect(report.expenseVnd - oldReport.expenseVnd).toBe(125000);
  const download = admin.waitForEvent("download");
  await admin
    .getByRole("button", { name: "Xuất CSV tổng hợp", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/CafeLink-thu-chi/);
  const row = admin
    .locator(".expense-table tr")
    .filter({ hasText: "Nhập cà phê cho ca sáng" });
  await row.getByRole("button", { name: /Hủy phiếu/ }).click();
  const cancel = admin.getByRole("dialog", { name: "Hủy phiếu chi" });
  await cancel
    .getByLabel("Lý do hủy")
    .fill("Phiếu ghi trùng, giữ lại để đối chiếu");
  await cancel
    .getByRole("button", { name: "Xác nhận hủy phiếu", exact: true })
    .click();
  await expect(cancel).not.toBeVisible();
  await expect(row).toContainText("Đã hủy phiếu");
  expect((await cmd(owner, "GET_FINANCE_REPORT")).expenseVnd).toBe(
    oldReport.expenseVnd,
  );
});
test("V10 khách không truy cập báo cáo hoặc chỉnh thuế", async () => {
  const info = await (await guest.request.get(origin + "/api/session")).json();
  for (const action of [
    "GET_FINANCE_REPORT",
    "GET_TAX_SETTINGS",
    "SAVE_TAX_SETTINGS",
    "CREATE_EXPENSE",
    "VOID_EXPENSE",
    "ACCEPT_ORDER",
  ]) {
    const r = await guest.request.post(origin + "/api/command", {
      headers: { Origin: origin, "X-CSRF-Token": info.csrfToken },
      data: {
        commandId: crypto.randomUUID(),
        action,
        data: {},
        scope: info.identity,
      },
    });
    expect(r.ok()).toBe(false);
  }
});

test("V10 mở thông báo chuyển đúng mục đơn đang ẩn trên màn khách", async () => {
  const order = await submit();
  await zone("Thực đơn");
  await cmd(owner, "ACCEPT_ORDER", { orderId: order.id });
  await page.getByRole("button", { name: /Thông báo, / }).click();
  const center = page.getByRole("dialog", { name: "Trung tâm thông báo" });
  await center.locator(".notification-row").filter({ hasText: `Quán đã tiếp nhận đơn #${order.id}` }).first().click();
  await expect(center).not.toBeVisible();
  await expect(page.locator("#guest-orders")).toBeVisible();
  await expect(page.locator("#guest-orders").getByRole("link", { name: `Thanh toán đơn #${order.id}`, exact: true })).toBeVisible();
});

test("V10 mất phản hồi ghi chi được đối chiếu sau tải lại, không ghi chi hai lần", async () => {
  await goAdmin("Thu chi");
  const before = await cmd(owner, "GET_FINANCE_REPORT");
  await admin
    .getByRole("button", { name: "Ghi khoản chi", exact: true })
    .click();
  const form = admin.getByRole("dialog", { name: "Ghi khoản chi" });
  await form.getByLabel("Số tiền chi (VND)").fill("75000");
  await form.getByLabel("Nội dung chi").fill("Nhập giấy lọc, mất phản hồi");
  await admin.route("**/api/command", async (route) => {
    if (route.request().postDataJSON()?.action !== "CREATE_EXPENSE")
      return route.continue();
    const result = await route.fetch();
    expect(result.ok()).toBe(true);
    await route.abort("failed");
  });
  await form
    .getByRole("button", { name: "Lưu khoản chi", exact: true })
    .click();
  await expect(form.getByRole("alert")).toBeVisible();
  await admin.unrouteAll();
  await admin.reload();
  await goAdmin("Thu chi");
  await expect(admin.locator(".expense-table")).toContainText(
    "Nhập giấy lọc, mất phản hồi",
  );
  const after = await cmd(owner, "GET_FINANCE_REPORT");
  expect(after.expenseVnd - before.expenseVnd).toBe(75000);
  expect(
    after.expenses.filter((e: any) => e.note === "Nhập giấy lọc, mất phản hồi"),
  ).toHaveLength(1);
  await expect(
    admin.getByRole("button", { name: "Ghi khoản chi", exact: true }),
  ).toBeEnabled();
});
test("V10 bố cục 375/768/1024/1440 và điều hướng không che nút", async () => {
  // WebKit's touch emulation performs a real tap/scroll for each viewport.
  // Keep the same assertions across engines; allow the complete four-size journey.
  test.setTimeout(90_000);
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await zone("Thực đơn");
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      navHeight: document.querySelector(".guest-nav")!.getBoundingClientRect()
        .height,
    }));
    expect(layout.documentWidth).toBeLessThanOrEqual(width + 1);
    expect(layout.navHeight).toBeLessThan(150);
    await page
      .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
      .click();
    await zone("Giỏ hàng");
    await expect(
      page.getByRole("button", { name: "Gửi đơn gọi món", exact: true }),
    ).toBeVisible();
  }
  await page.setViewportSize({ width: 375, height: 844 });
  await zone("Thực đơn");
  await page
    .getByRole("button", { name: "Chi tiết Cà phê sữa", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Cà phê sữa", exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  for(const width of [375,768]) {
    await admin.setViewportSize({width,height:900});
    await expect(admin.getByRole("button",{name:"Đăng xuất",exact:true})).toBeVisible();
    expect(await admin.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
  }
});
