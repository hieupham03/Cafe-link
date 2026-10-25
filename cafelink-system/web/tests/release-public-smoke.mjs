import { spawn,spawnSync } from 'node:child_process';
import { createServer,connect } from 'node:net';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';

const args=Object.fromEntries(process.argv.slice(2).map(v=>{const i=v.indexOf('=');return[v.slice(2,i),v.slice(i+1)];}));
if(!args.package||!args.output)throw new Error('Specify --package and --output');
const root=resolve(args.package),output=resolve(args.output);
await mkdir(output,{recursive:true});
const environment={...process.env,PATH:`${process.env.SystemRoot}\\System32;${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0`};
for(const key of ['JAVA_HOME','JRE_HOME','CAFELINK_QR_KEY','CAFELINK_DEMO_ADMIN_PASSWORD'])delete environment[key];
const probes=[createServer(),createServer()];
for(const server of probes)await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const ports=probes.map(server=>server.address().port);
for(const server of probes)await new Promise(ok=>server.close(ok));
const evidence={status:'RUNNING',startedAt:new Date().toISOString(),physicalPhone:'NOT_RUN',physicalLan:'NOT_RUN',temporaryPasswordPersisted:false};
const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'Start-Public.ps1'),'-Port',String(ports[0]),'-TcpPort',String(ports[1]),'-NoOpenBrowser','-DurationSeconds','75'],{cwd:root,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
let consoleText='';child.stdout.on('data',d=>{consoleText+=d.toString();});child.stderr.on('data',d=>{consoleText+=d.toString();});
const isOpen=port=>new Promise(ok=>{const socket=connect(port,'127.0.0.1');socket.once('connect',()=>{socket.destroy();ok(true);});socket.once('error',()=>ok(false));});
try {
 let origin,password;
 for(let n=0;n<480;n++) {
  origin=consoleText.match(/Public demo: (https:\/\/[a-z0-9-]+\.trycloudflare\.com)\/admin/)?.[1];
  password=consoleText.match(/Temporary admin password: ([^\r\n]+)/)?.[1];
  if(origin&&password)break;
  if(child.exitCode!==null)throw new Error('Public launcher exited before announcing readiness; inspect private tunnel logs');
  await pause(500);
 }
 if(!origin||!password)throw new Error('Public readiness timeout');
 evidence.origin=origin;
 const smoke=spawn(process.execPath,['tests/public-smoke.mjs'],{cwd:process.cwd(),env:{...process.env,CAFELINK_SMOKE_ORIGIN:origin,CAFELINK_SMOKE_LOCAL_ORIGIN:`http://127.0.0.1:${ports[0]}`,CAFELINK_SMOKE_PASSWORD:password,CAFELINK_SMOKE_RESULT:join(output,'public-browser.json')},windowsHide:true,stdio:'ignore'});
 const exit=await new Promise(ok=>smoke.on('exit',code=>ok(code??1)));
 const result=JSON.parse(await readFile(join(output,'public-browser.json'),'utf8'));
 if(result.error) {
   result.error=result.error.replaceAll(password,'[REDACTED]').replace(/(caf\w*session\w*|caf\w*sid)=[^;\s"']+/ig,'$1=[REDACTED]').replace(/(#(?:table|grant)=)[A-Za-z0-9_-]+/g,'$1[REDACTED]');
   await writeFile(join(output,'public-browser.json'),JSON.stringify(result,null,2));
 }
 if(exit!==0||result.status!=='PASS')throw new Error('Public browser acceptance failed; see sanitized browser result');
 evidence.browserChecks=result.checks;
 for(let n=0;n<200&&child.exitCode===null;n++)await pause(500);
 if(child.exitCode!==0)throw new Error('Public launcher did not finish cleanly after its bounded duration');
 evidence.normalDurationCleanup=true;
 evidence.status='PASS';
}catch(error){evidence.status='FAIL';evidence.error=error.message;process.exitCode=1;}
finally {
 if(child.exitCode===null)spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
 for(let n=0;n<100;n++){if(!(await isOpen(ports[0]))&&!(await isOpen(ports[1])))break;await pause(50);}
 evidence.listenersClosed=!(await isOpen(ports[0]))&&!(await isOpen(ports[1]));
 if(!evidence.listenersClosed){evidence.status='FAIL';process.exitCode=1;}
 evidence.finishedAt=new Date().toISOString();
 await writeFile(join(output,'public-package.json'),JSON.stringify(evidence,null,2));
}
console.log(JSON.stringify({status:evidence.status,evidence:join(output,'public-package.json')}));
