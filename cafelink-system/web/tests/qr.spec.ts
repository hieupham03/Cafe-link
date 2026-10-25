import { test, expect } from "@playwright/test";
import type { Locator } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";

async function decode(qr: Locator) {
  const png = PNG.sync.read(await qr.screenshot());
  const found = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(
    found,
    "An independent decoder must read the QR rendered on screen",
  ).not.toBeNull();
  return found!.data;
}
test("QR thật: nhiều khách, quét lại, thu hồi thiết bị, đổi QR và kết thúc lượt", async ({
  page,
  browser,
}) => {
  await page.goto("/admin");
  await page.getByLabel("Tài khoản", { exact: true }).fill("admin");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("CafeLink@123");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("button", { name: "Xem Bàn 5", exact: true }).click();
  await page
    .getByRole("button", { name: "Mở lượt khách", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Xem QR và thiết bị", exact: true })
    .click();
  const qr = page.getByRole("img", {
    name: "QR gia nhập lượt khách",
    exact: true,
  });
  await expect(qr).toBeVisible();
  const firstUrl = await decode(qr);
  expect(firstUrl).toMatch(
    /^http:\/\/127\.0\.0\.1:18080\/join#grant=[A-Za-z0-9_-]{43}$/,
  );
  const adminEntry = await page.context().newPage();
  try {
    await adminEntry.goto(firstUrl);
    await expect(adminEntry.getByRole("heading", { name: "Bạn đang đăng nhập quản lý", exact: true })).toBeVisible();
    await expect(adminEntry.getByLabel("Link đặt món", { exact: true })).toHaveValue(firstUrl);
    expect((await (await page.request.get("/api/session")).json()).identity.role).toBe("ADMIN");
  } finally {
    await adminEntry.close();
  }
  const a = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const b = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const fresh = await browser.newContext();
  try {
    const one = await a.newPage(),
      two = await b.newPage(),
      unknown = await fresh.newPage();
    await one.goto(firstUrl);
    await expect(one).toHaveURL("http://127.0.0.1:18080/join");
    await one
      .getByRole("button", { name: "Vào bàn của tôi", exact: true })
      .click();
    await expect(
      one.getByRole("heading", { name: "Bàn 5", exact: true }),
    ).toBeVisible();
    await expect(
      one.getByRole("heading", { name: "Cà phê sữa", exact: true }),
    ).toBeVisible();
    const firstMember = (await (await one.request.get("/api/session")).json())
      .identity.membershipId;
    await one.goto(firstUrl);
    await expect(
      one.getByRole("heading", { name: "Bàn 5", exact: true }),
    ).toBeVisible();
    expect(
      (await (await one.request.get("/api/session")).json()).identity
        .membershipId,
    ).toBe(firstMember);
    await two.goto(firstUrl);
    await two
      .getByRole("button", { name: "Vào bàn của tôi", exact: true })
      .click();
    await expect(
      two.getByRole("heading", { name: "Bàn 5", exact: true }),
    ).toBeVisible();
    const secondMember = (await (await two.request.get("/api/session")).json())
      .identity.membershipId;
    expect(secondMember).not.toBe(firstMember);
    await one.screenshot({
      path: "test-results/guest-qr-menu.png",
      fullPage: true,
    });
    expect(
      await one.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Làm mới danh sách", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: `Thu hồi thiết bị ${firstMember.slice(0, 6)}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Xác nhận thay đổi", exact: true })
      .click();
    await expect(one.getByRole("alert")).toContainText("thu hồi", {
      timeout: 10000,
    });
    expect((await two.request.get("/api/state")).status()).toBe(200);
    await page.getByRole("button", { name: "Cấp lại QR", exact: true }).click();
    await page
      .getByRole("button", { name: "Xác nhận thay đổi", exact: true })
      .click();
    await expect(page.getByText(/Mã lần 2/)).toBeVisible();
    const replacement = await decode(qr);
    expect(replacement).not.toBe(firstUrl);
    await unknown.goto(firstUrl);
    await unknown
      .getByRole("button", { name: "Vào bàn của tôi", exact: true })
      .click();
    await expect(unknown.getByRole("alert")).toContainText("cấp lại");
    await page.screenshot({
      path: "test-results/admin-visit-qr.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Đóng bàn trống", exact: true })
      .click();
    await expect(
      two.getByRole("heading", { name: "Cảm ơn bạn đã ghé quán", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Mở lượt khách", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Xem QR và thiết bị", exact: true })
      .click();
    const nextUrl = await decode(qr);
    expect(nextUrl).not.toBe(replacement);
    await unknown.goto(replacement);
    await unknown
      .getByRole("button", { name: "Vào bàn của tôi", exact: true })
      .click();
    await expect(unknown.getByRole("alert")).toContainText("kết thúc");
  } finally {
    await a.close();
    await b.close();
    await fresh.close();
  }
});

test("mở trang khách không có mã QR giải thích cách vào bàn", async ({
  page,
}) => {
  await page.goto("/join");
  await expect(page.getByText(/Hãy quét lại QR tại bàn/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Vào bàn của tôi" }),
  ).not.toBeVisible();
});
