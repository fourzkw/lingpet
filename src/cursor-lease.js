import {mkdir,writeFile,readFile,readdir,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

export async function cursorLeaseAllowed(dir,{now=Date.now(),maxAge=30000}={}){
  const base=path.join(dir,'cursor');let mode;
  try{mode=JSON.parse(await readFile(path.join(base,'adapter-mode.json'),'utf8'));}catch{return true;}
  if(!mode.requiresExtension)return true;
  let files;try{files=await readdir(path.join(base,'leases'));}catch{return false;}
  for(const file of files){
    if(!file.endsWith('.json'))continue;
    try{const lease=JSON.parse(await readFile(path.join(base,'leases',file),'utf8'));if(now-lease.time>maxAge)continue;process.kill(lease.pid,0);return true;}catch{}
  }
  return false;
}
export async function acquireCursorLease(dir){
  const base=path.join(dir,'cursor'),leases=path.join(base,'leases');await mkdir(leases,{recursive:true});
  const id=randomUUID(),file=path.join(leases,id+'.json');let disposed=false,pending=Promise.resolve();
  const write=()=>pending=pending.then(async()=>{if(disposed)return;const temp=file+'.tmp';await writeFile(temp,JSON.stringify({pid:process.pid,time:Date.now()}));await rename(temp,file);if(disposed)await unlink(file).catch(()=>{});}).catch(()=>{});
  await write();const mode=path.join(base,'mode-'+id+'.tmp');await writeFile(mode,JSON.stringify({requiresExtension:true}));await rename(mode,path.join(base,'adapter-mode.json'));
  const timer=setInterval(()=>void write(),10000);timer.unref?.();
  return {async dispose(){disposed=true;clearInterval(timer);await pending;await unlink(file).catch(()=>{});}};
}
