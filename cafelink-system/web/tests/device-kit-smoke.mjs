// Software-only acceptance of the UAT launcher; never marks physical cases passed.
import { request, expect } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';

const options=Object.fromEntries(process.argv.slice(2).map(value=>{
  const split=value.indexOf('=');return [value.slice(2,split),value.slice(split+1)];
}));
if(!options.kit||!options.output)throw new Error('Specify --kit and --output');
const kit=resolve(options.kit),output=resolve(options.output);
await mkdir(output,{recursive:true});
const result={status:'RUNNING',physicalPhone:'NOT_RUN',physicalLan:'NOT_RUN',audibleSpeakerOutput:'NOT_RUN',checks:[]};
const probes=[createServer(),createServer()];
for(const probe of probes)await new Promise((ok,no)=>probe.once('error',no).listen(0,'127.0.0.1',ok));
const [port,tcpPort]=probes.map(probe=>probe.address().port);
for(const probe of probes)await new Promise(ok=>probe.close(ok));
const open=port=>new Promise(ok=>{const socket=connect(port,'127.0.0.1');socket.once('connect',()=>{socket.destroy();ok(true);});socket.once('error',()=>ok(false));});
const environment={...process.env,PATH:`${process.env.SystemRoot}\\System32;${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0`};
for(const key of ['JAVA_HOME','JRE_HOME','CAFELINK_QR_KEY','CAFELINK_DEMO_ADMIN_PASSWORD'])delete environment[key];
const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(kit,'Run-UAT.ps1'),'-Mode','Local','-Port',String(port),'-TcpPort',String(tcpPort),'-NoOpenBrowser'],{cwd:kit,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',data=>{log+=data.toString();});child.stderr.on('data',data=>{log+=data.toString();});
let client;
try{
  const origin=`http://127.0.0.1:${port}`;
  client=await request.newContext({baseURL:origin});
  let ready=false;
  for(let n=0;n<200;n++){
    if(child.exitCode!==null)throw new Error('UAT launcher stopped before ready: '+log);
    try{const response=await client.get('/api/ready',{timeout:800});if(response.status()===200&&(await response.json()).status==='READY'){ready=true;break;}}catch{}
    await pause(100);
  }
  expect(ready).toBe(true);result.checks.push('Kit launcher starts bundled JRE, TCP Core and database');
  expect((await (await client.get('/api/health')).json()).version).toBe('V9.4');
  const login=await client.post('/api/login',{headers:{Origin:origin},data:{username:'admin',password:'CafeLink@123'}});
  expect(login.status()).toBe(200);const session=await login.json();
  const command=await client.post('/api/command',{headers:{Origin:origin,'X-CSRF-Token':session.csrfToken},data:{commandId:crypto.randomUUID(),action:'OPEN_ALL_TABLES',data:{},scope:session.identity}});
  expect(command.status()).toBe(200);expect((await (await client.get('/api/state')).json()).tables).toHaveLength(6);
  result.checks.push('Authenticated admin operates real Gateway/TCP business API');
  await access(join(kit,'app/data/device-uat-local/cafelink.db'));
  let defaultProfile=false;try{await access(join(kit,'app/data/local-demo/cafelink.db'));defaultProfile=true;}catch{}
  expect(defaultProfile).toBe(false);result.checks.push('Only the dedicated UAT local profile is created');
  const human=JSON.parse(await readFile(join(kit,'RESULTS.json'),'utf8'));
  expect(human.cases.every(row=>row.result==='NOT_RUN')).toBe(true);
  expect(human.physicalPhone).toBe('NOT_RUN');expect(human.physicalLan).toBe('NOT_RUN');
  result.checks.push('Launching and automated probing do not complete human cases');
  result.status='PASS';
}catch(error){result.status='FAIL';result.error=error.message;process.exitCode=1;}
finally{
  await client?.dispose();
  if(child.exitCode===null)spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  let closed=false;
  for(let n=0;n<100;n++){if(!(await open(port))&&!(await open(tcpPort))){closed=true;break;}await pause(100);}
  result.listenersClosed=closed;
  if(!closed){result.status='FAIL';result.error='Owned UAT process left a listener';process.exitCode=1;}
  else result.checks.push('Owned launcher process tree and listeners are closed');
  await writeFile(join(output,'device-kit-smoke.json'),JSON.stringify(result,null,2));
  process.stdout.write(JSON.stringify({status:result.status,checks:result.checks.length,output})+'\n');
}
