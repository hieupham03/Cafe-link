import { test, expect, type BrowserContext, type Page } from '@playwright/test';
const origin='http://127.0.0.1:18080';
let owner:BrowserContext,admin:Page,staff:BrowserContext,employee:Page,username:string;
const password='NhanVien@123';
async function command(context:BrowserContext,action:string,data:unknown={},id=crypto.randomUUID()){
  const info=await(await context.request.get(origin+'/api/session')).json();
  return context.request.post(origin+'/api/command',{headers:{Origin:origin,'X-CSRF-Token':info.csrfToken},data:{commandId:id,action,data,scope:info.identity}});
}
async function ok(context:BrowserContext,action:string,data:unknown={}){const r=await command(context,action,data);expect(r.ok(),await r.text()).toBe(true);return r.json();}
async function nav(page:Page,name:string){await page.getByRole('navigation',{name:'Điều hướng chính'}).getByRole('button',{name:new RegExp(name)}).click();}
async function login(page:Page,name=username,pass=password){await page.goto(origin+'/admin');await page.getByLabel('Tài khoản',{exact:true}).fill(name);await page.getByLabel('Mật khẩu',{exact:true}).fill(pass);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();}
test.beforeAll(async({browser})=>{owner=await browser.newContext();const r=await owner.request.post(origin+'/api/login',{headers:{Origin:origin},data:{username:'admin',password:'CafeLink@123'}});expect(r.ok()).toBe(true);await ok(owner,'OPEN_ALL_TABLES');});
test.beforeEach(async({browser})=>{username='nv_'+crypto.randomUUID().slice(0,8);await ok(owner,'CREATE_STAFF_ACCOUNT',{username,displayName:'Nhân viên kiểm quyền',password});admin=await owner.newPage();await admin.goto(origin+'/admin');staff=await browser.newContext({viewport:{width:390,height:844}});employee=await staff.newPage();await login(employee);await expect(employee.locator('.sidebar-bottom small')).toHaveText('Nhân viên phục vụ');});
test.afterEach(async()=>{await staff.close();await admin.close();});test.afterAll(async()=>{await owner.close();});

