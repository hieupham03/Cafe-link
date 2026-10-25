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

test('hai ly cùng món khác ghi chú giữ đúng qua reload, mất ACK và quầy',async()=>{
 for(const note of ['Ít đá','Không đường']){await page.getByRole('button',{name:'Chi tiết Cà phê sữa',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Cà phê sữa',exact:true});await dialog.getByLabel('Ghi chú riêng cho phần này').fill(note);await dialog.getByRole('button',{name:'Thêm vào giỏ',exact:true}).click();}
 await page.getByRole('button',{name:'Tăng Cà phê sữa · Ít đá',exact:true}).click();await expect(page.getByLabel('Số lượng Cà phê sữa · Ít đá',{exact:true})).toHaveText('2');await expect(page.getByLabel('Số lượng Cà phê sữa · Không đường',{exact:true})).toHaveText('1');await page.getByRole('button',{name:'Bớt Cà phê sữa · Ít đá',exact:true}).click();await expect(page.getByTestId('cart-total')).toContainText('60.000');await page.reload();await expect(page.getByTestId('cart-total')).toContainText('60.000');
 await page.route('**/api/command',async route=>{if(route.request().postDataJSON()?.action!=='PLACE_ORDER')return route.continue();const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');});
 await page.getByRole('button',{name:'Đặt món và thanh toán',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await page.unrouteAll();await page.reload();await expect(page.getByText(/Đã lưu đơn #/)).toBeVisible();
 const orders=(await state()).orders;expect(orders).toHaveLength(1);expect(orders[0].items.map((i:any)=>i.note)).toEqual(['Ít đá','Không đường']);
 await page.getByRole('button',{name:`Thanh toán đơn #${orders[0].id}`,exact:true}).click();await page.getByRole('button',{name:'Giả lập thanh toán thành công',exact:true}).click();
 await admin.getByRole('button',{name:/Quầy pha chế/}).click();const card=admin.locator('.order-card').filter({hasText:`#${orders[0].id}`});await expect(card).toContainText('Ít đá');await expect(card).toContainText('Không đường');await admin.screenshot({path:'test-results/v92-kitchen-notes.png',fullPage:true});
});
test('bổ sung mất phản hồi vẫn một ticket; khách rút yêu cầu không mua thêm',async()=>{
 await page.getByLabel('Lời nhắn cho nhân viên',{exact:true}).fill('Thêm nước');await page.getByRole('button',{name:'Gọi nhân viên',exact:true}).click();await expect.poll(async()=>(await state()).tickets.length).toBe(1);const ticket=(await state()).tickets[0];
 await page.getByLabel('Lời nhắn cho nhân viên',{exact:true}).fill('Thêm khăn');await page.route('**/api/command',async route=>{if(route.request().postDataJSON()?.action!=='AMEND_SERVICE')return route.continue();const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');});
 await page.getByRole('button',{name:`Bổ sung yêu cầu #${ticket.id}`,exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await page.unrouteAll();await page.reload();await expect(page.getByText(/Quán đã nhận nội dung bổ sung/)).toBeVisible();expect((await state()).tickets).toHaveLength(1);expect((await state()).tickets[0].note).toContain('Thêm khăn');
 await page.getByRole('button',{name:`Rút yêu cầu #${ticket.id}`,exact:true}).click();await expect.poll(async()=>(await state()).tickets[0].status).toBe('CANCELLED');await expect(page.getByText(/Đã rút yêu cầu/)).toBeVisible();
});
test('âm thanh lưu lựa chọn nhưng reload phải hiển thị cần kích hoạt',async()=>{
 await admin.getByRole('button',{name:'Kích hoạt chuông quầy',exact:true}).click();await expect(admin.getByText('Âm thanh quầy: đang bật',{exact:true})).toBeVisible();await admin.reload();await expect(admin.getByText('Âm thanh quầy: cần kích hoạt sau tải lại',{exact:true})).toBeVisible();await admin.getByRole('button',{name:'Kích hoạt chuông quầy',exact:true}).click();await expect(admin.getByText('Âm thanh quầy: đang bật',{exact:true})).toBeVisible();
});
test('tạm dừng toàn quán chặn đơn mới nhưng vẫn thanh toán đơn đã nhận và gọi hỗ trợ',async()=>{
 await page.getByRole('button',{name:'Thêm Cà phê sữa',exact:true}).click();await page.getByRole('button',{name:'Đặt món và thanh toán',exact:true}).click();await page.getByRole('button',{name:'Đóng cổng giả lập',exact:true}).click();const order=(await state()).orders[0];
 await admin.getByRole('button',{name:'Tạm dừng đơn mới toàn quán',exact:true}).click();await expect.poll(async()=>(await state()).storeAcceptingOrders).toBe(false);await page.getByRole('button',{name:'Thêm Cà phê sữa',exact:true}).click();await expect(page.getByRole('button',{name:'Đặt món và thanh toán',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:`Thanh toán đơn #${order.id}`,exact:true}).click();await page.getByRole('button',{name:'Giả lập thanh toán thành công',exact:true}).click();await expect.poll(async()=>(await state()).orders[0].paymentState).toBe('PAID');await expect(page.getByRole('button',{name:'Gọi nhân viên',exact:true})).toBeEnabled();await admin.getByRole('button',{name:'Tiếp tục nhận đơn toàn quán',exact:true}).click();
});
test('quầy tra mã hỗ trợ để biết lệnh đã nhận, không phải đặt đơn thay thế',async()=>{
 const info=await(await guest.request.get(origin+'/api/session')).json();const id=crypto.randomUUID();const r=await guest.request.post(origin+'/api/command',{headers:{Origin:origin,'X-CSRF-Token':info.csrfToken},data:{commandId:id,action:'PLACE_ORDER',scope:info.identity,data:{visitId:info.identity.visitId,items:[{menuId:2,quantity:1,expectedVersion:1,expectedPriceVnd:30000}]}}});expect(r.ok()).toBe(true);
 await admin.getByRole('button',{name:'Tra cứu hỗ trợ',exact:true}).click();await admin.getByLabel('Mã hỗ trợ hoặc số đơn').fill(id);await admin.getByRole('button',{name:'Tra cứu',exact:true}).click();await expect(admin.getByText('Server đã tiếp nhận',{exact:true})).toBeVisible();await admin.screenshot({path:'test-results/v92-assistance.png',fullPage:true});
});
test('sửa mô tả không chặn giỏ nhưng đổi giá phải xác nhận',async()=>{
 await page.getByRole('button',{name:'Thêm Trà đào',exact:true}).click();let item=(await state()).menu.find((m:any)=>m.id===5);await command(owner,'UPDATE_MENU_ITEM',{...item,menuId:5,expectedVersion:item.version,description:'Nội dung trình bày mới'});await page.waitForTimeout(300);await expect(page.getByRole('button',{name:'Cập nhật giỏ theo thực đơn mới'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Đặt món và thanh toán',exact:true})).toBeEnabled();
 item=(await state()).menu.find((m:any)=>m.id===5);await command(owner,'UPDATE_MENU_ITEM',{...item,menuId:5,expectedVersion:item.version,priceVnd:49000});await expect(page.getByRole('button',{name:'Cập nhật giỏ theo thực đơn mới'})).toBeVisible();await expect(page.getByRole('button',{name:'Đặt món và thanh toán',exact:true})).toBeDisabled();
});
