import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {startServer,owner,project} from './server.mjs';
import {waitForGuestReady} from './readiness.mjs';

const output=resolve(process.argv[2]);await mkdir(output,{recursive:true});
const result={status:'RUNNING',oldDriverRejected:false,newDriverWaited:false,newDriverPaid:false};
const browser=await chromium.launch();let server,admin,context;
try{
 server=await startServer(resolve(project,'target/final-readiness',crypto.randomUUID()));
 admin=await owner(browser,server.origin);await admin.command('OPEN_ALL_TABLES',{});
 const qr=await admin.command('GET_TABLE_QR',{tableId:1});context=await browser.newContext();
 const joined=await context.request.post(server.origin+'/api/guest/join',{headers:{Origin:server.origin},data:{grant:qr.grant,table:true}});expect(joined.ok()).toBe(true);
 const page=await context.newPage();
 await page.addInitScript(()=>{
   navigator.locks.request('cafelink-guest-journal-v2',()=>new Promise(resolve=>{window.__releaseReadinessLock=resolve;}));
 });
 await page.goto(server.origin+'/guest');
 await page.waitForFunction(()=>Boolean(window.__releaseReadinessLock));
 const html=await readFile('experiment-dist/experiment.html','utf8'),script=html.match(/src="([^"]+\.js)"/)[1];
 await page.evaluate(async src=>{await import(src);},script);
 await expect(page.getByRole('button',{name:'Thêm Cà phê sữa',exact:true})).toBeDisabled();
 try{await page.evaluate(()=>window.cafeExperiment.loadStep());throw new Error('Old driver unexpectedly proceeded');}
 catch(error){if(!String(error).includes('tab khác'))throw error;result.oldDriverRejected=true;}
 let ready=false;const barrier=waitForGuestReady(page).then(()=>{ready=true;});
 expect((await(await context.request.get(server.origin+'/api/state')).json()).orders).toHaveLength(0);
 expect(ready).toBe(false);result.newDriverWaited=true;
 await page.evaluate(()=>window.__releaseReadinessLock());
 await page.getByRole('button',{name:'Đối chiếu yêu cầu',exact:true}).click();
 await barrier;await page.evaluate(()=>window.cafeExperiment.loadStep());
 const state=await(await context.request.get(server.origin+'/api/state')).json();
 expect(state.orders).toHaveLength(1);expect(state.orders[0].paymentState).toBe('PAID');result.newDriverPaid=true;
 result.status='PASS';
}catch(error){result.status='FAIL';result.error=error.stack??String(error);process.exitCode=1;}
finally{
 await context?.close();await admin?.context.close();await server?.stop();await browser.close();
 await writeFile(resolve(output,'readiness.json'),JSON.stringify(result,null,2));
}
console.log(JSON.stringify(result));