test('quản lý tạo nhân viên từ giao diện; nhân viên chỉ thấy bốn mục phục vụ',async({browser})=>{
  await nav(admin,'Nhân viên');await admin.getByRole('button',{name:'Thêm nhân viên',exact:true}).click();const d=admin.getByRole('dialog',{name:'Thêm nhân viên'});
  const user='nv_'+crypto.randomUUID().slice(0,8),field=d.getByLabel('Tài khoản nhân viên',{exact:true});await field.fill('ten co dau cach');expect(await field.evaluate((input:HTMLInputElement)=>input.validity.patternMismatch)).toBe(true);await field.fill(user);expect(await field.evaluate((input:HTMLInputElement)=>input.checkValidity())).toBe(true);await d.getByLabel('Họ tên nhân viên').fill('Nhân viên mới');await d.getByLabel('Mật khẩu ban đầu').fill(password);await d.getByRole('button',{name:'Tạo tài khoản nhân viên',exact:true}).click();await expect(d).not.toBeVisible();await expect(admin.locator('.staff-account-grid')).toContainText(user);
  const ctx=await browser.newContext(),p=await ctx.newPage();try{await login(p,user);const menu=p.getByRole('navigation',{name:'Điều hướng chính'});await expect(menu.getByRole('button')).toHaveCount(4);for(const label of ['Thu chi','Cài đặt quán','Nhân viên','Lịch sử hóa đơn','Chẩn đoán hệ thống','Thu ngân'])await expect(menu.getByRole('button',{name:label,exact:true})).toHaveCount(0);}finally{await ctx.close();}
  for(const name of ['Mở tất cả bàn','Tạm ngưng tất cả bàn','Kết thúc tất cả phiên QR'])await expect(employee.getByRole('button',{name,exact:true})).toHaveCount(0);await employee.getByRole('button',{name:'Xem Bàn 1',exact:true}).click();await expect(employee.getByRole('dialog').locator('.qr-card svg')).toBeVisible();await expect(employee.getByRole('button',{name:'Tạm dừng khách mới',exact:true})).toHaveCount(0);
  for(const button of await employee.getByRole('navigation',{name:'Điều hướng chính'}).getByRole('button').all()){await expect(button).toHaveCSS('white-space','nowrap');const box=(await button.boundingBox())!;expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeLessThan(240);}
  const qr=await ok(staff,'GET_TABLE_QR',{tableId:1}),entry=await staff.newPage();await entry.goto(qr.joinUrl);await expect(entry.getByRole('heading',{name:'Bạn đang đăng nhập nhân viên',exact:true})).toBeVisible();await expect(entry.getByRole('link',{name:'Về màn hình nhân viên',exact:true})).toBeVisible();await entry.close();
});
test('nhân viên gọi API trực tiếp vẫn không đọc tiền, sửa giá, hoàn tiền hoặc quản lý tài khoản',async()=>{
  for(const action of ['GET_FINANCE_REPORT','GET_TAX_SETTINGS','SAVE_TAX_SETTINGS','CREATE_EXPENSE','VOID_EXPENSE','GET_SALES_HISTORY','GET_SALES_RECEIPT','CREATE_MENU_ITEM','UPDATE_MENU_ITEM','GET_STAFF_ACCOUNTS','GET_STAFF_AUDIT','CREATE_STAFF_ACCOUNT','SET_STAFF_ACTIVE','RESET_STAFF_PASSWORD','PAUSE_ALL_TABLES','END_ALL_TABLE_SESSIONS'])expect((await command(staff,action)).status(),action).toBe(403);
  expect((await command(staff,'RESOLVE_ORDER',{orderId:1,resolution:'REFUND',reason:'Không được phép'})).status()).toBe(403);
  expect((await staff.request.get(origin+'/api/admin/diagnostics')).status()).toBe(403);
  const info=await(await staff.request.get(origin+'/api/session')).json();expect((await staff.request.post(origin+'/api/menu/image',{headers:{Origin:origin,'X-CSRF-Token':info.csrfToken,'Content-Type':'image/png'},data:Buffer.from([1,2,3])})).status()).toBe(403);
  await expect(employee.getByRole('alert')).toHaveCount(0);
});
test('nhân viên tiếp nhận, khách trả tiền, nhân viên giao đồ và quản lý xem được người thực hiện',async({browser})=>{
  const qr=await ok(owner,'GET_TABLE_QR',{tableId:1}),guest=await browser.newContext(),p=await guest.newPage();
  try{await p.goto(qr.joinUrl);await p.getByRole('button',{name:'Vào bàn của tôi',exact:true}).click();await p.getByRole('button',{name:'Thêm Cà phê sữa',exact:true}).click();await p.getByRole('link',{name:/^Giỏ hàng [0-9]+$/}).click();await p.getByRole('button',{name:'Gửi đơn gọi món',exact:true}).click();await expect.poll(async()=>(await(await guest.request.get(origin+'/api/state')).json()).orders.length).toBe(1);const order=(await(await guest.request.get(origin+'/api/state')).json()).orders[0];
    await nav(employee,'Quầy pha chế');await employee.getByRole('button',{name:`Tiếp nhận đơn #${order.id}`,exact:true}).click();await p.getByRole('link',{name:/^Thanh toán [0-9]+$/}).click();await p.getByRole('button',{name:`Thanh toán đơn #${order.id}`,exact:true}).click();await p.getByRole('button',{name:'Giả lập thanh toán thành công',exact:true}).click();
    const card=employee.locator('.order-card').filter({hasText:`#${order.id}`});await expect(card.getByRole('button',{name:/hoàn giả lập/})).toHaveCount(0);for(const name of ['Bắt đầu pha chế','Pha chế xong','Đã mang ra bàn'])await card.getByRole('button',{name,exact:true}).click();
    await expect.poll(async()=>(await(await guest.request.get(origin+'/api/state')).json()).orders[0].status).toBe('SERVED');await nav(admin,'Nhân viên');const audit=admin.locator('.staff-audit');await expect(audit).toContainText(username);await expect(audit).toContainText('Tiếp nhận đơn');
  }finally{await guest.close();}
});
test('nhân viên chỉ đổi còn bán hoặc hết món, giá và nội dung được giữ nguyên',async()=>{
  const before=(await(await owner.request.get(origin+'/api/state')).json()).menu.find((i:any)=>i.id===2);await nav(employee,'Thực đơn');await expect(employee.getByRole('button',{name:'Thêm món',exact:true})).toHaveCount(0);await employee.getByRole('button',{name:'Đánh dấu hết Cà phê sữa',exact:true}).click();await expect(employee.getByRole('button',{name:'Cho bán lại Cà phê sữa',exact:true})).toBeVisible();
  const after=(await(await owner.request.get(origin+'/api/state')).json()).menu.find((i:any)=>i.id===2);expect(after.available).toBe(false);expect(after.priceVnd).toBe(before.priceVnd);expect(after.name).toBe(before.name);
  await employee.getByRole('button',{name:'Cho bán lại Cà phê sữa',exact:true}).click();await expect(employee.getByRole('button',{name:'Đánh dấu hết Cà phê sữa',exact:true})).toBeVisible();
});
test('khóa nhân viên thu hồi mọi tab; mở khóa cần đăng nhập lại và không khóa quản lý',async()=>{
  const second=await staff.newPage();await second.goto(origin+'/admin');await expect(second.locator('.sidebar-bottom small')).toHaveText('Nhân viên phục vụ');
  await nav(admin,'Nhân viên');await admin.getByRole('button',{name:`Khóa ${username}`,exact:true}).click();const d=admin.getByRole('dialog',{name:'Đổi trạng thái nhân viên'});await d.getByRole('button',{name:'Xác nhận khóa nhân viên',exact:true}).click();await expect(d).not.toBeVisible();
  for(const p of [employee,second]){await expect(p.getByRole('heading',{name:'Đăng nhập quầy',exact:true})).toBeVisible();await expect(p.getByRole('alert')).toContainText('thu hồi');}
  expect((await staff.request.get(origin+'/api/state')).status()).toBe(401);await admin.getByRole('button',{name:`Mở khóa ${username}`,exact:true}).click();await admin.getByRole('button',{name:'Xác nhận mở khóa',exact:true}).click();expect((await staff.request.get(origin+'/api/state')).status()).toBe(401);
  await login(employee);await expect(employee.locator('.sidebar-bottom small')).toHaveText('Nhân viên phục vụ');await expect(admin.getByRole('navigation',{name:'Điều hướng chính'})).toBeVisible();await second.close();
});
test('đặt lại mật khẩu thu hồi phiên, mật khẩu không nằm trong journal hoặc response',async()=>{
  await nav(admin,'Nhân viên');await admin.getByRole('button',{name:`Đặt lại mật khẩu ${username}`,exact:true}).click();const d=admin.getByRole('dialog',{name:'Đặt lại mật khẩu nhân viên'}),next='NewNhanVien@456';await d.getByLabel('Mật khẩu mới').fill(next);await d.getByRole('button',{name:'Đổi mật khẩu và thu hồi phiên',exact:true}).click();await expect(d).not.toBeVisible();await expect(employee.getByRole('heading',{name:'Đăng nhập quầy',exact:true})).toBeVisible();
  await login(employee,username,password);await expect(employee.getByRole('alert')).toContainText('Sai tài khoản');await employee.getByLabel('Mật khẩu',{exact:true}).fill(next);await employee.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(employee.locator('.sidebar-bottom small')).toHaveText('Nhân viên phục vụ');
  const result=await ok(owner,'GET_STAFF_ACCOUNTS');expect(JSON.stringify(result)).not.toContain(next);expect(JSON.stringify(await ok(owner,'GET_STAFF_AUDIT'))).not.toContain(next);
  const rows=await admin.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('cafelink-staff-journal',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{if(!db.objectStoreNames.contains('commands'))return [];return await new Promise<unknown[]>((resolve,reject)=>{const r=db.transaction('commands').objectStore('commands').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}});expect(JSON.stringify(rows)).not.toContain(next);
});
test('mất phản hồi tạo tài khoản gửi lại cùng mã không tạo hai tài khoản',async()=>{
  await nav(admin,'Nhân viên');await admin.getByRole('button',{name:'Thêm nhân viên',exact:true}).click();const d=admin.getByRole('dialog',{name:'Thêm nhân viên'}),user='nv_'+crypto.randomUUID().slice(0,8);await d.getByLabel('Tài khoản nhân viên',{exact:true}).fill(user);await d.getByLabel('Họ tên nhân viên').fill('Kiểm mất phản hồi');await d.getByLabel('Mật khẩu ban đầu').fill(password);
  let lost=false;await admin.route('**/api/command',async route=>{if(route.request().postDataJSON()?.action!=='CREATE_STAFF_ACCOUNT'||lost)return route.continue();lost=true;const r=await route.fetch();expect(r.ok()).toBe(true);await route.abort('failed');});
  await d.getByRole('button',{name:'Tạo tài khoản nhân viên',exact:true}).click();await expect(d.getByRole('alert')).toBeVisible();await d.getByRole('button',{name:'Tạo tài khoản nhân viên',exact:true}).click();await expect(d).not.toBeVisible();await admin.unrouteAll();expect((await ok(owner,'GET_STAFF_ACCOUNTS')).accounts.filter((a:any)=>a.username===user)).toHaveLength(1);
});

test('nhân viên mất phản hồi tiếp nhận: tải lại đối chiếu kết quả, không tạo thao tác thứ hai',async({browser})=>{
  const qr=await ok(owner,'GET_TABLE_QR',{tableId:2}),guest=await browser.newContext(),p=await guest.newPage();
  try {
    await p.goto(qr.joinUrl);await p.getByRole('button',{name:'Vào bàn của tôi',exact:true}).click();
    await p.getByRole('button',{name:'Thêm Cà phê sữa',exact:true}).click();await p.getByRole('link',{name:/^Giỏ hàng [0-9]+$/}).click();await p.getByRole('button',{name:'Gửi đơn gọi món',exact:true}).click();
    await expect.poll(async()=>(await(await guest.request.get(origin+'/api/state')).json()).orders.length).toBe(1);
    const order=(await(await guest.request.get(origin+'/api/state')).json()).orders[0];
    await nav(employee,'Quầy pha chế');let id='';
    await employee.route('**/api/command',async route=>{
      const body=route.request().postDataJSON();if(body?.action!=='ACCEPT_ORDER')return route.continue();
      id=body.commandId;const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');
    });
    await employee.getByRole('button',{name:`Tiếp nhận đơn #${order.id}`,exact:true}).click();
    await expect(employee.getByRole('alert').first()).toBeVisible();expect(id).not.toBe('');
    await employee.unrouteAll();await employee.reload();
    await expect(employee.getByRole('navigation',{name:'Điều hướng chính'})).toBeVisible();
    const outcome=await ok(staff,'GET_OUTCOME',{commandId:id});expect(outcome.found).toBe(true);
    await expect.poll(async()=>employee.evaluate(async(commandId)=>{
      const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('cafelink-staff-journal',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      try{return await new Promise<string>((resolve,reject)=>{const r=db.transaction('commands').objectStore('commands').get(commandId);r.onsuccess=()=>resolve(r.result?.status);r.onerror=()=>reject(r.error);});}finally{db.close();}
    },id)).toBe('ACCEPTED');
    const audit=(await ok(owner,'GET_STAFF_AUDIT')).entries.filter((r:any)=>r.actor===username&&r.action==='ACCEPT_ORDER'&&r.entityId===String(order.id));expect(audit).toHaveLength(1);
    const state=await(await guest.request.get(origin+'/api/state')).json();expect(state.orders).toHaveLength(1);expect(state.orders[0].acceptanceState).toBe('ACCEPTED');expect(state.orders[0].paymentState).toBe('UNPAID');
  }finally{await guest.close();}
});
