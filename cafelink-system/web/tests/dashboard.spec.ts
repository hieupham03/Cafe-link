import { test, expect } from "@playwright/test";
import { TcpPeer } from "./tcp-peer";

test("đăng nhập, mở bàn, đồng bộ hai tab và đăng xuất toàn bộ phiên", async ({
  page,
  context,
}) => {
  await page.goto("/admin");
  await page.getByLabel("Tài khoản", { exact: true }).fill("admin");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("CafeLink@123");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đang kết nối" }),
  ).toBeVisible();
  const second = await context.newPage();
  await second.goto("/admin");
  await expect(
    second.getByRole("status").filter({ hasText: "Đang kết nối" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Xem Bàn 1", exact: true }).click();
  await page
    .getByRole("button", { name: "Mở lượt khách", exact: true })
    .click();
  await expect(
    second.getByRole("button", { name: "Xem Bàn 1", exact: true }),
  ).toContainText("Đang phục vụ");
  await page.getByRole("button", { name: "Đóng chi tiết bàn" }).click();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Thực đơn", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Cà phê sữa", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Đăng nhập quản lý" }),
  ).toBeVisible();
  await expect(
    second.getByRole("heading", { name: "Đăng nhập quản lý" }),
  ).toBeVisible({ timeout: 6000 });
});

test("sai mật khẩu có phản hồi rõ và không vào được dữ liệu quán", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByLabel("Tài khoản", { exact: true }).fill("admin");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Sai tài khoản hoặc mật khẩu",
  );
  await expect(
    page.getByRole("heading", { name: "Đăng nhập quản lý" }),
  ).toBeVisible();
});

test("trình duyệt bị chặn ghi lệnh thiếu CSRF, không làm thay đổi bàn", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByLabel("Tài khoản", { exact: true }).fill("admin");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("CafeLink@123");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đang kết nối" }),
  ).toBeVisible();
  const status = await page.evaluate(
    async () =>
      (
        await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commandId: "forged-browser",
            action: "OPEN_TABLE",
            data: { tableId: 6 },
          }),
        })
      ).status,
  );
  expect(status).toBe(403);
  await expect(
    page.getByRole("button", { name: "Xem Bàn 6", exact: true }),
  ).toContainText("Bàn trống");
});

test("màn hình điện thoại không tràn ngang và vẫn thao tác được bàn", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await page.getByLabel("Tài khoản", { exact: true }).fill("admin");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("CafeLink@123");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Xem Bàn 2", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Xem Bàn 2", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Chi tiết Bàn 2" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("đơn TCP hiện trên web, quầy phục vụ, phản hồi khách và thu tiền đóng bàn", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByLabel("Tài khoản", { exact: true }).fill("admin");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("CafeLink@123");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Đang kết nối" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Xem Bàn 3", exact: true }).click();
  await page
    .getByRole("button", { name: "Mở lượt khách", exact: true })
    .click();
  // click() does not await the async journal/network handler. Wait for the
  // committed visit to reach the UI before using it as the TCP fixture scope.
  await expect(
    page.getByRole("button", { name: "Xem Bàn 3", exact: true }),
  ).toContainText("Đang phục vụ");
  const state = await page.request.get("/api/state");
  const visitId = (await state.json()).tables.find(
    (table: { id: number }) => table.id === 3,
  ).visitId;
  const guest = await new TcpPeer().connect();
  try {
    const csrf = (await (await page.request.get("/api/session")).json())
      .csrfToken;
    const response = await page.request.post("/api/command", {
      headers: { Origin: "http://127.0.0.1:18080", "X-CSRF-Token": csrf },
      data: {
        commandId: "fixture-qr-table3",
        action: "GET_VISIT_QR",
        data: { visitId },
      },
    });
    expect(response.status()).toBe(200);
    await guest.call("JOIN_VISIT", { grant: (await response.json()).grant });
    await guest.call("PLACE_ORDER", {
      visitId,
      items: [{ menuId: 2, quantity: 2 }],
      note: "Ít đá",
    });
    const ticket = await guest.call("CALL_SERVICE", {
      visitId,
      note: "Cho khách thêm nước lọc",
    });
    await page.getByRole("button", { name: "Đóng chi tiết bàn" }).click();
    await page.getByRole("button", { name: /Yêu cầu hỗ trợ/ }).click();
    await expect(
      page.getByText("Cho khách thêm nước lọc", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel(`Phản hồi yêu cầu ${ticket.ticketId}`)
      .fill("Nhân viên đang mang nước.");
    await page.getByRole("button", { name: "Đã xử lý", exact: true }).click();
    await expect(
      page.getByText("Cho khách thêm nước lọc", { exact: true }),
    ).not.toBeVisible();
    await page
      .getByRole("button", { name: "Quầy pha chế", exact: false })
      .click();
    await expect(
      page.getByText("Ghi chú: Ít đá", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Bắt đầu pha chế", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Pha chế xong", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Đã mang ra bàn", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Quầy đã xử lý xong đơn" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sơ đồ bàn", exact: false }).click();
    await page.getByRole("button", { name: "Xem Bàn 3", exact: true }).click();
    await page
      .getByRole("button", { name: "Mở yêu cầu tính tiền", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Tiếp nhận tính tiền", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Xem tạm tính", exact: true })
      .click();
    await expect(page.locator(".bill-total strong")).toContainText("60.000");
    await page
      .getByRole("button", { name: "Ghi nhận tiền mặt", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Đã nhận tiền", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Bàn đang trống", exact: true }),
    ).toBeVisible();
  } finally {
    guest.close();
  }
});

test("chi tiết bàn giữ focus bàn phím, Escape đóng và trả focus về bàn vừa chọn", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByLabel("Tài khoản", { exact: true }).fill("admin");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("CafeLink@123");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const table = page.getByRole("button", { name: "Xem Bàn 4", exact: true });
  await table.click();
  await expect(
    page.getByRole("button", { name: "Đóng chi tiết bàn" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(table).toBeFocused();
});
