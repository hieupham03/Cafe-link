import {
  openGuestZone,
  openGuestPayment,
  acceptGuestOrders,
} from "./guest-navigation";
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
  await openGuestZone(page, "Thực đơn");
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

test("storefront co giãn, ảnh món cục bộ và danh mục không tràn ở 320–1440px", async () => {
  expect((await page.request.get("/experiment.html")).status()).toBe(404);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const navigation = page.getByRole("navigation", {
      name: "Điều hướng tại bàn",
    });
    for (const title of [
      "Thực đơn",
      "Đơn đã gọi",
      "Hỗ trợ",
      "Thanh toán",
      "Giỏ hàng",
    ]) {
      const link = navigation.getByRole("link", { name: new RegExp(`^${title} [0-9]+$`) });
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
    await openGuestZone(page, "Thực đơn");
    await expect(
      page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
    ).toBeEnabled();
  }
  const photos = page.locator(".menu-grid img.menu-photo");
  await expect(photos).toHaveCount(8);
  for (const photo of await photos.all()) {
    await photo.scrollIntoViewIfNeeded();
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
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

test("thanh giỏ hàng hiển thị đầy đủ và không bị menu dưới che trên màn hình nhỏ", async () => {
  await page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }).click();
  const shortcut = page.getByRole("link", { name: /Xem giỏ · 1 phần/ });
  const navigation = page.getByRole("navigation", { name: "Điều hướng tại bàn" });
  for (const width of [320, 360, 390, 600, 768, 850]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(shortcut).toBeVisible();
    const bounds = await shortcut.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x, `Lề trái ở ${width}px`).toBeGreaterThanOrEqual(12);
    expect(bounds!.x + bounds!.width, `Lề phải ở ${width}px`).toBeLessThanOrEqual(width - 12);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    if (width <= 600) {
      const navBounds = await navigation.boundingBox();
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(navBounds!.y - 4);
    }
    // Verify the visible shortcut can actually receive a tap across its width.
    for (const fraction of [0.1, 0.5, 0.9]) {
      expect(await shortcut.evaluate((element, ratio) => {
        const rect = element.getBoundingClientRect();
        return document.elementFromPoint(rect.x + rect.width * ratio, rect.y + rect.height / 2)?.closest('.cart-shortcut') === element;
      }, fraction)).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/shop-cart-shortcut-mobile.png" });
  await shortcut.click();
  await expect(navigation.getByRole("link", { name: /^Giỏ hàng \d+$/ })).toHaveAttribute("aria-current", "location");
  await expect(shortcut).not.toBeVisible();
});

test("năm ô chức năng dẫn đúng vùng và cập nhật giỏ, đơn, thanh toán, hỗ trợ", async () => {
  const nav = page.getByRole("navigation", { name: "Điều hướng tại bàn" });
  const link = (name: string) => nav.getByRole("link", { name: new RegExp(`^${name} [0-9]+$`) });
  for (const [tab,name] of [
    ["Thực đơn","Thực đơn của quán"],
    ["Đơn đã gọi","Đơn đã gọi"],
    ["Giỏ hàng","Giỏ hàng của bạn"],
    ["Thanh toán","Thanh toán đơn hàng"],
    ["Hỗ trợ","Hỗ trợ tại bàn"],
  ]) {
    await link(tab).click();
    await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
  }
  await openGuestZone(page, "Thực đơn");
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await openGuestZone(page, "Giỏ hàng");
  await page
    .getByRole("button", { name: "Tăng Cà phê sữa", exact: true })
    .click();
  await expect(link("Giỏ hàng").locator(".guest-nav-count")).toContainText("2");
  await link("Giỏ hàng").click();
  await expect(link("Giỏ hàng")).toHaveAttribute("aria-current", "location");
  await openGuestZone(page, "Giỏ hàng");
  await page
    .getByRole("button", { name: "Gửi đơn gọi món", exact: true })
    .click();
  await openGuestPayment(owner, page);
  const portal = page.getByRole("dialog", { name: "Cổng thanh toán giả lập" });
  await expect(portal).toBeVisible();
  await expect(link("Giỏ hàng").locator(".guest-nav-count")).toContainText("0");
  await expect(link("Đơn đã gọi").locator(".guest-nav-count")).toContainText(
    "1",
  );
  await expect(link("Thanh toán").locator(".guest-nav-count")).toContainText(
    "1",
  );
  await portal
    .getByRole("button", { name: "Giả lập thanh toán thành công", exact: true })
    .click();
  await expect(portal).not.toBeVisible();
  await expect(link("Thanh toán").locator(".guest-nav-count")).toContainText(
    "0",
  );
  for (const [title, target] of [
    ["Đơn đã gọi", "#guest-orders"],
    ["Hỗ trợ", "#guest-support"],
    ["Thanh toán", "#guest-checkout"],
    ["Giỏ hàng", "#guest-cart"],
    ["Thực đơn", "#guest-menu"],
  ]) {
    await link(title).click();
    await expect(link(title)).toHaveAttribute("aria-current", "location");
    const bounds = await page.locator(target).boundingBox(),
      navBounds = await nav.boundingBox();
    const bottomNavigation = page.viewportSize()!.width <= 600;
    expect(bounds!.y).toBeGreaterThanOrEqual(bottomNavigation ? 0 : navBounds!.y + navBounds!.height - 1);
    // The heading and first content must fit above mobile bottom navigation.
    expect(
      bounds!.y + Math.min(bounds!.height, 160),
      title,
    ).toBeLessThanOrEqual(bottomNavigation ? navBounds!.y : page.viewportSize()!.height);
  }
  await link("Hỗ trợ").click();
  await openGuestZone(page, "Hỗ trợ");
  await page
    .getByLabel("Lời nhắn cho nhân viên", { exact: true })
    .fill("Thêm khăn giấy");
  await openGuestZone(page, "Hỗ trợ");
  await page
    .getByRole("button", { name: "Gọi nhân viên", exact: true })
    .click();
  await expect(link("Hỗ trợ").locator(".guest-nav-count")).toContainText("1");
  await openGuestZone(page, "Hỗ trợ");
  await page.getByRole("button", { name: /Rút yêu cầu #/ }).click();
  await expect(link("Hỗ trợ").locator(".guest-nav-count")).toContainText("0");
});
test("nút giỏ đưa tới đúng giỏ, điều hướng có trạng thái và dialog trả focus về món", async () => {
  await openGuestZone(page, "Thực đơn");
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  const shortcut = page.getByRole("link", { name: /Xem giỏ · 1 phần/ });
  await expect(shortcut).toBeVisible();
  await shortcut.click();
  await expect(page.getByTestId("cart-total")).toContainText("30.000");
  await expect(
    page.getByRole("link", { name: /^Giỏ hàng \d+$/, exact: true }),
  ).toHaveAttribute("aria-current", "location");
  const top = await page
    .locator("#cart-heading")
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThan(250);
  await page.getByRole("link", { name: /^Thực đơn \d+$/, exact: true }).click();
  await openGuestZone(page, "Thực đơn");
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
  await page.getByRole("link", { name: /^Giỏ hàng \d+$/, exact: true }).click();
  await page.screenshot({
    path: "test-results/shop-mobile-cart.png",
    fullPage: false,
  });
});
