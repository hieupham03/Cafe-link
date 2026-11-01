import {test,expect,type BrowserContext,type Page} from "@playwright/test";
const origin="http://127.0.0.1:18080";let owner:BrowserContext,guest:BrowserContext,page:Page;
async function command(action:string,data:unknown={}){const info=await(await owner.request.get(origin+"/api/session")).json();const r=await owner.request.post(origin+"/api/command",{headers:{Origin:origin,"X-CSRF-Token":info.csrfToken},data:{action,data,commandId:crypto.randomUUID()}});expect(r.ok(),await r.text()).toBe(true);return r.json();}
test.beforeAll(async({browser})=>{owner=await browser.newContext();await owner.request.post(origin+"/api/login",{headers:{Origin:origin},data:{username:"admin",password:"CafeLink@123"}});await command("OPEN_ALL_TABLES");});
test.beforeEach(async({browser})=>{guest=await browser.newContext();page=await guest.newPage();const qr=await command("GET_TABLE_QR",{tableId:1});await page.goto(qr.joinUrl);await page.getByRole("button",{name:"Vào bàn của tôi",exact:true}).click();await page.getByRole("button",{name:"Thêm Cà phê sữa",exact:true}).waitFor();});
test.afterEach(async()=>{await guest.close();});test.afterAll(async()=>{await owner.close();});
test("all eight contributed photos load from this server with correct image MIME",async()=>{
  const images=page.locator(".menu-card .menu-photo");await expect(images).toHaveCount(8);
  for(const img of await images.all()){await img.scrollIntoViewIfNeeded();await expect.poll(()=>img.evaluate((e:HTMLImageElement)=>e.complete&&e.naturalWidth>0)).toBe(true);const src=await img.getAttribute("src");expect(src).toMatch(/^\/images\/menu\/[a-z_]+\.jpg$/);const r=await guest.request.get(origin+src);expect(r.ok()).toBe(true);expect(r.headers()["content-type"]).toBe("image/jpeg");expect((await r.body()).subarray(0,2).toString("hex")).toBe("ffd8");}
});
test("renaming a sample drink does not reuse a photo for an unrelated product",async()=>{
  const state=await(await owner.request.get(origin+"/api/state")).json(),item=state.menu.find((m:any)=>m.id===2);await command("UPDATE_MENU_ITEM",{...item,menuId:item.id,name:"Đồ uống riêng của quán",expectedVersion:item.version});const card=page.locator(".menu-card").filter({has:page.getByRole("heading",{name:"Đồ uống riêng của quán",exact:true})});await expect(card).toBeVisible();await expect(card.locator(".menu-photo")).toHaveCount(0);await expect(card.locator(".menu-placeholder")).toBeVisible();
});
