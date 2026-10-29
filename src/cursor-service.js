import {randomUUID} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {open,readFile,stat,unlink,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {BridgeClient,readEndpoint,request} from './bridge-client.js';
import {startLocalServer} from './local-server.js';
import {CursorObserver} from './cursor-observer.js';
import {describeRelease} from './release.js';
import {ensureRuntime} from './bootstrap.js';
import {cursorLeaseAllowed} from './cursor-lease.js';

const execFileAsync=promisify(execFile);
export const cursorDirectory=dir=>path.join(dir,'cursor');
function alive(pid){try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}}
export async function cursorRunning(){
  if(process.platform!=='win32')return true;
  try{const {stdout}=await execFileAsync('tasklist',['/FI','IMAGENAME eq Cursor.exe','/FO','CSV','/NH'],{windowsHide:true,timeout:4000});return /"Cursor\.exe"/i.test(stdout);}catch{return true;}
}

export async function startCursorService(dir,{autoStart=true,ownerCheck=cursorRunning,intervalMs=10000,idleMs=30000}={}){
  const serviceDir=cursorDirectory(dir);await mkdir(serviceDir,{recursive:true});
  const lockFile=path.join(serviceDir,'service.lock');let lock;
  for(let attempt=0;attempt<2;attempt++){
    try{lock=await open(lockFile,'wx');break;}catch(error){
      if(error.code!=='EEXIST')throw error;
      try{
        const pid=Number(await readFile(lockFile,'utf8'));
        if(pid>0&&alive(pid)||Date.now()-(await stat(lockFile)).mtimeMs<5000)return null;
        await unlink(lockFile);
      }catch{return null;}
    }
  }
  if(!lock)return null;
  await lock.writeFile(String(process.pid));
  let server,timer,stopping=false,closing,busy=false,lastEvent=Date.now(),ownerMisses=0;
  const client=new BridgeClient({dir,source:'cursor',instanceId:'cursor-'+randomUUID(),release:describeRelease(),ensureRuntime:autoStart?()=>ensureRuntime(dir):undefined,logger:{warn(){}}});
  const observer=new CursorObserver(event=>client.enqueue(event),{instanceId:client.instanceId});
  client.onReconnect=()=>observer.replay();
  const close=()=>{
    if(closing)return closing;stopping=true;clearInterval(timer);
    closing=(async()=>{
      await client.close();await server?.close();await lock.close();
      await unlink(lockFile).catch(()=>{});
    })();
    return closing;
  };
  try{
    // Reuse the same authenticated, loopback-only transport as the pet.
    server=await startLocalServer({instances:new Map(),sessions:observer.sessions,current:()=>({state:'idle'}),
      register(){},heartbeat:()=>false,disconnect(){},
      accept(raw){lastEvent=Date.now();return observer.accept(raw);},
    },serviceDir,{quitPet:()=>{void close();}});
    client.start();
    timer=setInterval(async()=>{
      if(busy||stopping)return;busy=true;
      try{
        const running=await cursorLeaseAllowed(dir)&&await ownerCheck();ownerMisses=running?0:ownerMisses+1;
        const allEnded=[...observer.sessions.values()].every(s=>s.ended);
        if(ownerMisses>=2||allEnded&&Date.now()-lastEvent>idleMs)await close();
      }finally{busy=false;}
    },intervalMs);
    return {close,observer,client,endpoint:server.endpoint};
  }catch(error){await close();throw error;}
}

export async function forwardCursorEvent(dir,event,{start=true,timeoutMs=1800}={}){
  const serviceDir=cursorDirectory(dir);
  async function send(){const endpoint=await readEndpoint(serviceDir);if(!endpoint)throw new Error('Cursor bridge offline');return request(endpoint,'/event',event,400);}
  try{return await send();}catch{}
  if(!start)return null;
  const env={...process.env,BOARD_PET_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;delete env.BOARD_PET_SMOKE;delete env.BOARD_PET_LIFECYCLE_SMOKE;
  const child=spawn(process.execPath,[fileURLToPath(new URL('../bin/cursor-bridge.js',import.meta.url))],{env,windowsHide:true,detached:true,stdio:'ignore'});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){try{return await send();}catch{}await new Promise(resolve=>setTimeout(resolve,60));}
  return null;
}
