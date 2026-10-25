import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
const origin = "http://127.0.0.1:18080";
let owner: BrowserContext, guest: BrowserContext, page: Page, qr: any;
test.beforeAll(async ({ browser }) => {
  owner = await browser.newContext();
  const login = await owner.request.post("/api/login", {
    headers: { Origin: origin },
    data: { username: "admin", password: "CafeLink@123" },
  });
  expect(login.ok()).toBe(true);
  const info = await login.json();
  async function command(action: string, data: unknown) {
    const response = await owner.request.post("/api/command", {
      headers: { Origin: origin, "X-CSRF-Token": info.csrfToken },
      data: { commandId: crypto.randomUUID(), action, data },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  await command("OPEN_ALL_TABLES", {});
  qr = await command("GET_TABLE_QR", { tableId: 1 });
});
test.beforeEach(async ({ browser }) => {
  guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await guest.newPage();
  await page.goto(qr.joinUrl);
  await page
    .getByRole("button", { name: "Vào bàn của tôi", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toBeEnabled();
});
test.afterEach(async () => {
  await guest.request.post("/api/guest/leave", {
    headers: { Origin: origin },
    data: {},
  });
  await guest.close();
});
test.afterAll(async () => {
  await owner.close();
});

test("storefront co giãn, minh họa cục bộ và danh mục không tràn ở 320–1440px", async () => {
  expect((await page.request.get('/experiment.html')).status()).toBe(404);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const navigation = page.getByRole("navigation", { name: "Điều hướng tại bàn" });
    for (const title of ["Thực đơn", "Đơn đã gọi", "Hỗ trợ", "Thanh toán", "Giỏ hàng"]) {
      const link = navigation.getByRole("link", { name: title, exact: true });
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
    ).toBeEnabled();
  }
  expect(await page.locator(".menu-grid svg.drink-art").count()).toBe(8);
  await page.screenshot({
    path: "test-results/shop-guest-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/shop-mobile-viewport.png" });
  await page.screenshot({
    path: "test-results/shop-guest-mobile.png",
    fullPage: true,
  });
});

test("năm ô chức năng dẫn đúng vùng và cập nhật giỏ, đơn, thanh toán, hỗ trợ", async () => {
  const nav = page.getByRole("navigation", { name: "Điều hướng tại bàn" });
  const link = (name: string) => nav.getByRole("link", { name, exact: true });
  for (const name of ["Thực đơn của quán", "Đơn đã gọi", "Giỏ hàng của bạn", "Thanh toán đơn hàng", "Hỗ trợ tại bàn"]) {
    await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }).click();
  await page.getByRole("button", { name: "Tăng Cà phê sữa", exact: true }).click();
  await expect(link("Giỏ hàng").locator(".guest-nav-count")).toContainText("2");
  await link("Giỏ hàng").click();
  await expect(link("Giỏ hàng")).toHaveAttribute("aria-current", "location");
  await page.getByRole("button", { name: "Đặt món và thanh toán", exact: true }).click();
  const portal = page.getByRole("dialog", { name: "Cổng thanh toán giả lập" });
  await expect(portal).toBeVisible();
  await expect(link("Giỏ hàng").locator(".guest-nav-count")).toContainText("0");
  await expect(link("Đơn đã gọi").locator(".guest-nav-count")).toContainText("1");
  await expect(link("Thanh toán").locator(".guest-nav-count")).toContainText("1");
  await portal.getByRole("button", { name: "Giả lập thanh toán thành công", exact: true }).click();
  await expect(portal).not.toBeVisible();
  await expect(link("Thanh toán").locator(".guest-nav-count")).toContainText("0");
  for (const [title, target] of [["Đơn đã gọi", "#guest-orders"], ["Hỗ trợ", "#guest-support"], ["Thanh toán", "#guest-checkout"], ["Giỏ hàng", "#guest-cart"], ["Thực đơn", "#guest-menu"]]) {
    await link(title).click();
    await expect(link(title)).toHaveAttribute("aria-current", "location");
    const bounds = await page.locator(target).boundingBox(), navBounds = await nav.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(navBounds!.y + navBounds!.height - 1);
    // At the document bottom the browser cannot align every card to the top.
    // Its heading and first content must still fit below the sticky navigation.
    expect(bounds!.y + Math.min(bounds!.height, 160), title).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
  await link("Hỗ trợ").click();
  await page.getByLabel("Lời nhắn cho nhân viên", { exact: true }).fill("Thêm khăn giấy");
  await page.getByRole("button", { name: "Gọi nhân viên", exact: true }).click();
  await expect(link("Hỗ trợ").locator(".guest-nav-count")).toContainText("1");
  await page.getByRole("button", { name: /Rút yêu cầu #/ }).click();
  await expect(link("Hỗ trợ").locator(".guest-nav-count")).toContainText("0");
});
test("nút giỏ đưa tới đúng giỏ, điều hướng có trạng thái và dialog trả focus về món", async () => {
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await expect(page.getByTestId("cart-total")).toContainText("30.000");
  const shortcut = page.getByRole("link", { name: /Xem giỏ · 1 phần/ });
  await expect(shortcut).toBeVisible();
  await shortcut.click();
  await expect(
    page.getByRole("link", { name: "Giỏ hàng", exact: true }),
  ).toHaveAttribute("aria-current", "location");
  const top = await page
    .locator("#cart-heading")
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeGreaterThan(55);
  expect(top).toBeLessThan(250);
  await page.getByRole("link", { name: "Thực đơn", exact: true }).click();
  const trigger = page.getByRole("button", {
    name: "Chi tiết Cà phê sữa",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Cà phê sữa", exact: true });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Đóng chi tiết món", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Thêm vào giỏ", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: "test-results/shop-product-dialog.png",
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.getByRole("link", { name: "Giỏ hàng", exact: true }).click();
  await page.screenshot({
    path: "test-results/shop-mobile-cart.png",
    fullPage: false,
  });
});
