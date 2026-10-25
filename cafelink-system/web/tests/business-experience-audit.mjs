// Exploratory V9 workflow audit. Observations, including reproduced gaps, are not product acceptance PASS.
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer,connect } from 'node:net';
import { mkdir,writeFile,readFile,open } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { PNG } from 'pngjs';

const options=Object.fromEntries(process.argv.slice(2).map(v=>{const i=v.indexOf('=');return[v.slice(2,i),v.slice(i+1)];}));
const release=resolve(options.release??'../../dist/CafeLink-Web-V9');
const output=resolve(options.output??`../../report/evidence/cafelink-v2/experience-audit/${new Date().toISOString().replace(/[:.]/g,'-')}`);
const privateRoot=resolve('../target/experience-audit',crypto.randomUUID());
await mkdir(output,{recursive:true});await mkdir(privateRoot,{recursive:true});
const observations=[],contexts=[];
let fixture;
const metadata={status:'RUNNING',startedAt:new Date().toISOString(),release:'V9',jarSha256:JSON.parse((await readFile(join(release,'RELEASE.json'),'utf8')).replace(/^\uFEFF/, '')).jarSha256,method:'Exploratory Chromium/browser and API scenarios on an owned real Java Gateway/TCP/SQLite fixture. No real customers interviewed.',physicalPhone:'NOT_RUN',humanUsabilityStudy:'NOT_RUN'};
await writeFile(join(output,'metadata.json'),JSON.stringify(metadata,null,2));
const browser=await chromium.launch();
async function observe(id,title,action) {
  try {const data=await action();observations.push({id,title,...data,status:'OBSERVED'});}
  catch(error){observations.push({id,title,status:'HARNESS_ERROR',error:error.message});console.log(`${id} HARNESS_ERROR`);}
  await writeFile(join(output,'observations.json'),JSON.stringify(observations,null,2));
  console.log(`${id}: ${observations.at(-1).status}`);
}
async function openPortPair(){const sockets=[createServer(),createServer()];for(const s of sockets)await new Promise(ok=>s.listen(0,'127.0.0.1',ok));const values=sockets.map(s=>s.address().port);for(const s of sockets)await new Promise(ok=>s.close(ok));return values;}
const isOpen=port=>new Promise(ok=>{const socket=connect(port,'127.0.0.1');socket.once('connect',()=>{socket.destroy();ok(true);});socket.once('error',()=>ok(false));});
async function start(name){
  const [port,tcp]=await openPortPair(),origin=`http://127.0.0.1:${port}`,directory=join(privateRoot,name);await mkdir(directory,{recursive:true});
  const log=await open(join(directory,'server.log'),'a');
  const child=spawn(join(release,'runtime/bin/java.exe'),['-cp',`${join(release,'target/cafelink-1.0.0.jar')};${join(release,'target/lib/*')}`,'com.cafelink.web.WebMain',`--port=${port}`,`--tcp-port=${tcp}`,`--db=${join(directory,'cafelink.db')}`,`--assets=${join(release,'web/dist')}`,'--ordering-mode=prepay'],{cwd:release,windowsHide:true,stdio:['ignore',log.fd,log.fd]});await log.close();
  fixture={child,origin,ports:[port,tcp]};
  for(let n=0;n<150;n++){if(child.exitCode!==null)throw new Error('Owned fixture JVM exited');try{if((await fetch(origin+'/api/health')).ok)return fixture;}catch{}await pause(100);}
  throw new Error('Owned fixture did not become ready');
}
async function stop(){
  for(const c of contexts.splice(0))await c.close();
  if(fixture){const owned=fixture;owned.child.kill();for(let n=0;n<100;n++){if(!(await isOpen(owned.ports[0]))&&!(await isOpen(owned.ports[1]))){fixture=undefined;return;}await pause(50);}throw new Error('Owned listeners remained open');}
}
async function actor(role='guest',qr){
  const context=await browser.newContext({viewport:role==='admin'?{width:1440,height:900}:{width:390,height:844}});contexts.push(context);
  const page=await context.newPage(),origin=fixture.origin;
  if(role==='admin'){
    await page.goto(origin+'/admin');await page.getByLabel('Tài khoản',{exact:true}).fill('admin');await page.getByLabel('Mật khẩu',{exact:true}).fill('CafeLink@123');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.getByRole('button',{name:/Sơ đồ bàn/})).toBeVisible();
  } else {
    await page.goto(qr.joinUrl);await page.getByRole('button',{name:'Vào bàn của tôi',exact:true}).click();await expect(page.getByRole('button',{name:'Thêm Cà phê sữa',exact:true})).toBeEnabled();
  }
  return {context,page,origin,session:await (await context.request.get(origin+'/api/session')).json()};
}
async function command(a,action,data,throwFailure=true){
  const session=await (await a.context.request.get(a.origin+'/api/session')).json();
  const r=await a.context.request.post(a.origin+'/api/command',{headers:{Origin:a.origin,'X-CSRF-Token':session.csrfToken},data:{commandId:crypto.randomUUID(),action,data,scope:session.identity}});
  const value=await r.json();if(throwFailure&&!r.ok())throw new Error(action+': '+value.code);return {http:r.status(),...value};
}
const snapshot=async a=>(await a.context.request.get(a.origin+'/api/state')).json();
async function place(a,menuId=2){const item=(await snapshot(a)).menu.find(i=>i.id===menuId);return command(a,'PLACE_ORDER',{visitId:a.session.identity.visitId,items:[{menuId,quantity:1,expectedVersion:item.version,expectedPriceVnd:item.priceVnd}]});}
async function paid(a,order){const p=await command(a,'START_ORDER_PAYMENT',{visitId:a.session.identity.visitId,orderId:order.orderId});await command(a,'SIMULATE_PAYMENT',{...p,outcome:'SUCCESS'});}
async function serve(admin,id){for(const status of ['PREPARING','READY','SERVED'])await command(admin,'SET_ORDER_STATUS',{orderId:id,status});}
async function cart(a){return a.page.evaluate(async()=>{const request=indexedDB.open('cafelink-web-journal');const db=await new Promise((ok,no)=>{request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error);});try{const tx=db.transaction('carts');const r=tx.objectStore('carts').getAll();return await new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result.map(c=>({items:c.items,note:c.note})));r.onerror=()=>no(r.error);});}finally{db.close();}});}
try {
 await start('journeys');const admin=await actor('admin');
 await observe('A01','Owner opening, layout and roles',async()=>{
  await admin.page.getByRole('button',{name:'Mở tất cả bàn',exact:true}).click();
  const s=await snapshot(admin);await admin.page.screenshot({path:join(output,'01-admin-home.png'),fullPage:true});
  await expect.poll(async()=>(await snapshot(admin)).tables.filter(t=>t.acceptingOrders).length).toBe(s.tables.length);
  return {enabledTables:(await snapshot(admin)).tables.filter(t=>t.acceptingOrders).length,adminRoles:['ADMIN'],sidebar:await admin.page.getByRole('navigation',{name:'Điều hướng chính'}).innerText()};
 });
 const qr=await command(admin,'GET_TABLE_QR',{tableId:1}),qr2=await command(admin,'GET_TABLE_QR',{tableId:2});
 const a=await actor('guest',qr),b=await actor('guest',qr);
 await observe('A02','First visit on small screens, menu and touch controls',async()=>{
  const viewports=[];
  for(const width of [320,390,768,1440]){
   await a.page.setViewportSize({width,height:844});
   viewports.push(await a.page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,visibleProducts:document.querySelectorAll('.menu-card').length,smallTargets:[...document.querySelectorAll('button,a')].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&(r.width<24||r.height<24);}).map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})).slice(0,25)})));
  }
  await a.page.setViewportSize({width:390,height:844});await a.page.screenshot({path:join(output,'02-guest-first-mobile.png'),fullPage:true});
  await a.page.getByRole('button',{name:'Chi tiết Cà phê sữa',exact:true}).click();const dialog=a.page.getByRole('dialog',{name:'Cà phê sữa',exact:true});
  const options=await dialog.locator('input,select,textarea,output').evaluateAll(nodes=>nodes.map(n=>({tag:n.tagName,label:n.getAttribute('aria-label')||n.getAttribute('name')||'',type:n.getAttribute('type')})));
  await a.page.screenshot({path:join(output,'03-item-options.png')});await dialog.getByRole('button',{name:'Đóng chi tiết món'}).click();
  return {viewports,itemOptions:options,privateVisit:a.session.identity.visitId!==b.session.identity.visitId};
 });
 await observe('A03','Scanning another table while a visit is open',async()=>{
  await a.page.goto(qr2.joinUrl);await a.page.waitForTimeout(700);
  const session=await (await a.context.request.get(a.origin+'/api/session')).json();
  const data={tableAfterScan:session.identity?.tableId,visibleHeading:await a.page.locator('h1').allTextContents(),alerts:await a.page.getByRole('alert').allTextContents()};
  await a.page.screenshot({path:join(output,'04-scan-other-table.png'),fullPage:true});await a.page.goto(a.origin+'/guest');return data;
 });
 await observe('A04','Non-price menu edit interrupts a customer cart',async()=>{
  await a.page.getByRole('button',{name:'Thêm Cà phê sữa',exact:true}).click();
  const item=(await snapshot(admin)).menu.find(i=>i.id===2);
  await command(admin,'UPDATE_MENU_ITEM',{...item,menuId:2,expectedVersion:item.version,description:'Updated product description; price unchanged'});
  await expect(a.page.getByRole('button',{name:'Cập nhật giỏ theo thực đơn mới'})).toBeVisible();
  const data={priceBefore:item.priceVnd,priceAfter:(await snapshot(admin)).menu.find(i=>i.id===2).priceVnd,reviewRequired:true};
  await a.page.getByRole('button',{name:'Cập nhật giỏ theo thực đơn mới'}).click();return data;
 });
 let orderA;
 await observe('A05','Place and pay, then prepare a second draft',async()=>{
  await a.page.getByRole('link',{name:/Xem giỏ · 1 phần/}).click();await a.page.getByRole('button',{name:'Đặt món và thanh toán',exact:true}).click();
  const portal=a.page.getByRole('dialog',{name:'Cổng thanh toán giả lập'});await expect(portal).toBeVisible();await portal.getByRole('button',{name:'Giả lập thanh toán thành công',exact:true}).click();await expect(portal).not.toBeVisible();
  await expect.poll(async()=>(await snapshot(a)).orders[0]?.paymentState).toBe('PAID');orderA=(await snapshot(a)).orders[0];
  await a.page.getByRole('button',{name:'Thêm Trà đào',exact:true}).click();await expect(a.page.getByTestId('cart-total')).toContainText('40.000');return {paidOrder:orderA.id,secondCart:await a.page.getByTestId('cart-total').innerText()};
 });
 await observe('A06','Delivering the first order while customer drafts another',async()=>{
  await serve(admin,orderA.id);await expect(a.page.getByRole('heading',{name:'Cảm ơn bạn đã ghé quán',exact:true})).toBeVisible();
  const before={cartPresent:await a.page.locator('#guest-cart').count(),cartShortcut:await a.page.locator('a.cart-shortcut').allTextContents(),supportButton:await a.page.getByRole('button',{name:'Gọi nhân viên',exact:true}).count(),drafts:await cart(a)};
  await a.page.screenshot({path:join(output,'05-completed-with-unsent-cart.png'),fullPage:true});
  await a.page.getByRole('button',{name:'Bắt đầu lần đặt mới',exact:true}).click();await expect(a.page.getByRole('button',{name:'Thêm Cà phê sữa',exact:true})).toBeEnabled();
  return {beforeRestart:before,afterRestartCart:await a.page.getByTestId('cart-total').innerText(),alerts:await a.page.getByRole('alert').allTextContents()};
 });
 await observe('A07','Open support request blocks a second need and default staff reply',async()=>{
  await b.page.getByRole('button',{name:'Thêm nước lọc',exact:true}).click();await b.page.getByRole('button',{name:'Gọi nhân viên',exact:true}).click();
  await expect(b.page.getByRole('button',{name:'Gọi nhân viên',exact:true})).toBeDisabled();
  await admin.page.getByRole('button',{name:/Yêu cầu hỗ trợ/}).click();await admin.page.getByRole('button',{name:'Đã xử lý',exact:true}).click();
  await expect.poll(async()=>(await snapshot(b)).tickets[0]?.status).toBe('HANDLED');
  const ticket=(await snapshot(b)).tickets[0];await admin.page.screenshot({path:join(output,'06-support-handled.png'),fullPage:true});
  return {ticketStatus:ticket.status,reply:ticket.reply,visitStillOpen:(await snapshot(b)).tables[0]?.status};
 });
 const c=await actor('guest',qr),orderC=await place(c);await paid(c,orderC);
 await observe('A08','Paid order cannot be declined/refunded if cafe cannot serve it',async()=>{
  const cancel=await command(c,'CANCEL_UNPAID_ORDER',{visitId:c.session.identity.visitId,orderId:orderC.orderId},false);
  const adminCancel=await command(admin,'CANCEL_UNPAID_ORDER',{visitId:c.session.identity.visitId,orderId:orderC.orderId},false);
  const close=await command(admin,'CLOSE_VISIT',{visitId:c.session.identity.visitId},false);
  await admin.page.getByRole('button',{name:/Quầy pha chế/}).click();
  await admin.page.screenshot({path:join(output,'07-paid-order-actions.png'),fullPage:true});
  await expect(admin.page.locator('.orders-grid .order-card')).toHaveCount(1);
  return {guestCancel:{http:cancel.http,code:cancel.code,message:cancel.message},adminCancel:{http:adminCancel.http,code:adminCancel.code},close:{http:close.http,code:close.code},staffActions:await admin.page.locator('.orders-grid .order-card button').allTextContents()};
 });
 await observe('A09','Leaving a paid pending visit and scanning again',async()=>{
  let dialogs=0;c.page.on('dialog',async d=>{dialogs++;await d.dismiss();});
  await c.page.reload();await expect(c.page.getByRole('button',{name:'Rời phiên',exact:true})).toBeVisible();await c.page.getByRole('button',{name:'Rời phiên',exact:true}).click();await c.page.waitForTimeout(500);
  const cookieAfterLeave=await c.context.request.get(c.origin+'/api/session');
  const leaveView={customConfirmations:await c.page.getByRole('alertdialog').count(),alerts:await c.page.getByRole('alert').allTextContents(),headings:await c.page.locator('h1,h2').allTextContents()};
  await c.page.screenshot({path:join(output,'09-after-leave.png'),fullPage:true});
  await c.page.goto(qr.joinUrl);
  const joinButton=c.page.getByRole('button',{name:'Vào bàn của tôi',exact:true});
  await expect.poll(async()=>await joinButton.isVisible()||(await c.context.request.get(c.origin+'/api/session')).ok()).toBe(true);
  if(await joinButton.isVisible()){await joinButton.click();await expect(c.page.getByRole('button',{name:'Thêm Cà phê sữa',exact:true})).toBeEnabled();}
  const nowResponse=await c.context.request.get(c.origin+'/api/session'),now=await nowResponse.json();
  const currentState=await snapshot(c);
  return {dialogs,leaveView,sessionHttpAfterLeave:cookieAfterLeave.status(),sessionHttpAfterRejoin:nowResponse.status(),sameVisit:now.identity?.visitId===c.session.identity.visitId,ordersVisibleAfterRejoin:currentState.orders?.length,oldOrderStillAtStaff:(await snapshot(admin)).orders.some(o=>o.id===orderC.orderId)};
 });
 await observe('A10','Pause table only blocks newcomers and must be distinguished from stop ordering',async()=>{
  await command(admin,'SET_TABLE_ACCEPTING',{tableId:1,enabled:0});
  const attempt=await place(b);
  const context=await browser.newContext();contexts.push(context);const newcomer=await context.request.post(b.origin+'/api/guest/join',{headers:{Origin:b.origin},data:{grant:qr.grant,table:true}});
  const blocked=await newcomer.json();await command(admin,'SET_TABLE_ACCEPTING',{tableId:1,enabled:1});return {existingGuestCanPlace:!!attempt.orderId,newGuestHttp:newcomer.status(),newGuestCode:blocked.code};
 });
 await observe('A11','Menu create, editing and invoice discoverability',async()=>{
  await admin.page.getByRole('button',{name:'Thực đơn',exact:true}).click();await admin.page.getByRole('button',{name:'Thêm món',exact:true}).click();
  const d=admin.page.getByRole('dialog',{name:'Thêm món',exact:true});
  const labels=await d.locator('label').allTextContents();await admin.page.keyboard.press('Escape');
  await admin.page.getByRole('button',{name:'Lịch sử hóa đơn',exact:true}).click();await admin.page.screenshot({path:join(output,'08-sales-history.png'),fullPage:true});
  const history=await command(admin,'GET_SALES_HISTORY',{});
  return {newItemFields:labels,paidReceiptCount:history.receipts.length,paidNotServedInHistory:history.receipts.some(r=>r.orderId===orderC.orderId)};
 });
 await observe('A12','Notifications are separate from fulfilling work',async()=>{
  const initial=await command(admin,'GET_NOTIFICATIONS',{});
  return {eventCount:initial.events.length,unread:initial.unread,types:[...new Set(initial.events.map(e=>e.type))],soundToggleInCollapsedPanel:await admin.page.getByRole('button',{name:'Bật âm thanh tại quầy',exact:true}).count()};
 });
 await observe('A14','Staff cannot dispose of an abandoned unpaid order',async()=>{
  const d=await actor('guest',qr),order=await place(d);
  const cancel=await command(admin,'CANCEL_UNPAID_ORDER',{visitId:d.session.identity.visitId,orderId:order.orderId},false);
  const close=await command(admin,'CLOSE_VISIT',{visitId:d.session.identity.visitId},false);
  return {orderPaymentState:(await snapshot(d)).orders[0].paymentState,adminCancelHttp:cancel.http,adminCancelCode:cancel.code,adminCloseHttp:close.http,adminCloseCode:close.code};
 });
 await observe('A15','Staff sidebar contrast after transitions settle',async()=>{
  await admin.page.getByRole('button',{name:/Quầy pha chế/}).click();await admin.page.waitForTimeout(600);await admin.page.mouse.move(1400,850);
  const colors=await admin.page.locator('nav[aria-label="Điều hướng chính"] button').evaluateAll(nodes=>nodes.map(n=>({text:n.innerText,color:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor,current:n.getAttribute('aria-current')})));
  await admin.page.screenshot({path:join(output,'10-staff-settled-sidebar.png'),fullPage:true});return {colors};
 });
 await observe('A16','Owner creates a menu item with an image and pauses its sale',async()=>{
  await admin.page.getByRole('button',{name:'Thực đơn',exact:true}).click();await admin.page.getByRole('button',{name:'Thêm món',exact:true}).click();
  const dialog=admin.page.getByRole('dialog',{name:'Thêm món',exact:true});
  await dialog.getByLabel('Tên món',{exact:true}).fill('Matcha audit');await dialog.getByLabel('Giá món (VND)',{exact:true}).fill('45000');await dialog.getByLabel('Mô tả món',{exact:true}).fill('Synthetic test item, no real menu recommendation');
  const png=new PNG({width:32,height:32});for(let i=0;i<png.data.length;i+=4){png.data[i]=40;png.data[i+1]=120;png.data[i+2]=60;png.data[i+3]=255;}
  await dialog.getByLabel(/Ảnh món/).setInputFiles({name:'synthetic-test-image.png',mimeType:'image/png',buffer:PNG.sync.write(png)});await expect(dialog.getByAltText('Xem trước ảnh món')).toBeVisible();
  await dialog.getByRole('button',{name:'Lưu món',exact:true}).click();await expect(dialog).not.toBeVisible();
  await a.page.getByLabel('Tìm đồ uống',{exact:true}).fill('matcha');await expect(a.page.getByRole('button',{name:'Thêm Matcha audit',exact:true})).toBeEnabled();
  const naturalWidth=await a.page.getByAltText('Matcha audit',{exact:true}).evaluate(img=>img.naturalWidth);
  await admin.page.getByRole('button',{name:'Tạm hết Matcha audit',exact:true}).click();await expect(a.page.getByRole('button',{name:'Thêm Matcha audit',exact:true})).toHaveCount(0);
  await admin.page.getByRole('button',{name:'Bán lại Matcha audit',exact:true}).click();await expect(a.page.getByRole('button',{name:'Thêm Matcha audit',exact:true})).toBeEnabled();
  await a.page.getByLabel('Tìm đồ uống',{exact:true}).fill('');return {imageLoaded:naturalWidth>0,visibleToGuest:true,soldOutBlockedAdd:true,resaleEnabled:true};
 });
 await observe('A17','Reading a support notification does not finish the work; audio setting after reload',async()=>{
  await command(b,'CALL_SERVICE',{visitId:b.session.identity.visitId,note:'Audit: thêm khăn giấy'});
  await admin.page.getByRole('button',{name:/Thông báo,.*chưa đọc/}).click();let center=admin.page.getByRole('dialog',{name:'Trung tâm thông báo'});
  await center.getByRole('button',{name:'Bật âm thanh tại quầy',exact:true}).click();await expect(center.getByRole('button',{name:'Tắt âm thanh tại quầy',exact:true})).toBeVisible();
  await center.getByRole('button',{name:/Audit: thêm khăn giấy/}).click();await expect(center).not.toBeVisible();
  const work=(await snapshot(b)).tickets.find(t=>t.note==='Audit: thêm khăn giấy');await admin.page.reload();
  await admin.page.getByRole('button',{name:/Thông báo,.*chưa đọc/}).click();center=admin.page.getByRole('dialog',{name:'Trung tâm thông báo'});
  await expect(center.getByRole('button',{name:/Audit: thêm khăn giấy/})).toContainText('Đã đọc');
  const soundReset=await center.getByRole('button',{name:'Bật âm thanh tại quầy',exact:true}).isVisible();await admin.page.screenshot({path:join(output,'11-notification-center.png')});
  await center.getByRole('button',{name:'Đóng trung tâm thông báo',exact:true}).click();return {ticketAfterRead:work.status,readMarkerSurvivedReload:true,soundResetAfterReload:soundReset,physicalAudioHeard:'NOT_RUN'};
 });
 await observe('A18','Staff opens a detailed receipt',async()=>{
  await admin.page.getByRole('button',{name:'Lịch sử hóa đơn',exact:true}).click();await admin.page.locator('.receipt-row').first().click();
  const dialog=admin.page.getByRole('dialog',{name:'Chi tiết hóa đơn',exact:true});await expect(dialog).toBeVisible();const contents=await dialog.innerText();await admin.page.screenshot({path:join(output,'12-detailed-receipt.png')});await dialog.getByRole('button',{name:'Đóng hóa đơn',exact:true}).click();return {contents};
 });
 await observe('A19','Failed and cancelled payments retry on one accepted order',async()=>{
  const e=await actor('guest',qr),order=await place(e),states=[];
  const before=await command(admin,'SET_ORDER_STATUS',{orderId:order.orderId,status:'PREPARING'},false);
  for(const outcome of ['thất bại','hủy','thành công']){
   await e.page.getByRole('button',{name:`Thanh toán đơn #${order.orderId}`,exact:true}).click();const dialog=e.page.getByRole('dialog',{name:'Cổng thanh toán giả lập',exact:true});
   const label=outcome==='hủy'?'Hủy giao dịch thử':`Giả lập thanh toán ${outcome}`;await dialog.getByRole('button',{name:label,exact:true}).click();await expect(dialog).not.toBeVisible();
   await expect.poll(async()=>(await snapshot(e)).orders[0].paymentState).toBe(outcome==='thành công'?'PAID':'UNPAID');states.push((await snapshot(e)).orders[0].paymentState);
  }
  return {states,orderCount:(await snapshot(e)).orders.length,preparingBeforePaid:{http:before.http,code:before.code},paidReceiptsForThisOrder:(await command(admin,'GET_SALES_HISTORY',{})).receipts.filter(r=>r.orderId===order.orderId).length};
 });
 await stop();await start('capacity');const operator=await actor('admin');await command(operator,'OPEN_ALL_TABLES',{});const grant=await command(operator,'GET_TABLE_QR',{tableId:1});
 await observe('A13','Guests who close their browsers still consume Gateway slots',async()=>{
  const accepted=[];
  for(let i=0;i<15;i++){
   const context=await browser.newContext();const response=await context.request.post(operator.origin+'/api/guest/join',{headers:{Origin:operator.origin},data:{grant:grant.grant,table:true}});accepted.push(response.status());await context.close();
  }
  const fresh=await browser.newContext();contexts.push(fresh);const response=await fresh.request.post(operator.origin+'/api/guest/join',{headers:{Origin:operator.origin},data:{grant:grant.grant,table:true}});const failure=await response.json();
  return {operator:1,closedBrowserSessions:15,accepted,newGuestHttp:response.status(),newGuestCode:failure.code,newGuestMessage:failure.message};
 });
 metadata.status=observations.some(o=>o.status==='HARNESS_ERROR')?'PARTIAL':'COMPLETE';if(metadata.status!=='COMPLETE')process.exitCode=1;
} catch(error){metadata.status='FAILED';metadata.error=error.message;process.exitCode=1;}
finally {try{await stop();metadata.ownedListenersClosed=true;}catch(error){metadata.cleanupError=error.message;metadata.ownedListenersClosed=false;process.exitCode=1;}await browser.close();metadata.finishedAt=new Date().toISOString();metadata.observations=observations.length;await writeFile(join(output,'metadata.json'),JSON.stringify(metadata,null,2));}
console.log(JSON.stringify({status:metadata.status,output,observations:observations.length}));
