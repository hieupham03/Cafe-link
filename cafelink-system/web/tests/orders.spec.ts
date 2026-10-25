import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

const origin = "http://127.0.0.1:18080";
let owner: BrowserContext,
  guest: BrowserContext,
  page: Page,
  csrf: string,
  visitId: string,
  joinUrl: string;
async function command(action: string, data: unknown) {
  const response = await owner.request.post("/api/command", {
    headers: { Origin: origin, "X-CSRF-Token": csrf },
    data: { commandId: crypto.randomUUID(), action, data },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function state() {
  return (await owner.request.get("/api/state")).json();
}
// One real staff login for this serial suite; guests and visits remain isolated.
// Repeated staff logins per case would hit the production 30/IP/minute guard.
test.beforeAll(async ({ browser }) => {
  owner = await browser.newContext();
  const login = await owner.request.post("/api/login", {
    headers: { Origin: origin },
    data: { username: "admin", password: "CafeLink@123" },
  });
  expect(login.ok()).toBe(true);
  csrf = (await login.json()).csrfToken;
});
test.afterAll(async () => {
  try {
    await owner.request.post("/api/logout", {
      headers: { Origin: origin, "X-CSRF-Token": csrf },
      data: {},
    });
  } finally {
    await owner.close();
  }
});
test.beforeEach(async ({ browser }) => {
  guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const table = (await state()).tables.find(
    (row: { visitId?: string }) => !row.visitId,
  );
  expect(table).toBeTruthy();
  visitId = (await command("OPEN_TABLE", { tableId: table.id })).visitId;
  joinUrl = (await command("GET_VISIT_QR", { visitId })).joinUrl;
  page = await guest.newPage();
});
test.afterEach(async () => {
  try {
    await guest.setOffline(false);
    const snapshot = await state();
    for (const ticket of snapshot.tickets.filter(
      (row: { visitId: string; status: string }) =>
        row.visitId === visitId && row.status === "OPEN",
    ))
      await command("HANDLE_TICKET", {
        ticketId: ticket.id,
        reply: "Fixture cleanup",
      });
    for (const order of snapshot.orders.filter(
      (row: { visitId: string }) => row.visitId === visitId,
    )) {
      const statuses = ["SUBMITTED", "PREPARING", "READY", "SERVED"];
      for (const status of statuses.slice(statuses.indexOf(order.status) + 1))
        await command("SET_ORDER_STATUS", { orderId: order.id, status });
    }
    if (
      snapshot.tables.some(
        (row: { visitId: string }) => row.visitId === visitId,
      )
    )
      if (
        snapshot.orders.some(
          (row: { visitId: string }) => row.visitId === visitId,
        )
      ) {
        let fresh = await state(),
          table = fresh.tables.find(
            (t: { visitId: string }) => t.visitId === visitId,
          ),
          checkout = fresh.checkouts.find(
            (c: { visitId: string }) => c.visitId === visitId,
          );
        await command("REQUEST_CHECKOUT", {
          visitId,
          expectedVisitVersion: table.version,
          expectedCheckoutVersion: checkout?.version ?? 0,
        });
        fresh = await state();
        table = fresh.tables.find(
          (t: { visitId: string }) => t.visitId === visitId,
        );
        checkout = fresh.checkouts.find(
          (c: { visitId: string }) => c.visitId === visitId,
        );
        if (checkout.state === "REQUESTED")
          await command("ACK_CHECKOUT", {
            visitId,
            expectedVisitVersion: table.version,
            expectedCheckoutVersion: checkout.version,
          });
        const bill = await command("GET_BILL", { visitId });
        await command("PAY_AND_CLOSE", {
          visitId,
          expectedBillVersion: bill.billVersion,
          expectedTotalVnd: bill.totalVnd,
        });
      } else await command("CLOSE_EMPTY_TABLE", { visitId });
    await guest.request.post("/api/guest/leave", {
      headers: { Origin: origin },
      data: {},
    });
  } finally {
    await guest.close();
  }
});
async function join() {
  await page.goto(joinUrl);
  await page
    .getByRole("button", { name: "Vào bàn của tôi", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toBeEnabled();
}
test("đặt món web ghi nhật ký trước gửi và tạo một đơn đúng giá tại Core", async () => {
  await join();
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await expect(page.getByTestId("cart-total")).toContainText("60.000");
  await expect(
    page.getByRole("link", { name: /Xem giỏ · 2 phần/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Xem giỏ · 2 phần/ }).click();
  await page.screenshot({
    path: "test-results/guest-order-cart.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Gửi đơn gọi món", exact: true })
    .click();
  await expect(page.getByText(/Quán đã nhận đơn/)).toBeVisible();
  const orders = (await state()).orders.filter(
    (order: { visitId: string }) => order.visitId === visitId,
  );
  expect(orders).toHaveLength(1);
  expect(orders[0].totalVnd).toBe(60000);
});

test("SEMANTIC: lời gọi chưa nhận được bỏ khi reload, giỏ món vẫn giữ", async () => {
  await join();
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await fault("CALL_SERVICE", false);
  await page
    .getByRole("button", { name: "Gọi nhân viên", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(/Lời gọi cũ chưa được nhận đã được bỏ/),
  ).toBeVisible();
  expect(
    (await state()).tickets.filter(
      (row: { visitId: string }) => row.visitId === visitId,
    ),
  ).toHaveLength(0);
  await expect(page.getByTestId("cart-total")).toContainText("30.000");
  await expect(
    page.getByRole("button", { name: "Xác nhận gửi lại", exact: true }),
  ).toHaveCount(0);
});

test("SEMANTIC: lời gọi đã nhận và đã phản hồi vẫn giữ đúng ticket sau mất ACK", async () => {
  await join();
  await fault("CALL_SERVICE", true);
  await page
    .getByLabel("Lời nhắn cho nhân viên", { exact: true })
    .fill("Thêm nước lọc");
  await page
    .getByRole("button", { name: "Gọi nhân viên", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  const tickets = (await state()).tickets.filter(
    (t: { visitId: string }) => t.visitId === visitId,
  );
  expect(tickets).toHaveLength(1);
  await command("HANDLE_TICKET", {
    ticketId: tickets[0].id,
    reply: "Đang mang nước ra",
  });
  await page.reload();
  await expect(page.getByText(/Đang mang nước ra/)).toBeVisible();
  await expect(page.getByText(/Quán đã nhận lời gọi/)).toBeVisible();
  expect(
    (await state()).tickets.filter(
      (t: { visitId: string }) => t.visitId === visitId,
    ),
  ).toHaveLength(1);
});

test("SEMANTIC: mất ACK bỏ lời gọi vẫn chờ, lookup tombstone chặn lời gọi đến muộn", async () => {
  await join();
  const captured = await fault("CALL_SERVICE", false);
  await page
    .getByRole("button", { name: "Gọi nhân viên", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  const original = captured();
  await fault("DISCARD_COMMAND", true);
  await page.reload();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByText(/Lời gọi cũ chưa được nhận đã được bỏ/),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText(/Lời gọi cũ chưa được nhận đã được bỏ/),
  ).toBeVisible();
  const info = await (await guest.request.get("/api/session")).json();
  const late = await guest.request.post("/api/command", {
    headers: { Origin: origin, "X-CSRF-Token": info.csrfToken },
    data: original,
  });
  expect((await late.json()).code).toBe("COMMAND_DISCARDED");
  expect(
    (await state()).tickets.filter(
      (t: { visitId: string }) => t.visitId === visitId,
    ),
  ).toHaveLength(0);
});

async function guestCommand(
  action: string,
  data: unknown,
  id = crypto.randomUUID(),
) {
  const info = await (await guest.request.get("/api/session")).json();
  const identity = info.identity;
  return guest.request.post("/api/command", {
    headers: { Origin: origin, "X-CSRF-Token": info.csrfToken },
    data: {
      commandId: id,
      action,
      data,
      scope: {
        storeId: identity.storeId,
        visitId: identity.visitId,
        membershipId: identity.membershipId,
      },
    },
  });
}
async function checkoutVersions() {
  const s = await state();
  return {
    visitId,
    expectedVisitVersion: s.tables.find(
      (t: { visitId: string }) => t.visitId === visitId,
    ).version,
    expectedCheckoutVersion:
      s.checkouts.find((c: { visitId: string }) => c.visitId === visitId)
        ?.version ?? 0,
  };
}

test("checkout web mất ACK: reload cùng đối tượng, sau ACK nhiều ID vẫn không tạo lại", async () => {
  await join();
  await addAndSend();
  await expect(page.getByText(/Quán đã nhận đơn/)).toBeVisible();
  await fault("REQUEST_CHECKOUT", true);
  await page
    .getByRole("button", { name: "Yêu cầu tính tiền", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Yêu cầu tính tiền", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/Quán đã nhận yêu cầu tính tiền/)).toBeVisible();
  const first = (await state()).checkouts.find(
    (c: { visitId: string }) => c.visitId === visitId,
  );
  await command("ACK_CHECKOUT", await checkoutVersions());
  await expect(page.getByText(/Quán đã tiếp nhận tính tiền/)).toBeVisible();
  const duplicate = await guestCommand("REQUEST_CHECKOUT", {
    visitId,
    expectedVisitVersion: 1,
    expectedCheckoutVersion: 0,
  });
  expect(duplicate.ok()).toBe(true);
  expect((await duplicate.json()).checkoutId).toBe(first.checkoutId);
  expect(
    (await state()).tickets.filter(
      (t: { visitId: string; type: string }) =>
        t.visitId === visitId && t.type === "REQUEST_BILL",
    ),
  ).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/guest-checkout.png",
    fullPage: true,
  });
});

test("checkout chưa nhận không tự gửi; mở lại gọi món chặn request version cũ", async () => {
  await join();
  await addAndSend();
  await expect(page.getByText(/Quán đã nhận đơn/)).toBeVisible();
  const captured = await fault("REQUEST_CHECKOUT", false);
  await page
    .getByRole("button", { name: "Yêu cầu tính tiền", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  const original = captured();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Xác nhận gửi lại", exact: true }),
  ).toBeEnabled();
  expect((await state()).checkouts).toHaveLength(0);
  await page
    .getByRole("button", { name: "Xác nhận gửi lại", exact: true })
    .click();
  await expect(page.getByText(/Quán đã nhận yêu cầu tính tiền/)).toBeVisible();
  await command("REOPEN_ORDERING", {
    ...(await checkoutVersions()),
    reason: "Khách muốn gọi thêm",
  });
  await expect(
    page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toBeEnabled();
  const stale = await guestCommand("REQUEST_CHECKOUT", original.data);
  expect(stale.status()).toBe(409);
  expect((await stale.json()).code).toBe("VERSION_CONFLICT");
  const current = (await state()).checkouts.find(
    (c: { visitId: string }) => c.visitId === visitId,
  );
  expect(current.state).toBe("CANCELLED");
});

test("hai membership cùng tính tiền đồng thời dùng một checkout", async ({
  browser,
}) => {
  await join();
  await addAndSend();
  await expect(page.getByText(/Quán đã nhận đơn/)).toBeVisible();
  const other = await browser.newContext();
  try {
    const grant = new URL(joinUrl).hash.slice(7);
    const joined = await other.request.post("/api/guest/join", {
      headers: { Origin: origin },
      data: { grant },
    });
    expect(joined.ok()).toBe(true);
    const info = await joined.json(),
      identity = info.identity;
    const data = await checkoutVersions();
    const [one, two] = await Promise.all([
      guestCommand("REQUEST_CHECKOUT", data),
      other.request.post("/api/command", {
        headers: { Origin: origin, "X-CSRF-Token": info.csrfToken },
        data: {
          commandId: crypto.randomUUID(),
          action: "REQUEST_CHECKOUT",
          data,
          scope: {
            storeId: identity.storeId,
            visitId: identity.visitId,
            membershipId: identity.membershipId,
          },
        },
      }),
    ]);
    expect(one.ok()).toBe(true);
    expect(two.ok()).toBe(true);
    expect((await one.json()).checkoutId).toBe((await two.json()).checkoutId);
    expect(
      (await state()).checkouts.filter(
        (c: { visitId: string }) => c.visitId === visitId,
      ),
    ).toHaveLength(1);
  } finally {
    await other.request.post("/api/guest/leave", {
      headers: { Origin: origin },
      data: {},
    });
    await other.close();
  }
});

async function prepareCashier() {
  await join();
  await addAndSend();
  await expect(page.getByText(/Quán đã nhận đơn/)).toBeVisible();
  const order = (await orders())[0];
  for (const status of ["PREPARING", "READY", "SERVED"])
    await command("SET_ORDER_STATUS", { orderId: order.id, status });
  await command("REQUEST_CHECKOUT", await checkoutVersions());
  await command("ACK_CHECKOUT", await checkoutVersions());
  const adminPage = await owner.newPage();
  await adminPage.goto("/admin");
  const s = await state(),
    table = s.tables.find((t: { visitId: string }) => t.visitId === visitId);
  await adminPage
    .getByRole("button", { name: `Xem ${table.name}`, exact: true })
    .click();
  await adminPage
    .getByRole("button", { name: "Xem tạm tính", exact: true })
    .click();
  await adminPage
    .getByRole("button", { name: "Ghi nhận tiền mặt", exact: true })
    .click();
  return adminPage;
}

test("thu ngân mất ACK sau thu tiền: reload tra phiếu cũ, không thu lần hai", async () => {
  const adminPage = await prepareCashier();
  try {
    await adminPage.route("**/api/command", async (route) => {
      if (route.request().postDataJSON().action === "PAY_AND_CLOSE") {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        await route.abort("connectionfailed");
      } else await route.continue();
    });
    await adminPage
      .getByRole("button", { name: "Đã nhận tiền", exact: true })
      .click();
    await expect(adminPage.getByRole("alert")).toBeVisible();
    await adminPage.reload();
    await expect(adminPage.getByText(/Không thu lại/)).toBeVisible();
    expect(
      (await state()).tables.some(
        (t: { visitId: string }) => t.visitId === visitId,
      ),
    ).toBe(false);
    const checkout = await command("GET_CHECKOUT", { visitId });
    expect(checkout.checkout.state).toBe("PAID");
    expect(
      checkout.events.filter((e: { state: string }) => e.state === "PAID"),
    ).toHaveLength(1);
    await adminPage.screenshot({
      path: "test-results/staff-payment-recovery.png",
      fullPage: true,
    });
  } finally {
    await adminPage.close();
  }
});

test("thu ngân chưa nhận: reload chỉ đối chiếu; bỏ có barrier, không thu tiền", async () => {
  const adminPage = await prepareCashier();
  try {
    await adminPage.route("**/api/command", async (route) => {
      if (route.request().postDataJSON().action === "PAY_AND_CLOSE")
        await route.abort("connectionfailed");
      else await route.continue();
    });
    await adminPage
      .getByRole("button", { name: "Đã nhận tiền", exact: true })
      .click();
    await expect(adminPage.getByRole("alert")).toBeVisible();
    await adminPage.reload();
    await expect(
      adminPage.getByRole("button", {
        name: "Đã kiểm tra, thực hiện lại",
        exact: true,
      }),
    ).toBeEnabled();
    expect((await command("GET_CHECKOUT", { visitId })).checkout.state).toBe(
      "ACKNOWLEDGED",
    );
    await adminPage
      .getByRole("button", { name: "Bỏ thao tác chưa nhận", exact: true })
      .click();
    await expect(
      adminPage.getByText(/Đã bỏ thao tác chưa được nhận/),
    ).toBeVisible();
    expect((await command("GET_CHECKOUT", { visitId })).checkout.state).toBe(
      "ACKNOWLEDGED",
    );
  } finally {
    await adminPage.close();
  }
});

test("thu ngân quota trước gửi chặn thu tiền, sau reload vẫn chưa thanh toán", async () => {
  const adminPage = await prepareCashier();
  try {
    let payments = 0;
    adminPage.on("request", (request) => {
      if (
        request.url().endsWith("/api/command") &&
        request.postDataJSON()?.action === "PAY_AND_CLOSE"
      )
        payments++;
    });
    await adminPage.evaluate(() => {
      const original = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (
        ...args: Parameters<IDBObjectStore["add"]>
      ) {
        if (this.name === "commands")
          throw new DOMException("fixture quota", "QuotaExceededError");
        return original.apply(this, args);
      };
    });
    await adminPage
      .getByRole("button", { name: "Đã nhận tiền", exact: true })
      .click();
    await expect(adminPage.getByRole("alert")).toContainText(
      "nhật ký thu ngân",
    );
    expect(payments).toBe(0);
    expect((await command("GET_CHECKOUT", { visitId })).checkout.state).toBe(
      "ACKNOWLEDGED",
    );
    await adminPage.reload();
    await expect(
      adminPage.getByRole("button", { name: "Xem Bàn 1", exact: true }),
    ).toBeVisible();
  } finally {
    await adminPage.close();
  }
});

async function addAndSend() {
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Gửi đơn gọi món", exact: true })
    .click();
}
async function fault(action: string, accepted: boolean) {
  let captured: any;
  await page.route("**/api/command", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action !== action || captured) {
      await route.continue();
      return;
    }
    captured = body;
    if (accepted) {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
    }
    await route.abort("connectionfailed");
  });
  return () => captured;
}
async function orders() {
  return (await state()).orders.filter(
    (row: { visitId: string }) => row.visitId === visitId,
  );
}

test("mất ACK sau Core commit rồi tải lại: tra receipt, không tạo đơn thứ hai", async () => {
  await join();
  const captured = await fault("PLACE_ORDER", true);
  await addAndSend();
  await expect(page.getByRole("alert")).toContainText(
    "Kết quả thao tác có thể chưa rõ",
  );
  expect(await orders()).toHaveLength(1);
  expect(captured()).toBeTruthy();
  await page.reload();
  await expect(page.getByText(/Quán đã nhận đơn/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Xác nhận gửi lại", exact: true }),
  ).toHaveCount(0);
  expect(await orders()).toHaveLength(1);
  await expect(page.getByTestId("cart-total")).toContainText("0");
});

test("chưa được Core nhận: tải lại không tự gửi, khách xác nhận cùng mã và payload", async () => {
  await join();
  const captured = await fault("PLACE_ORDER", false);
  await addAndSend();
  await expect(page.getByRole("alert")).toBeVisible();
  const original = captured();
  expect(original).toBeTruthy();
  expect(await orders()).toHaveLength(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Xác nhận gửi lại", exact: true }),
  ).toBeEnabled();
  expect(await orders()).toHaveLength(0);
  await page.screenshot({
    path: "test-results/guest-order-recovery.png",
    fullPage: true,
  });
  let replay: any;
  await page.route("**/api/command", async (route) => {
    if (route.request().postDataJSON().action === "PLACE_ORDER")
      replay = route.request().postDataJSON();
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Xác nhận gửi lại", exact: true })
    .click();
  await expect(page.getByText(/Quán đã nhận đơn/)).toBeVisible();
  expect(replay).toEqual(original);
  expect(await orders()).toHaveLength(1);
});

test("bỏ yêu cầu chưa nhận bị mất ACK: tải lại tra tombstone, chặn lệnh đến muộn", async () => {
  await join();
  const captured = await fault("PLACE_ORDER", false);
  await addAndSend();
  await expect(page.getByRole("alert")).toBeVisible();
  const original = captured();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Bỏ yêu cầu chưa nhận", exact: true }),
  ).toBeEnabled();
  await fault("DISCARD_COMMAND", true);
  await page
    .getByRole("button", { name: "Bỏ yêu cầu chưa nhận", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  // Sending DISCARD is not itself proof that cancellation completed.
  await expect(page.getByText(/Đã bỏ yêu cầu chưa được nhận/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/Đã bỏ yêu cầu chưa được nhận/)).toBeVisible();
  const info = await (await guest.request.get("/api/session")).json();
  const late = await guest.request.post("/api/command", {
    headers: { Origin: origin, "X-CSRF-Token": info.csrfToken },
    data: original,
  });
  expect(late.status()).toBe(409);
  expect((await late.json()).code).toBe("COMMAND_DISCARDED");
  expect(await orders()).toHaveLength(0);
});

test("hai tab dùng chung giỏ: chặn gửi song song, giỏ cũ không trở thành đơn mới", async () => {
  await join();
  const second = await guest.newPage();
  await second.goto("/guest");
  await expect(
    second.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await expect(second.getByTestId("cart-total")).toContainText("30.000");
  let release!: () => void, arrive!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve)),
    arrived = new Promise<void>((resolve) => (arrive = resolve));
  let submissions = 0;
  await page.route("**/api/command", async (route) => {
    if (route.request().postDataJSON().action === "PLACE_ORDER") {
      submissions++;
      arrive();
      await held;
    }
    await route.continue();
  });
  let secondSubmissions = 0;
  second.on("request", (request) => {
    if (
      request.url().endsWith("/api/command") &&
      request.postDataJSON()?.action === "PLACE_ORDER"
    )
      secondSubmissions++;
  });
  try {
    await page
      .getByRole("button", { name: "Gửi đơn gọi món", exact: true })
      .click();
    await arrived;
    // The journal is already committed while the first HTTP request is held.
    await second.reload();
    await expect(
      second.getByRole("button", { name: "Gửi đơn gọi món", exact: true }),
    ).toBeDisabled();
    expect(await orders()).toHaveLength(0);
  } finally {
    release();
  }
  await expect(page.getByText(/Quán đã nhận đơn/)).toBeVisible();
  await expect(second.getByText(/Quán đã nhận đơn/)).toBeVisible();
  await expect(
    second.getByRole("button", { name: "Gửi đơn gọi món", exact: true }),
  ).toBeDisabled();
  expect(submissions).toBe(1);
  expect(secondSubmissions).toBe(0);
  expect(await orders()).toHaveLength(1);
});

test("lỗi ghi nhật ký trước gửi: không phát PLACE_ORDER ra mạng", async () => {
  await join();
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  // Inject a failure at the browser storage boundary, not in an owned module.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "commands")
        throw new DOMException("test quota fault", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  let submissions = 0;
  page.on("request", (request) => {
    if (
      request.url().endsWith("/api/command") &&
      request.postDataJSON()?.action === "PLACE_ORDER"
    )
      submissions++;
  });
  await page
    .getByRole("button", { name: "Gửi đơn gọi món", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("nhật ký trình duyệt");
  expect(submissions).toBe(0);
  expect(await orders()).toHaveLength(0);
  await page.reload();
  await expect(page.getByTestId("cart-total")).toContainText("30.000");
});

test("Core đã nhận nhưng ghi ACK vào IndexedDB lỗi: reload vẫn phục hồi một đơn", async () => {
  await join();
  await page.route("**/api/command", async (route) => {
    if (route.request().postDataJSON().action !== "PLACE_ORDER") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (
        ...args: Parameters<IDBObjectStore["put"]>
      ) {
        if (this.name === "commands")
          throw new DOMException("test quota fault", "QuotaExceededError");
        return original.apply(this, args);
      };
    });
    await route.fulfill({ response });
  });
  await addAndSend();
  await expect(page.getByRole("alert")).toContainText("nhật ký trình duyệt");
  expect(await orders()).toHaveLength(1);
  await page.reload();
  await expect(page.getByText(/Quán đã nhận đơn/)).toBeVisible();
  expect(await orders()).toHaveLength(1);
});

test("unknown intent khóa rời phiên; đóng lượt rồi reconnect không chuyển đơn sang lượt mới", async () => {
  await join();
  await fault("PLACE_ORDER", false);
  await addAndSend();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Rời phiên", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Có yêu cầu chưa rõ kết quả",
  );
  const old = visitId,
    table = (await state()).tables.find(
      (row: { visitId: string }) => row.visitId === old,
    );
  await command("CLOSE_EMPTY_TABLE", { visitId: old });
  visitId = (await command("OPEN_TABLE", { tableId: table.id })).visitId;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Cảm ơn bạn đã ghé quán", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Đã bỏ yêu cầu chưa được nhận/)).toBeVisible();
  expect(await orders()).toHaveLength(0);
  const info = await (await guest.request.get("/api/session")).json();
  expect(info.identity.visitId).toBe(old);
});

test("mất mạng rồi online: giữ giỏ, tự nối kênh đọc và không tự đặt món", async () => {
  await join();
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await guest.setOffline(true);
  await expect(
    page.getByRole("button", { name: "Gửi đơn gọi món", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("mất mạng");
  await guest.setOffline(false);
  await expect(
    page.getByRole("button", { name: "Gửi đơn gọi món", exact: true }),
  ).toBeEnabled();
  await expect(page.getByTestId("cart-total")).toContainText("30.000");
  expect(await orders()).toHaveLength(0);
  await page
    .getByRole("button", { name: "Gửi đơn gọi món", exact: true })
    .click();
  await expect(page.getByText(/Quán đã nhận đơn/)).toBeVisible();
});

test("lỗi kết nối kéo dài dừng retry; đổi foreground không tự bỏ giới hạn", async () => {
  await join();
  await page.clock.install();
  await guest.setOffline(true);
  let attempts = 0;
  await page.route("**/api/session", async (route) => {
    attempts++;
    await route.abort("connectionfailed");
  });
  await guest.setOffline(false);
  await expect.poll(() => attempts).toBeGreaterThan(0);
  // Skip timer callbacks but advance wall time, then run the next retry callback.
  await page.clock.fastForward(61_000);
  await expect(
    page.getByRole("button", { name: "Thử kết nối lại", exact: true }),
  ).toBeVisible();
  const stoppedAttempts = attempts;
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await page.clock.fastForward(20_000);
  expect(attempts).toBe(stoppedAttempts);
  await page.unroute("**/api/session");
  await page
    .getByRole("button", { name: "Thử kết nối lại", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toBeEnabled();
  expect(await orders()).toHaveLength(0);
});
