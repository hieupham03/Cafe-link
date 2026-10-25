import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
const origin='http://127.0.0.1:18080';
let owner:BrowserContext,guest:BrowserContext,page:Page,admin:Page,qr:any;
async function command(context:BrowserContext,action:string,data:unknown) {
  const info=await(await context.request.get(origin+'/api/session')).json();
  const r=await context.request.post(origin+'/api/command',{headers:{Origin:origin,'X-CSRF-Token':info.csrfToken},data:{commandId:crypto.randomUUID(),action,data,scope:info.identity}});
  expect(r.ok(),await r.text()).toBe(true);return r.json();
}
async function state(){return(await guest.request.get(origin+'/api/state')).json();}
async function buy(){
  await page.getByRole('button',{name:'Thêm Cà phê sữa',exact:true}).click();
  await expect(page.getByTestId('cart-total')).toContainText('30.000');
  await page.getByRole('button',{name:'Đặt món và thanh toán',exact:true}).click();
  const portal=page.getByRole('dialog',{name:'Cổng thanh toán giả lập'});await expect(portal).toBeVisible();
  await portal.getByRole('button',{name:'Giả lập thanh toán thành công',exact:true}).click();await expect(portal).not.toBeVisible();
  await expect.poll(async()=>(await state()).orders[0]?.paymentState).toBe('PAID');return(await state()).orders[0];
}
async function serve(id:number){for(const status of ['PREPARING','READY','SERVED'])await command(owner,'SET_ORDER_STATUS',{orderId:id,status});await expect(page.getByRole('heading',{name:'Cảm ơn bạn đã ghé quán',exact:true})).toBeVisible();}
test.beforeAll(async({browser})=>{
  owner=await browser.newContext();const r=await owner.request.post(origin+'/api/login',{headers:{Origin:origin},data:{username:'admin',password:'CafeLink@123'}});expect(r.ok()).toBe(true);
  await command(owner,'OPEN_ALL_TABLES',{});qr=await command(owner,'GET_TABLE_QR',{tableId:1});
});
test.beforeEach(async({browser})=>{
  guest=await browser.newContext({viewport:{width:390,height:844}});page=await guest.newPage();admin=await owner.newPage();
  await page.goto(qr.joinUrl);await page.getByRole('button',{name:'Vào bàn của tôi',exact:true}).click();await expect(page.getByRole('button',{name:'Thêm Cà phê sữa',exact:true})).toBeEnabled();await admin.goto(origin+'/admin');
});
test.afterEach(async()=>{await guest.close();await admin.close();});test.afterAll(async()=>{await owner.close();});

