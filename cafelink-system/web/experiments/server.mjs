import { spawn } from "node:child_process";
import { createServer, connect } from "node:net";
import { openSync, closeSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";

export const project=resolve("..");
export async function startServer(directory){
  await mkdir(directory,{recursive:true});
  const probes=[createServer(),createServer()];
  for(const probe of probes)await new Promise((ok,no)=>probe.once("error",no).listen(0,"127.0.0.1",ok));
  const [port,tcpPort]=probes.map(p=>p.address().port);
  for(const probe of probes)await new Promise(ok=>probe.close(ok));
  const database=resolve(directory,"server.db"),out=openSync(resolve(directory,"server.log"),"a"),err=openSync(resolve(directory,"server-error.log"),"a");
  const executable=process.env.CAFELINK_JAVA,classpath=process.env.CAFELINK_CLASSPATH;
  if(!executable||!classpath)throw new Error("Use scripts/experiment-web.ps1 to resolve the Java runtime.");
  const child=spawn(executable,["--enable-native-access=ALL-UNNAMED","-Dfile.encoding=UTF-8","-cp",classpath,"com.cafelink.web.WebMain",`--port=${port}`,`--tcp-port=${tcpPort}`,`--db=${database}`,`--assets=${resolve(project,"web/experiment-dist")}`,"--ordering-mode=prepay"],{cwd:project,stdio:["ignore",out,err],windowsHide:true});
  closeSync(out);closeSync(err);
  let exited=false,spawnError;child.on("exit",()=>{exited=true;});child.on("error",e=>{spawnError=e;exited=true;});
  const origin=`http://127.0.0.1:${port}`;
  async function stop(){
    if(!exited){child.kill();for(let n=0;n<100&&!exited;n++)await pause(50);}
    const closed=await Promise.all([port,tcpPort].map(p=>new Promise(ok=>{const socket=connect(p,"127.0.0.1");socket.once("connect",()=>{socket.destroy();ok(false);});socket.once("error",()=>ok(true));})));
    if(!exited||closed.some(v=>!v))throw new Error("An owned experiment server did not stop cleanly.");
  }
  try{
    for(let n=0;n<150;n++){
      if(exited)throw spawnError??new Error("Experiment JVM exited during startup; inspect private fixture logs.");
      try{const response=await fetch(`${origin}/api/health`,{signal:AbortSignal.timeout(800)});if(response.ok)return{origin,database,stop};}catch{/* Wait only for this owned server. */}
      await pause(100);
    }
    throw new Error("Experiment server startup timeout.");
  }catch(e){await stop();throw e;}
}
export async function owner(browser,origin){
  const context=await browser.newContext(),response=await context.request.post(`${origin}/api/login`,{headers:{Origin:origin},data:{username:"admin",password:"CafeLink@123"}});
  if(!response.ok())throw new Error(`Admin fixture login failed: HTTP ${response.status()}`);
  const session=await response.json();return{context,session,command:(action,data)=>command(context,origin,session,action,data)};
}
export async function command(context,origin,session,action,data,id=crypto.randomUUID()){
  const response=await context.request.post(`${origin}/api/command`,{headers:{Origin:origin,"X-CSRF-Token":session.csrfToken},data:{commandId:id,action,data,scope:session.identity}});
  const result=await response.json();if(!response.ok())throw new Error(`${action}: ${result.code??response.status()}`);return result;
}
export async function join(browser,origin,grant,path="/experiment.html"){
  const context=await browser.newContext(),response=await context.request.post(`${origin}/api/guest/join`,{headers:{Origin:origin},data:{grant,table:true}});
  if(!response.ok()){await context.close();throw new Error(`JOIN_TABLE: HTTP ${response.status()}`);}
  const session=await response.json(),page=await context.newPage();await page.goto(origin+path);
  if(path==="/experiment.html")await page.waitForFunction(()=>Boolean(window.cafeExperiment));
  return{context,page,session,command:(action,data,id)=>command(context,origin,session,action,data,id),async close(){await context.request.post(`${origin}/api/guest/leave`,{headers:{Origin:origin},data:{}}).catch(()=>{});await context.close();}};
}
export async function cleanVisit(admin,guest){
  const visitId=guest.session.identity.visitId,origin=new URL(guest.page.url()).origin;
  const state=await (await admin.context.request.get(`${origin}/api/state`)).json();
  for(const ticket of state.tickets.filter(t=>t.visitId===visitId&&t.status==="OPEN"))await admin.command("HANDLE_TICKET",{ticketId:ticket.id,reply:"Fixture cleanup after measurement"});
  for(const order of state.orders.filter(o=>o.visitId===visitId)){
    if(["UNPAID","PENDING"].includes(order.paymentState))await guest.command("CANCEL_UNPAID_ORDER",{visitId,orderId:order.id});
    else if(order.paymentState==="PAID")for(const status of ["SUBMITTED","PREPARING","READY","SERVED"].slice(["SUBMITTED","PREPARING","READY","SERVED"].indexOf(order.status)+1))await admin.command("SET_ORDER_STATUS",{orderId:order.id,status});
  }
  try{await admin.command("CLOSE_VISIT",{visitId});}catch(e){if(!e.message.includes("SESSION_CLOSED"))throw e;}
}
