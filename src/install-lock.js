import {mkdir,open,readFile,stat,unlink} from 'node:fs/promises';
import path from 'node:path';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function withInstallLock(file,task,{timeout=180000}={}){
  await mkdir(path.dirname(file),{recursive:true});const deadline=Date.now()+timeout;
  while(true){
    let lock;
    try{lock=await open(file,'wx');}catch(error){
      if(error.code!=='EEXIST')throw error;
      try{
        const pid=Number(await readFile(file,'utf8'));let live=false;
        if(pid>0)try{process.kill(pid,0);live=true;}catch(error){live=error.code==='EPERM';}
        if(!live&&Date.now()-(await stat(file)).mtimeMs>10000)await unlink(file);
      }catch{}
      if(Date.now()>deadline)throw new Error('共享运行时正在安装，请稍后重试');await sleep(80);continue;
    }
    try{await lock.writeFile(String(process.pid));return await task();}
    finally{await lock.close();await unlink(file).catch(()=>{});}
  }
}