test('giao đơn đầu vẫn giữ giỏ tiếp theo, chuyển nháp có xác nhận và xem được đơn cũ',async()=>{
  const order=await buy();await page.getByRole('button',{name:'Thêm Trà đào',exact:true}).click();await expect(page.getByTestId('cart-total')).toContainText('40.000');await serve(order.id);
  await expect(page.locator('#guest-cart')).toBeVisible();await expect(page.getByTestId('cart-total')).toContainText('40.000');await expect(page.getByText(`Đơn #${order.id}`,{exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/workflow-completed-draft.png',fullPage:true});
  await page.getByRole('button',{name:'Bắt đầu lần đặt mới',exact:true}).click();await expect(page.getByRole('button',{name:'Đặt món và thanh toán',exact:true})).toBeEnabled();
  await expect(page.getByTestId('cart-total')).toContainText('40.000');expect((await state()).orders).toHaveLength(0);
  await page.reload();await expect(page.getByTestId('cart-total')).toContainText('40.000');await expect(page.getByTestId('previous-orders')).toContainText(`Đơn #${order.id}`);
  await page.screenshot({path:'test-results/workflow-continued-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Thêm nước lọc',exact:true}).click();await page.getByRole('button',{name:'Gọi nhân viên',exact:true}).click();await expect.poll(async()=>(await state()).tickets.length).toBe(1);
});
test('rời phiên có đơn đã trả bị chặn cả UI và API; nháp cần xác nhận',async()=>{
  const order=await buy();await page.getByRole('button',{name:'Rời phiên',exact:true}).click();await expect(page.getByRole('alert')).toContainText('còn đơn');
  const denied=await guest.request.post(origin+'/api/guest/leave',{headers:{Origin:origin},data:{}});expect(denied.status()).toBe(409);expect((await denied.json()).code).toBe('VISIT_HAS_WORK');expect((await state()).orders[0].id).toBe(order.id);
  await serve(order.id);await page.getByRole('button',{name:'Thêm Trà đào',exact:true}).click();await page.getByRole('button',{name:'Rời phiên',exact:true}).click();
  const confirm=page.getByRole('alertdialog',{name:'Xác nhận rời phiên'});await expect(confirm).toContainText('giỏ');await confirm.getByRole('button',{name:'Ở lại',exact:true}).click();await expect(page.getByTestId('cart-total')).toContainText('40.000');
});
test('mất phản hồi chuyển phiên vẫn phục hồi đúng một phiên kế tiếp và một giỏ nháp',async()=>{
  const order=await buy();await page.getByRole('button',{name:'Thêm Trà đào',exact:true}).click();await serve(order.id);
  const before=await(await guest.request.get(origin+'/api/session')).json();let lost=false;
  await page.route('**/api/guest/continue',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);lost=true;await route.abort('failed');});
  await page.getByRole('button',{name:'Bắt đầu lần đặt mới',exact:true}).click();await expect.poll(()=>lost).toBe(true);await page.reload();
  await expect(page.getByTestId('cart-total')).toContainText('40.000');const after=await(await guest.request.get(origin+'/api/session')).json();expect(after.identity.visitId).not.toBe(before.identity.visitId);
  const retry=await guest.request.post(origin+'/api/guest/continue',{headers:{Origin:origin,'X-CSRF-Token':after.csrfToken},data:{membershipId:before.identity.membershipId}});expect(retry.ok()).toBe(true);expect((await retry.json()).identity.visitId).toBe(after.identity.visitId);expect((await state()).orders).toHaveLength(0);
});
test('quầy từ chối và hoàn giả lập đơn chưa pha chế; khách thấy lý do, lịch sử giữ khoản thu gốc',async()=>{
  const order=await buy();await admin.getByRole('button',{name:/Quầy pha chế/}).click();await admin.getByRole('button',{name:`Từ chối / hoàn giả lập đơn #${order.id}`,exact:true}).click();
  const dialog=admin.getByRole('dialog',{name:'Xử lý đơn không phục vụ được'});await dialog.getByLabel('Lý do xử lý',{exact:true}).fill('Hết sữa');await dialog.getByRole('button',{name:'Xác nhận hoàn giả lập',exact:true}).click();await expect(dialog).not.toBeVisible();
  await expect.poll(async()=>(await state()).orders[0].paymentState).toBe('REFUNDED');await expect(page.locator('#guest-orders')).toContainText('Hết sữa');
  await admin.getByRole('button',{name:'Lịch sử hóa đơn',exact:true}).click();await admin.locator('.receipt-row').first().click();await expect(admin.getByRole('dialog',{name:'Chi tiết hóa đơn'})).toContainText('Hết sữa');
  await admin.screenshot({path:'test-results/workflow-refund-history.png'});
});
test('thu ngân hủy đơn chưa trả bị bỏ dở mà không cần quyền trình duyệt khách',async()=>{
  await page.getByRole('button',{name:'Thêm Cà phê sữa',exact:true}).click();await page.getByRole('button',{name:'Đặt món và thanh toán',exact:true}).click();
  await page.getByRole('dialog',{name:'Cổng thanh toán giả lập'}).getByRole('button',{name:'Đóng cổng giả lập',exact:true}).click();const order=(await state()).orders[0];
  await admin.getByRole('button',{name:/Thu ngân/}).click();await admin.getByRole('button',{name:`Hủy đơn chưa trả #${order.id}`,exact:true}).click();
  const dialog=admin.getByRole('dialog',{name:'Xử lý đơn không phục vụ được'});await dialog.getByLabel('Lý do xử lý',{exact:true}).fill('Khách bỏ đơn');await dialog.getByRole('button',{name:'Xác nhận hủy đơn chưa trả',exact:true}).click();await expect(dialog).not.toBeVisible();
  await expect.poll(async()=>(await state()).orders[0].paymentState).toBe('CANCELLED');expect((await command(owner,'GET_SALES_HISTORY',{})).receipts.some((r:any)=>r.orderId===order.id)).toBe(false);
});
test('lỗi ghi giỏ lúc chuyển phiên khóa gửi và reload phục hồi nháp từ transaction cũ',async()=>{
  const order=await buy();await page.getByRole('button',{name:'Thêm Trà đào',exact:true}).click();await serve(order.id);
  const before=await(await guest.request.get(origin+'/api/session')).json();
  await page.evaluate(oldMembership=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value:any,key?:IDBValidKey){if(this.name==='carts'&&value?.items?.length&&typeof value.scope==='string'&&!value.scope.includes(oldMembership))throw new DOMException('Simulated quota failure','QuotaExceededError');return key===undefined?original.call(this,value):original.call(this,value,key);};},before.identity.membershipId);
  await page.getByRole('button',{name:'Bắt đầu lần đặt mới',exact:true}).click();await expect(page.getByRole('button',{name:'Đặt món và thanh toán',exact:true})).toBeDisabled();await expect(page.getByRole('alert')).toContainText('nhật ký');
  expect((await state()).orders).toHaveLength(0);await page.reload();await expect(page.getByTestId('cart-total')).toContainText('40.000');await expect(page.getByRole('button',{name:'Đặt món và thanh toán',exact:true})).toBeEnabled();
});
test('mất phản hồi hoàn giả lập được đối chiếu sau reload, không tạo khoản hoàn thứ hai',async()=>{
  const order=await buy();let lost=false;
  await admin.route('**/api/command',async route=>{if(route.request().postDataJSON()?.action!=='RESOLVE_ORDER')return route.continue();const response=await route.fetch();expect(response.ok()).toBe(true);lost=true;await route.abort('failed');});
  await admin.getByRole('button',{name:/Quầy pha chế/}).click();await admin.getByRole('button',{name:`Từ chối / hoàn giả lập đơn #${order.id}`,exact:true}).click();
  const dialog=admin.getByRole('dialog',{name:'Xử lý đơn không phục vụ được'});await dialog.getByLabel('Lý do xử lý',{exact:true}).fill('Hết nguyên liệu');await dialog.getByRole('button',{name:'Xác nhận hoàn giả lập',exact:true}).click();await expect.poll(()=>lost).toBe(true);await admin.reload();
  await expect.poll(async()=>admin.evaluate(async orderId=>{const req=indexedDB.open('cafelink-staff-journal');const db=await new Promise<IDBDatabase>(ok=>req.onsuccess=()=>ok(req.result));try{const get=db.transaction('commands').objectStore('commands').getAll();const rows=await new Promise<any[]>(ok=>get.onsuccess=()=>ok(get.result));return rows.find(r=>r.action==='RESOLVE_ORDER'&&r.data.orderId===orderId)?.status;}finally{db.close();}},order.id)).toBe('ACCEPTED');
  const receipts=(await command(owner,'GET_SALES_HISTORY',{})).receipts.filter((r:any)=>r.orderId===order.id);expect(receipts).toHaveLength(1);expect(receipts[0].resolution.state).toBe('REFUNDED');
});
test('giỏ được chuyển vẫn phải xác nhận giá mới và không tự gửi đơn',async()=>{
  const order=await buy();await page.getByRole('button',{name:'Thêm Trà đào',exact:true}).click();await serve(order.id);
  const tea=(await state()).menu.find((m:any)=>m.id===5);await command(owner,'UPDATE_MENU_ITEM',{...tea,menuId:tea.id,expectedVersion:tea.version,priceVnd:49000});
  await page.getByRole('button',{name:'Bắt đầu lần đặt mới',exact:true}).click();await expect(page.getByRole('button',{name:'Cập nhật giỏ theo thực đơn mới'})).toBeVisible();await expect(page.getByRole('button',{name:'Đặt món và thanh toán',exact:true})).toBeDisabled();expect((await state()).orders).toHaveLength(0);
  await page.getByRole('button',{name:'Cập nhật giỏ theo thực đơn mới'}).click();await expect(page.getByTestId('cart-total')).toContainText('49.000');await expect(page.getByRole('button',{name:'Đặt món và thanh toán',exact:true})).toBeEnabled();
});
