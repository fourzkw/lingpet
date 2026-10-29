import {writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {atomicRename} from './atomic-directory.js';

export async function readRuntimeProgress(dir){
  try{return JSON.parse(await readFile(path.join(dir,'runtime-status.json'),'utf8'));}catch{return null;}
}

// Serialize and atomically publish updates: polling clients never see half a JSON file.
export function runtimeProgress(dir,version,{logger=console,now=Date.now}={}){
  let queue=Promise.resolve(),lastWrite=-Infinity,lastLog=-Infinity,lastPercent=-10;
  function publish(value){
    const status={...value,version,time:now()};
    queue=queue.then(async()=>{
      const file=path.join(dir,'runtime-status.json'),temp=file+'.tmp';
      await writeFile(temp,JSON.stringify(status));await atomicRename(temp,file);
    });
    return queue;
  }
  return {
    stage(phase,message){logger.info?.('[灵伴] '+message);return publish({phase,message});},
    progress(value){
      const time=now();if(time-lastWrite<500)return Promise.resolve();lastWrite=time;
      const transferred=Math.max(0,Number(value.transferred)||0),total=Math.max(0,Number(value.total)||0);
      const percent=total?Math.min(100,Math.floor(transferred/total*100)):null;
      const mb=n=>(n/1048576).toFixed(1)+' MB';
      const message=total?`正在下载 Electron ${version}：${percent}%（${mb(transferred)} / ${mb(total)}）`:`正在下载 Electron ${version}：已下载 ${mb(transferred)}`;
      if(time-lastLog>=10000||(percent!==null&&percent-lastPercent>=10)){logger.info?.('[灵伴] '+message);lastLog=time;lastPercent=percent??lastPercent;}
      return publish({phase:'downloading',message,transferred,total,percent});
    },
    flush(){return queue;},
  };
}
