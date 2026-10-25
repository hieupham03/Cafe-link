// V9 acceptance of an extracted portable package. Uses only its public launch/maintenance CLI and web APIs.
import { chromium, expect } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

const options = Object.fromEntries(process.argv.slice(2).map(v => {
  const i=v.indexOf('='); return [v.slice(2,i),v.slice(i+1)];
}));
if(!options.package || !options.output) throw new Error('Use --package=<extracted package> --output=<evidence>');
const root=resolve(options.package), output=resolve(options.output);
const release=JSON.parse((await readFile(join(root,'RELEASE.json'),'utf8')).replace(/^\uFEFF/,''));
await mkdir(output,{recursive:true});
const environment={...process.env,PATH:`${process.env.SystemRoot}\\System32;${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0`};
for(const key of ['JAVA_HOME','JRE_HOME','CAFELINK_QR_KEY','CAFELINK_DEMO_ADMIN_PASSWORD']) delete environment[key];
const evidence={status:'RUNNING',startedAt:new Date().toISOString(),browser:'Chromium',hostJavaOnChildPath:false,hostNodeOnChildPath:false,physicalPhone:'NOT_RUN',physicalLan:'NOT_RUN',checks:[]};
const browser=await chromium.launch();
let running,contexts=[];
async function check(name,action) {
  const began=performance.now();
  try {const result=await action();evidence.checks.push({name,status:'PASS',durationMs:performance.now()-began});return result;}
  catch(error){evidence.checks.push({name,status:'FAIL',error:error.message});throw error;}
  finally {await writeFile(join(output,'package-smoke.json'),JSON.stringify(evidence,null,2));}
}
function cli(script,args=[],success=true) {
  const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,script),...args],{cwd:root,env:environment,encoding:'utf8',windowsHide:true,timeout:30000});
  if(result.error) throw result.error;
  if(success && result.status!==0) throw new Error(`${script} failed: ${result.stderr}`);
  if(!success && result.status===0) throw new Error(`${script} unexpectedly accepted a forbidden operation`);
  return result;
}
async function ports() {
  const servers=[createServer(),createServer()];
  for(const server of servers) await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const values=servers.map(server=>server.address().port);
  for(const server of servers) await new Promise(ok=>server.close(ok));
  return values;
}
async function isOpen(port) {
  return new Promise(ok=>{const socket=connect(port,'127.0.0.1');socket.once('connect',()=>{socket.destroy();ok(true);});socket.once('error',()=>ok(false));});
}
async function start(pair) {
  const [http,tcp]=pair,origin=`http://127.0.0.1:${http}`;
  const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'Start-Local.ps1'),'-Port',String(http),'-TcpPort',String(tcp),'-NoOpenBrowser'],{cwd:root,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',data=>{log+=data.toString();});child.stderr.on('data',data=>{log+=data.toString();});
  const owned={child,pair,origin};running=owned;
  for(let n=0;n<200;n++) {
    if(child.exitCode!==null) throw new Error(`Portable launcher exited: ${log}`);
    try {if((await fetch(origin+'/api/health',{signal:AbortSignal.timeout(600)})).ok) return owned;} catch {/* Only wait for this owned process. */}
    await pause(100);
  }
  throw new Error('Portable startup timeout');
}
async function stop() {
  for(const context of contexts) await context.close();contexts=[];
  if(!running) return;
  const owned=running;
  // This tree was spawned by this test. Never discover/kill PIDs by port or image name.
  if(owned.child.exitCode===null) spawnSync('taskkill.exe',['/PID',String(owned.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  for(let n=0;n<100;n++) {
    if(!(await isOpen(owned.pair[0])) && !(await isOpen(owned.pair[1]))) {running=undefined;return;}
    await pause(50);
  }
  throw new Error('Owned portable server left an open listener');
}
async function owner(origin) {
  const context=await browser.newContext();contexts.push(context);
  const response=await context.request.post(origin+'/api/login',{headers:{Origin:origin},data:{username:'admin',password:'CafeLink@123'}});
  if(!response.ok()) throw new Error('Portable admin login failed');
  return {context,session:await response.json(),origin};
}
async function command(actor,action,data) {
  const response=await actor.context.request.post(actor.origin+'/api/command',{headers:{Origin:actor.origin,'X-CSRF-Token':actor.session.csrfToken},data:{commandId:crypto.randomUUID(),action,data,scope:actor.session.identity}});
  if(!response.ok()) {const failure=await response.json();throw new Error(`${action}: ${failure.code??response.status()}`);}
  return response.json();
}
async function state(actor) {return (await actor.context.request.get(actor.origin+'/api/state')).json();}
async function guest(origin,qr) {
  const context=await browser.newContext({viewport:{width:390,height:844}});contexts.push(context);
  const page=await context.newPage();await page.goto(qr.joinUrl);
  await page.getByRole('button',{name:'Vào bàn của tôi',exact:true}).click();
  await expect(page.getByRole('button',{name:'Thêm Cà phê sữa',exact:true})).toBeEnabled();
  const session=await (await context.request.get(origin+'/api/session')).json();
  return {context,page,session,origin};
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function profileHash() {
  const directory=join(root,'data/local-demo'),files=await readdir(directory,{recursive:true,withFileTypes:true}),hash=createHash('sha256');
  for(const file of files.filter(f=>f.isFile()).sort((a,b)=>(a.parentPath+a.name).localeCompare(b.parentPath+b.name))) hash.update(file.name).update(await readFile(join(file.parentPath,file.name)));
  return hash.digest('hex');
}
try {
  const probe=spawnSync('powershell.exe',['-NoProfile','-Command',"if((Get-Command java,node,npm -ErrorAction SilentlyContinue)){exit 1}"],{env:environment,windowsHide:true});
  if(probe.status!==0) throw new Error('Developer tools are still reachable on child PATH');
  await check('pristine package manifest',async()=>{cli('Verify-Package.ps1');});
  await check('unlisted executable library is detected',async()=>{
    const path=join(root,'target/lib/unlisted-v9-fixture.jar');
    await writeFile(path,'controlled extra library fixture',{flag:'wx'});
    try {cli('Verify-Package.ps1',[],false);} finally {await unlink(path);}
  });
  await check('tampered asset is detected, then fixture restored',async()=>{
    const path=join(root,'web/dist/index.html'),original=await readFile(path);
    try {await writeFile(path,Buffer.concat([original,Buffer.from(' ')]));cli('Verify-Package.ps1',[],false);} finally {await writeFile(path,original);}
    cli('Verify-Package.ps1');
  });
  const pair=await ports(),server=await check('start on bundled JRE with developer tools absent from child PATH',()=>start(pair));
  let admin=await owner(server.origin),qr;
  await check('real admin UI, production assets and all automatic tables',async()=>{
    const page=await admin.context.newPage();await page.goto(server.origin+'/admin');
    await expect(page.getByRole('button',{name:/Mở tất cả bàn/})).toBeVisible();
    await command(admin,'OPEN_ALL_TABLES',{});qr=await command(admin,'GET_TABLE_QR',{tableId:1});
    expect((await state(admin)).tables).toHaveLength(6);
    expect((await admin.context.request.get(server.origin+'/experiment.html')).status()).toBe(404);
    await page.screenshot({path:join(output,'pack-admin.png'),fullPage:true});
  });
  if(release.patch==='QR_ENTRY_FIX'||release.includedPatches?.includes('QR_ENTRY_FIX')) await check('guest QR entry in admin profile explains shared session without replacing it',async()=>{
    const before=await (await admin.context.request.get(server.origin+'/api/session')).json();
    const page=await admin.context.newPage();
    try {
      await page.goto(qr.joinUrl);
      await expect(page.getByRole('heading',{name:'Bạn đang đăng nhập quản lý',exact:true})).toBeVisible();
      await expect(page.getByLabel('Link đặt món',{exact:true})).toHaveValue(qr.joinUrl);
      await expect(page.getByRole('button',{name:'Mở tất cả bàn',exact:true})).toHaveCount(0);
      const after=await (await admin.context.request.get(server.origin+'/api/session')).json();
      expect(after.identity).toEqual(before.identity);
      expect(after.csrfToken).toBe(before.csrfToken);
    } finally {await page.close();}
  });
  let imageUrl,imageSha;
  await check('upload image and save menu through packaged Gateway/Core',async()=>{
    const image=new PNG({width:24,height:24});image.data.fill(210);
    const upload=await admin.context.request.post(server.origin+'/api/menu/image',{headers:{Origin:server.origin,'X-CSRF-Token':admin.session.csrfToken,'Content-Type':'image/png'},data:PNG.sync.write(image)});
    if(!upload.ok()) throw new Error('Menu image upload failed');
    imageUrl=(await upload.json()).imageUrl;
    const item=(await state(admin)).menu.find(item=>item.id===2);
    await command(admin,'UPDATE_MENU_ITEM',{...item,menuId:2,expectedVersion:item.version,imageUrl});
    imageSha=sha(await (await admin.context.request.get(server.origin+imageUrl)).body());
  });
  const a=await guest(server.origin,qr),b=await guest(server.origin,qr);
  if(release.patch==='GUEST_ZONES') await check('five guest navigation tiles and separate functional regions are usable on small screens',async()=>{
    const nav=a.page.getByRole('navigation',{name:'Điều hướng tại bàn'});
    for(const title of ['Thực đơn','Đơn đã gọi','Hỗ trợ','Thanh toán','Giỏ hàng']) {
      const tile=nav.getByRole('link',{name:title,exact:true});
      await expect(tile).toBeVisible();
      const bounds=await tile.boundingBox();expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    for(const name of ['Thực đơn của quán','Đơn đã gọi','Giỏ hàng của bạn','Thanh toán đơn hàng','Hỗ trợ tại bàn'])await expect(a.page.getByRole('region',{name,exact:true})).toBeVisible();
    await a.page.getByRole('button',{name:'Thêm Cà phê sữa',exact:true}).click();
    await expect(nav.getByRole('link',{name:'Giỏ hàng',exact:true}).locator('.guest-nav-count')).toContainText('1');
    await a.page.getByRole('button',{name:'Xóa Cà phê sữa',exact:true}).click();
    await expect(nav.getByRole('link',{name:'Giỏ hàng',exact:true}).locator('.guest-nav-count')).toContainText('0');
    await a.page.screenshot({path:join(output,'pack-guest-zones.png'),fullPage:true});
  });
  await check('same QR gives private visits and separate carts',async()=>{
    expect(a.session.identity.visitId).not.toBe(b.session.identity.visitId);
    await a.page.getByRole('button',{name:'Thêm Cà phê sữa',exact:true}).click();
    await a.page.getByRole('link',{name:/Xem giỏ · 1 phần/}).click();
    await expect(a.page.getByTestId('cart-total')).toContainText('30.000');
    expect((await state(b)).orders).toHaveLength(0);
  });
  let order;
  await check('commit then lost order response recovers one order',async()=>{
    let hits=0;
    await a.page.route('**/api/command',async route=>{
      if(route.request().postDataJSON().action==='PLACE_ORDER'&&!hits){hits++;const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');}else await route.continue();
    });
    await a.page.getByRole('button',{name:'Đặt món và thanh toán',exact:true}).click();
    await expect(a.page.getByRole('alert')).toBeVisible();
    await a.page.unrouteAll({behavior:'wait'});await a.page.reload();
    await expect(a.page.getByText(/Đã lưu đơn #/)).toBeVisible();
    const snapshot=await state(a);expect(snapshot.orders).toHaveLength(1);order=snapshot.orders[0];
    expect(hits).toBe(1);expect((await state(b)).orders).toHaveLength(0);
  });
  await check('unaccepted service intent is discarded after reload',async()=>{
    await a.page.route('**/api/command',route=>route.request().postDataJSON().action==='CALL_SERVICE'?route.abort('failed'):route.continue());
    await a.page.getByRole('button',{name:'Gọi nhân viên',exact:true}).click();
    await expect(a.page.getByRole('alert')).toBeVisible();
    await a.page.unrouteAll({behavior:'wait'});await a.page.reload();
    await expect(a.page.getByText(/Lời gọi cũ chưa được nhận đã được bỏ/)).toBeVisible();
    expect((await state(a)).tickets).toHaveLength(0);
  });
  await check('prepaid simulator, one receipt, service workflow and automatic completion',async()=>{
    const payment=await command(a,'START_ORDER_PAYMENT',{visitId:a.session.identity.visitId,orderId:order.id});
    await command(a,'SIMULATE_PAYMENT',{...payment,outcome:'SUCCESS'});
    const history=await command(admin,'GET_SALES_HISTORY',{});
    expect(history.receipts.filter(r=>r.orderId===order.id)).toHaveLength(1);
    for(const status of ['PREPARING','READY','SERVED']) await command(admin,'SET_ORDER_STATUS',{orderId:order.id,status});
    await expect(a.page.getByRole('heading',{name:'Cảm ơn bạn đã ghé quán',exact:true})).toBeVisible();
    await a.page.screenshot({path:join(output,'pack-guest-completed.png'),fullPage:true});
  });
  await check('backup restore and reset are blocked while launcher owns profile',async()=>{
    cli('Backup-Demo.ps1',[],false);cli('Reset-Demo.ps1',[],false);
    cli('Restore-Demo.ps1',['-Archive',join(root,'nonexistent.zip')],false);
    expect((await state(admin)).menu.find(item=>item.id===2).imageUrl).toBe(imageUrl);
  });
  await check('owned process tree stops and both listeners close',stop);
  const backup=await check('offline backup with database key and media',async()=>JSON.parse(cli('Backup-Demo.ps1').stdout.trim()));
  await check('invalid backups fail before changing the current profile',async()=>{
    const attackDirectory=resolve(root,'../invalid-backup-fixtures'),before=await profileHash();
    const fixture=spawnSync(process.env.CAFELINK_PYTHON??'python',[resolve('../tools/package_attack_fixtures.py'),'--backup',backup.backup,'--output',attackDirectory],{encoding:'utf8',windowsHide:true});
    if(fixture.status!==0) throw new Error('Failed to construct invalid backup test inputs');
    for(const archive of JSON.parse(fixture.stdout)) {
      cli('Restore-Demo.ps1',['-Archive',join(attackDirectory,archive)],false);
      expect(await profileHash()).toBe(before);
    }
  });
  await check('restart keeps stable QR menu image and paid history',async()=>{
    await start(pair);admin=await owner(server.origin);
    expect((await command(admin,'GET_TABLE_QR',{tableId:1})).grant).toBe(qr.grant);
    expect((await command(admin,'GET_SALES_HISTORY',{})).receipts.some(r=>r.orderId===order.id)).toBe(true);
    expect(sha(await (await admin.context.request.get(server.origin+imageUrl)).body())).toBe(imageSha);
    await stop();
  });
  await check('reset archives current profile and next start creates new cafe',async()=>{
    const reset=JSON.parse(cli('Reset-Demo.ps1').stdout.trim());expect(reset.previousProfile).toBeTruthy();
    await start(pair);admin=await owner(server.origin);await command(admin,'OPEN_ALL_TABLES',{});
    expect((await command(admin,'GET_TABLE_QR',{tableId:1})).grant).not.toBe(qr.grant);
    expect((await command(admin,'GET_SALES_HISTORY',{})).receipts).toHaveLength(0);
    await stop();
  });
  await check('restore validated backup retains QR image and paid history',async()=>{
    const restored=JSON.parse(cli('Restore-Demo.ps1',['-Archive',backup.backup]).stdout.trim());expect(restored.previousProfile).toBeTruthy();
    await start(pair);admin=await owner(server.origin);
    expect((await command(admin,'GET_TABLE_QR',{tableId:1})).grant).toBe(qr.grant);
    expect((await command(admin,'GET_SALES_HISTORY',{})).receipts.filter(r=>r.orderId===order.id)).toHaveLength(1);
    expect(sha(await (await admin.context.request.get(server.origin+imageUrl)).body())).toBe(imageSha);
    await stop();
  });
  await check('data directory escape is rejected',async()=>{cli('Reset-Demo.ps1',['-DataDirectory','../outside-release'],false);});
  await check('occupied port is rejected without stopping its listener',async()=>{
    const listener=createServer();await new Promise(ok=>listener.listen(0,'127.0.0.1',ok));
    try {cli('Start-Local.ps1',['-Port',String(listener.address().port),'-TcpPort',String(pair[1]),'-NoOpenBrowser'],false);expect(listener.listening).toBe(true);} finally {await new Promise(ok=>listener.close(ok));}
  });
  evidence.status='PASS';
} catch(error) {evidence.status='FAIL';evidence.error=error.message;process.exitCode=1;}
finally {
  try {await stop();} catch(error){evidence.status='FAIL';evidence.cleanupError=error.message;process.exitCode=1;}
  await browser.close();evidence.finishedAt=new Date().toISOString();await writeFile(join(output,'package-smoke.json'),JSON.stringify(evidence,null,2));
}
console.log(JSON.stringify({status:evidence.status,checks:evidence.checks.length,evidence:join(output,'package-smoke.json')}));
