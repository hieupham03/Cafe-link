import { expect, type Page, type BrowserContext } from "@playwright/test";

/** Real navigation through the V10 tabs; never change CSS to make hidden controls testable. */
export async function openGuestZone(
  page: Page,
  name:
    | "Thực đơn"
    | "Giỏ hàng"
    | "Đơn đã gọi"
    | "Hỗ trợ"
    | "Thanh toán"
    | "Tính tiền",
) {
  const navigation = page.getByRole("navigation", {
    name: "Điều hướng tại bàn",
  });
  if (!(await navigation.isVisible())) return;
  const dialog = page.getByRole("dialog").or(page.getByRole("alertdialog"));
  if (await dialog.count()) return;
  const link = navigation.getByRole("link", { name: new RegExp(`^${name} [0-9]+$`) });
  if ((await link.getAttribute("aria-current")) !== "location")
    await link.click();
  await expect(link).toHaveAttribute("aria-current", "location");
}

/** Legacy payment/recovery tests start at an accepted order; V10 tests cover staff acceptance itself. */
export async function acceptGuestOrders(owner: BrowserContext, page: Page) {
  const origin = new URL(page.url()).origin;
  const info = await (await owner.request.get(origin + "/api/session")).json();
  const state = await (
    await page.context().request.get(origin + "/api/state")
  ).json();
  for (const order of state.orders ?? [])
    if (
      order.acceptanceState === "WAITING" &&
      !["CANCELLED", "REFUNDED"].includes(order.paymentState)
    ) {
      const r = await owner.request.post(origin + "/api/command", {
        headers: { Origin: origin, "X-CSRF-Token": info.csrfToken },
        data: {
          commandId: crypto.randomUUID(),
          action: "ACCEPT_ORDER",
          data: { orderId: order.id },
        },
      });
      expect(r.ok(), await r.text()).toBe(true);
    }
}
export async function openGuestPayment(owner: BrowserContext, page: Page) {
  const modal = page.getByRole("dialog", { name: "Cổng thanh toán giả lập" });
  if (await modal.isVisible()) return;
  await expect
    .poll(
      async () =>
        (
          (
            await (
              await page
                .context()
                .request.get(new URL(page.url()).origin + "/api/state")
            ).json()
          ).orders ?? []
        ).length,
    )
    .toBeGreaterThan(0);
  await acceptGuestOrders(owner, page);
  await openGuestZone(page, "Thanh toán");
  const button = page
    .getByRole("button", { name: /^Thanh toán đơn #/ })
    .filter({ visible: true })
    .first();
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(modal).toBeVisible();
}
