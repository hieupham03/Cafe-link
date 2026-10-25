import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {startServer,owner,join,project} from './server.mjs';
import {waitForGuestReady} from './readiness.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
const repetitions=Number(args.repetitions??3),seconds=Number(args.seconds??15),warmup=Number(args.warmup??3),counts=(args.counts??'1,5,10,14').split(',').map(Number),output=resolve(args.output??'../target/v8-load');
if(!Number.isInteger(repetitions)||repetitions<1||repetitions>10||seconds<1||seconds>120||warmup<0||counts.some(n=>!Number.isInteger(n)||n<1||n>14))throw new Error('Invalid bounded load configuration');
await mkdir(output,{recursive:true});
const html=await readFile('experiment-dist/experiment.html','utf8'),script=html.match(/src="([^"]+\.js)"/)[1];
const browser=await chromium.launch(),results=[],privateRoot=resolve(project,'target/v8-private',crypto.randomUUID());
const metadata={status:'RUNNING',counts,repetitions,seconds,warmup,slotMs:1000,maxWebSessions:32,maxGuestSessions:30,topology:'One machine; real React guest pages -> HTTP Gateway -> TCP Core -> SQLite',measurement:'One browser clock per actor. Full operation response includes IndexedDB/session/place response; render is first DOM detection after accepted receipt. HTTP duration includes cloned response body. Byte counts are decoded HTTP bodies, not TCP/TLS bytes.',loadModel:'Each browser starts at most one sequential order/payment flow per 1-second slot; overruns are recorded, not overlapped. Warmup excluded from timed samples but included in database oracle.',payment:'LOCAL_SIMULATOR',startedAt:new Date().toISOString()};
let failed=0;
try{
 for(let repeat=1;repeat<=repetitions;repeat++)for(const count of counts){
  const record={repeat,clients:count,status:'RUNNING',actors:[],guestReadyMs:[]};let server,admin;const guests=[];
  try{
   server=await startServer(resolve(privateRoot,`${repeat}-${count}`));admin=await owner(browser,server.origin);await admin.command('OPEN_ALL_TABLES',{});const qr=await admin.command('GET_TABLE_QR',{tableId:1});
   for(let i=0;i<count;i++){
    const guest=await join(browser,server.origin,qr.grant,'/guest');guests.push(guest);
    await guest.page.waitForSelector('#guest-menu');
    await guest.page.evaluate(async src=>{await import(src);},script);
    record.guestReadyMs.push(await waitForGuestReady(guest.page));
   }
   async function period(duration,measured){
    const start=performance.now(),end=start+duration*1000;
    const actors=await Promise.all(guests.map(async (guest,index)=>{
     const actor={actor:index,flows:[],errors:[],missedSlots:0,http:[]};
     if(measured)await guest.page.evaluate(()=>window.cafeExperiment.startSampling());
     let slot=0;
     while(start+slot*1000<end){
      const due=start+slot*1000,delay=due-performance.now();if(delay>0)await pause(delay);
      if(performance.now()>=end)break;
      try{actor.flows.push(await guest.page.evaluate(()=>window.cafeExperiment.loadStep()));}catch(e){actor.errors.push(String(e));break;}
      slot++;
      while(start+slot*1000<performance.now()&&start+slot*1000<end){actor.missedSlots++;slot++;}
     }
     if(measured)actor.http=await guest.page.evaluate(()=>window.cafeExperiment.samples());
     return actor;
    }));
    if(performance.now()<end)await pause(end-performance.now());
    return actors;
   }
   const warm=await period(warmup,false);if(warm.some(a=>a.errors.length))throw new Error(`Warmup failed: ${warm.flatMap(a=>a.errors).join('; ')}`);
   const began=performance.now();record.actors=await period(seconds,true);record.elapsedMs=performance.now()-began;
   record.successfulFlows=record.actors.reduce((s,a)=>s+a.flows.length,0);record.errors=record.actors.flatMap(a=>a.errors);record.missedSlots=record.actors.reduce((s,a)=>s+a.missedSlots,0);
   record.offeredSlots=count*Math.ceil(seconds);record.throughputFlowsPerSecond=record.successfulFlows/(record.elapsedMs/1000);
   record.oracle=[];
   for(let index=0;index<guests.length;index++){
    const identity=guests[index].session.identity,process=spawnSync(globalThis.process.env.CAFELINK_PYTHON??'python',[resolve(project,'tools/web_oracle.py'),'--db',server.database,'--visit',identity.visitId,'--membership',identity.membershipId],{encoding:'utf8',windowsHide:true});
    if(process.status!==0)throw new Error(`Load oracle failed: ${process.stderr}`);
    const oracle=JSON.parse(process.stdout),expected=warm[index].flows.length+record.actors[index].flows.length;
    if(oracle.orders.length!==expected||oracle.payments.length!==expected||oracle.orders.some(o=>o.payment_state!=='PAID'||o.total_vnd!==30000)||oracle.payments.some(p=>p.state!=='PAID'||p.amount_vnd!==30000))throw new Error('Load database/payment oracle mismatch');
    record.oracle.push({actor:index,expectedOrders:expected,orders:oracle.orders.length,paidPayments:oracle.payments.length,totalVnd:oracle.payments.reduce((s,p)=>s+p.amount_vnd,0)});
   }
   if(record.errors.length||!record.successfulFlows)throw new Error('Load has failed operations or no completed operations');
   record.status='PASS';
  }catch(e){record.status='FAIL';record.error=e.stack??String(e);failed++;}
  finally{
   for(const cleanup of [...guests.map(g=>()=>g.close()),()=>admin?.context.close(),()=>server?.stop()])try{await cleanup();}catch(e){record.cleanupError=String(e);if(record.status!=='FAIL'){record.status='FAIL';failed++;}}
   results.push(record);await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));console.log(`LOAD repeat=${repeat} clients=${count}: ${record.status} flows=${record.successfulFlows??0}`);
  }
 }
}catch(e){metadata.fatal=e.stack??String(e);failed++;}
finally{await browser.close();metadata.browser=browser.version();metadata.completedCases=results.length;metadata.status=failed||results.length!==repetitions*counts.length?'FAIL':'PASS';metadata.failed=failed;metadata.finishedAt=new Date().toISOString();await writeFile(resolve(output,'metadata.json'),JSON.stringify(metadata,null,2));}
if(metadata.status!=='PASS')process.exitCode=1;
