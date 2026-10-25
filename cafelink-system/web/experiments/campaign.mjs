import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdir,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startServer,owner,join,cleanVisit,project } from "./server.mjs";

const options=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,"").split("=")));
const repetitions=Number(options.repetitions??5),seed=Number(options.seed??20261023),output=resolve(options.output??"../target/v8-web-campaign");
if(!Number.isInteger(repetitions)||repetitions<1||repetitions>50)throw new Error("Invalid repetitions");
const scenarios=["NORMAL_ORDER","LOST_ORDER_ACK","UNACCEPTED_ORDER","UNACCEPTED_SERVICE","LOST_SERVICE_ACK_HANDLED","VISIT_ENDED","DISCARD_WINS_LATE_SERVICE","ACCEPT_WINS_LATE_SERVICE"];
const policies=["REPLAY_ALL","REVIEW","SEMANTIC"],cases=[];
for(let repeat=1;repeat<=repetitions;repeat++)for(const scenario of scenarios)for(const policy of policies)cases.push({repeat,scenario,policy});
let random=seed>>>0;function next(){random=(Math.imul(random,1664525)+1013904223)>>>0;return random/2**32;}
for(let i=cases.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[cases[i],cases[j]]=[cases[j],cases[i]];}
await mkdir(output,{recursive:true});
const privateRoot=resolve(project,"target/v8-private",crypto.randomUUID()),results=[],browser=await chromium.launch();
const metadata={status:"RUNNING",seed,repetitions,cases:cases.length,topology:"One machine; Chromium -> HTTP Gateway -> real TCP Core -> SQLite",fault:"HTTP abort before forward or after successful forward; ordered late command delivery, not physical packet loss",policyOrder:"Seeded shuffle",batchSize:12,physicalLan:"NOT_RUN",physicalPhone:"NOT_RUN",startedAt:new Date().toISOString()};
await writeFile(resolve(output,"metadata.json"),JSON.stringify(metadata,null,2));
let server,admin,qr,failed=0,fatal;
async function flush(){await writeFile(resolve(output,"results.json"),JSON.stringify(results,null,2));}
try{
 for(let index=0;index<cases.length;index++){
  if(index%12===0){if(server){await admin.context.close();await server.stop();}server=await startServer(resolve(privateRoot,`batch-${index/12}`));admin=await owner(browser,server.origin);await admin.command("OPEN_ALL_TABLES",{});qr=await admin.command("GET_TABLE_QR",{tableId:1});}
  const test=cases[index],record={case:index+1,...test,status:"RUNNING"};let guest,other;
  try{
   guest=await join(browser,server.origin,qr.grant);const isOrder=["NORMAL_ORDER","LOST_ORDER_ACK","UNACCEPTED_ORDER","VISIT_ENDED"].includes(test.scenario),action=isOrder?"PLACE_ORDER":"CALL_SERVICE";
   const accepted=["LOST_ORDER_ACK","LOST_SERVICE_ACK_HANDLED"].includes(test.scenario);let faultHits=0;
   if(test.scenario!=="NORMAL_ORDER")await guest.page.route("**/api/command",async route=>{if(route.request().postDataJSON().action!==action||faultHits){await route.continue();return;}faultHits++;if(accepted){const response=await route.fetch();if(!response.ok())throw new Error("Fault did not reach a committed command");}await route.abort("failed");});
   await guest.page.evaluate(a=>window.cafeExperiment.queueAndSend(a),action);await guest.page.unrouteAll({behavior:"wait"});
   if(test.scenario!=="NORMAL_ORDER"&&faultHits!==1)throw new Error("Fault boundary was not observed exactly once");
   record.fault=accepted?"AFTER_COMMIT":test.scenario==="NORMAL_ORDER"?"NONE":"BEFORE_FORWARD";
   if(test.scenario==="ACCEPT_WINS_LATE_SERVICE"){const response=await guest.page.evaluate(()=>window.cafeExperiment.late());if(!response.ok)throw new Error("Original service acceptance failed");}
   if(["LOST_SERVICE_ACK_HANDLED","ACCEPT_WINS_LATE_SERVICE"].includes(test.scenario)){
    const state=await guest.page.evaluate(()=>window.cafeExperiment.read());await admin.command("HANDLE_TICKET",{ticketId:state.state.tickets[0].id,reply:"Handled while client response was unavailable"});
   }
   if(test.scenario==="VISIT_ENDED"){await admin.command("CLOSE_VISIT",{visitId:guest.session.identity.visitId});other=await join(browser,server.origin,qr.grant);}
   await guest.page.evaluate(()=>window.cafeExperiment.startSampling());
   const recovered=await guest.page.evaluate(p=>window.cafeExperiment.recover(p),test.policy);
   record.recoveryMs=recovered.recoveryMs;record.confirmRequired=recovered.entries.filter(e=>e.status==="CONFIRM_REQUIRED").length;record.journalStatuses=recovered.entries.map(e=>e.status);record.http=await guest.page.evaluate(()=>window.cafeExperiment.samples());
   if(["DISCARD_WINS_LATE_SERVICE","VISIT_ENDED"].includes(test.scenario))record.lateResult=await guest.page.evaluate(()=>window.cafeExperiment.late());
   const identity=guest.session.identity;
   const oracleProcess=spawnSync(process.env.CAFELINK_PYTHON??"python",[resolve(project,"tools/web_oracle.py"),"--db",server.database,"--visit",identity.visitId,"--membership",identity.membershipId],{encoding:"utf8",windowsHide:true});
   if(oracleProcess.status!==0)throw new Error(`Oracle failed: ${oracleProcess.stderr}`);
   const oracle=JSON.parse(oracleProcess.stdout);
   // Keep the independent observation even if a later policy assertion fails.
   await writeFile(resolve(output,`oracle-${index+1}.json`),JSON.stringify({case:index+1,...oracle},null,2));
   record.orders=oracle.orders.length;record.tickets=oracle.tickets.length;
   let expectedOrders=["NORMAL_ORDER","LOST_ORDER_ACK"].includes(test.scenario)?1:0,expectedTickets=["LOST_SERVICE_ACK_HANDLED","ACCEPT_WINS_LATE_SERVICE"].includes(test.scenario)?1:0;
   if(test.scenario==="UNACCEPTED_ORDER"&&test.policy==="REPLAY_ALL")expectedOrders=1;
   if(test.scenario==="UNACCEPTED_SERVICE"&&test.policy==="REPLAY_ALL")expectedTickets=1;
   if(test.scenario==="DISCARD_WINS_LATE_SERVICE"&&test.policy!=="SEMANTIC")expectedTickets=1;
   const expectedConfirmation=["UNACCEPTED_ORDER"].includes(test.scenario)?Number(test.policy!=="REPLAY_ALL"):["UNACCEPTED_SERVICE","DISCARD_WINS_LATE_SERVICE"].includes(test.scenario)?Number(test.policy==="REVIEW"):0;
   if(record.orders!==expectedOrders||record.tickets!==expectedTickets||record.confirmRequired!==expectedConfirmation)throw new Error(`Policy oracle mismatch: orders=${record.orders}/${expectedOrders},tickets=${record.tickets}/${expectedTickets},confirm=${record.confirmRequired}/${expectedConfirmation}`);
   record.duplicateOrders=Math.max(0,record.orders-expectedOrders);record.unconfirmedOrderEffects=test.scenario==="UNACCEPTED_ORDER"?record.orders:0;
   record.expiredNeedServiceEffects=["UNACCEPTED_SERVICE","DISCARD_WINS_LATE_SERVICE"].includes(test.scenario)?record.tickets:0;
   record.wrongVisitEffects=0;if(other){const state=await other.page.evaluate(()=>window.cafeExperiment.read());record.wrongVisitEffects=state.state.orders.length+state.state.tickets.length;if(record.wrongVisitEffects)throw new Error("Old intent affected the new private visit");}
   const entry=recovered.entries[0],receipt=oracle.receipts.find(r=>r.command_id===entry.id);
   if(test.policy==="SEMANTIC"&&["UNACCEPTED_SERVICE","DISCARD_WINS_LATE_SERVICE","VISIT_ENDED"].includes(test.scenario)&&!JSON.parse(receipt?.result_json??"{}").cancelledBeforeAcceptance)throw new Error("Missing durable discard barrier");
   record.status="PASS";
  }catch(e){record.status="FAIL";record.error=e.stack??String(e);failed++;}
  finally{
   for(const actor of [guest,other])if(actor){try{await cleanVisit(admin,actor);}catch(e){record.cleanupError=String(e);if(record.status!=="FAIL"){record.status="FAIL";failed++;}}await actor.close();}
   results.push(record);await flush();console.log(`CASE ${index+1}/${cases.length} ${test.policy} ${test.scenario}: ${record.status}`);
  }
 }
}catch(e){fatal=e.stack??String(e);failed++;}
finally{
 for(const cleanup of [()=>admin?.context.close(),()=>server?.stop(),()=>browser.close()])try{await cleanup();}catch(e){fatal??=String(e);failed++;}
 metadata.status=failed||results.length!==cases.length?"FAIL":"PASS";metadata.failed=failed;metadata.fatal=fatal;metadata.completedCases=results.length;metadata.finishedAt=new Date().toISOString();await writeFile(resolve(output,"metadata.json"),JSON.stringify(metadata,null,2));
}
if(failed)process.exitCode=1;
