// Opt-in Internet smoke against a dedicated demo database, outside the local E2E suite.
// CAFELINK_SMOKE_ORIGIN and CAFELINK_SMOKE_PASSWORD are environment-only inputs.
import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const origin = process.env.CAFELINK_SMOKE_ORIGIN,
  password = process.env.CAFELINK_SMOKE_PASSWORD;
if (!origin?.startsWith("https://") || !password)
  throw new Error(
    "Set CAFELINK_SMOKE_ORIGIN (HTTPS) and CAFELINK_SMOKE_PASSWORD for the isolated demo.",
  );
const evidence = {
  startedAt: new Date().toISOString(),
  origin,
  status: "RUNNING",
  physicalPhone: "NOT_RUN",
  checks: {},
  failedResources: [],
};
const browser = await chromium.launch();
const pending=new Map();
const loaded=[];
let diagnosticRequest;
try {
  const owner = await browser.newContext(),
    guest = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    other = await browser.newContext();
  diagnosticRequest=owner.request;
  const login = await owner.request.post(`${origin}/api/login`, {
    headers: { Origin: origin },
    data: { username: "admin", password },
  });
  expect(login.status(), await login.text()).toBe(200);
  const cookies = login
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value)
    .join(";");
  expect(cookies).toContain("Secure");
  expect(cookies).toContain("HttpOnly");
  evidence.checks.secureCookie = true;
  async function command(context, action, data) {
    const info = await (
      await context.request.get(`${origin}/api/session`)
    ).json();
    const r = await context.request.post(`${origin}/api/command`, {
      headers: { Origin: origin, "X-CSRF-Token": info.csrfToken },
      data: {
        commandId: crypto.randomUUID(),
        action,
        data,
        scope: info.identity,
      },
    });
    expect(r.status(), await r.text()).toBe(200);
    return r.json();
  }
  await command(owner, "OPEN_ALL_TABLES", {});
  const qr = await command(owner, "GET_TABLE_QR", { tableId: 1 });
  expect(qr.joinUrl).toContain(`${origin}/join#table=`);
  evidence.checks.publicQrOrigin = true;
  const admin = await owner.newPage(),
    page = await guest.newPage();
  for(const current of [admin,page]) {
    current.on('request',request=>{const url=new URL(request.url());pending.set(request,{host:url.hostname,path:url.pathname,type:request.resourceType()});});
    current.on('requestfinished',request=>{pending.delete(request);});
    current.on('response',response=>{const url=new URL(response.url());loaded.push({path:url.pathname,status:response.status()});});
    current.on('requestfailed',request=>{pending.delete(request);const url=new URL(request.url());evidence.failedResources.push({host:url.hostname,path:url.pathname,error:request.failure()?.errorText});});
  }
  let adminWs = false,
    guestWs = false;
  admin.on("websocket", (ws) => {
    if (ws.url() === origin.replace("https:", "wss:") + "/ws/state")
      adminWs = true;
  });
  page.on("websocket", (ws) => {
    if (ws.url() === origin.replace("https:", "wss:") + "/ws/state")
      guestWs = true;
  });
  await admin.goto(`${origin}/admin`);
  await expect(admin.getByText("● Đang kết nối", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await page.goto(qr.joinUrl);
  await page
    .getByRole("button", { name: "Vào bàn của tôi", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Thêm Cà phê sữa", exact: true }),
  ).toBeEnabled({ timeout: 20000 });
  expect(
    await page.evaluate(
      () =>
        isSecureContext &&
        typeof indexedDB !== "undefined" &&
        typeof navigator.locks !== "undefined",
    ),
  ).toBe(true);
  evidence.checks.secureBrowserRecoveryApis = true;
  const joined = await other.request.post(`${origin}/api/guest/join`, {
    headers: { Origin: origin },
    data: { grant: qr.grant, table: true },
  });
  expect(joined.status()).toBe(200);
  const first = await (await guest.request.get(`${origin}/api/session`)).json(),
    second = await joined.json();
  expect(first.identity.visitId).not.toBe(second.identity.visitId);
  await page
    .getByRole("button", { name: "Thêm Cà phê sữa", exact: true })
    .click();
  await page.getByRole("link", { name: /Xem giỏ · 1 phần/ }).click();
  await page
    .getByRole("button", { name: "Đặt món và thanh toán", exact: true })
    .click();
  const portal = page.getByRole("dialog", { name: "Cổng thanh toán giả lập" });
  await expect(portal).toBeVisible({ timeout: 20000 });
  await portal
    .getByRole("button", { name: "Giả lập thanh toán thành công", exact: true })
    .click();
  await expect(portal).not.toBeVisible({ timeout: 20000 });
  const own = await (await guest.request.get(`${origin}/api/state`)).json(),
    others = await (await other.request.get(`${origin}/api/state`)).json();
  expect(own.orders).toHaveLength(1);
  expect(others.orders).toHaveLength(0);
  expect(own.orders[0].paymentState).toBe("PAID");
  evidence.checks.privateOrdersAndPayment = true;
  for (const status of ["PREPARING", "READY", "SERVED"])
    await command(owner, "SET_ORDER_STATUS", {
      orderId: own.orders[0].id,
      status,
    });
  await expect(
    page.getByRole("heading", { name: "Cảm ơn bạn đã ghé quán", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  expect(adminWs && guestWs).toBe(true);
  evidence.checks.liveWssAndAutomaticCompletion = true;
  const denied = await owner.request.post(`${origin}/api/login`, {
    headers: { Origin: "https://untrusted.example" },
    data: {},
  });
  expect(denied.status()).toBe(403);
  evidence.checks.rejectWrongOrigin = true;
  const defaultLogin = await other.request.post(`${origin}/api/login`, {
    headers: { Origin: origin },
    data: { username: "admin", password: "CafeLink@123" },
  });
  expect(defaultLogin.status()).toBe(401);
  evidence.checks.defaultAdminPasswordRejected = true;
  for (const context of [guest, other])
    await context.request.post(`${origin}/api/guest/leave`, {
      headers: { Origin: origin },
      data: {},
    });
  evidence.status = "PASS";
} catch (e) {
  evidence.status = "FAIL";
  evidence.pendingResources=[...pending.values()];evidence.resourceResponses=loaded;
  const script=evidence.pendingResources.find(r=>r.type==='script');
  if(script&&diagnosticRequest) {
    evidence.assetDiagnostics=await Promise.all([{name:'local',base:process.env.CAFELINK_SMOKE_LOCAL_ORIGIN},{name:'public',base:origin}].filter(v=>v.base).map(async v=>{
      const started=Date.now();try{const response=await diagnosticRequest.get(v.base+script.path,{timeout:8000});return {name:v.name,status:response.status(),bytes:(await response.body()).length,elapsedMs:Date.now()-started};}catch{return {name:v.name,status:'TIMEOUT_OR_NETWORK_ERROR',elapsedMs:Date.now()-started};}
    }));
  }
  evidence.error = (e instanceof Error ? e.message : String(e)).replaceAll(password,'[REDACTED]').replace(/(#(?:table|grant)=)[A-Za-z0-9_-]+/g,'$1[REDACTED]');
  process.exitCode = 1;
} finally {
  await browser.close();
  evidence.finishedAt = new Date().toISOString();
  await writeFile(
    process.env.CAFELINK_SMOKE_RESULT ?? "test-results/public-smoke.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
}
