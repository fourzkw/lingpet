import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {ensureRuntime} from './bootstrap.js';
import {readEndpoint,request} from './bridge-client.js';
import {connectionStatus} from './connection-status.js';
import {readRuntimeProgress} from './runtime-progress.js';

export function createPetControl(dir,{start=ensureRuntime,backgroundStart=false,source='codex'}={}){
  let busy=false,operationError;
  async function status(){
    const saved=await readRuntimeProgress(dir);
    const runtime=saved||{phase:'missing',message:'首次启动需要联网下载 Electron，下载后会自动校验并解压；以后复用本地运行时。'};
    if(runtime.phase==='ready')runtime.message=`Electron${runtime.version?' '+runtime.version:''} 已准备就绪，启动时会复用本地运行时，无需重复下载。`;
    const extra={runtime,pending:busy,...(operationError?{error:operationError}:{})};
    const endpoint=await readEndpoint(dir);
    if(endpoint)try{
      const health=await request(endpoint,'/health');
      const connections=await request(endpoint,'/connections').catch(()=>({}));
      const result=await request(endpoint,'/pets');
      return {running:true,state:health.state,connection:connectionStatus(connections,source),...extra,runtime:{...runtime,phase:'ready',message:`Electron${runtime.version?' '+runtime.version:''} 已准备就绪，正在使用本地运行时，无需重复下载。`},pets:result.pets.map(({id,name,character,enabled,petVisible})=>({id,name,character,enabled,visible:petVisible}))};
    }catch{}
    return {running:false,pets:[],...extra};
  }
  async function execute(action){
    try{
      await mkdir(dir,{recursive:true});
      if(action==='stop'){
        await writeFile(path.join(dir,'runtime.paused'),'用户通过侧栏关闭全部桌宠');
        if((await status()).running)await request(await readEndpoint(dir),'/quit',{});
        for(let i=0;i<50&&(await status()).running;i++)await new Promise(r=>setTimeout(r,100));
        if((await status()).running)throw new Error('桌宠关闭尚未完成，请重试');
      }else{
        await start(dir,{explicit:true,dashboard:action==='settings'});
        let current=await status();
        for(let i=0;i<60&&!current.running;i++){await new Promise(r=>setTimeout(r,200));current=await status();}
        if(!current.running)throw new Error('桌宠启动尚未完成，请重试');
        if(action==='start'){
          const endpoint=await readEndpoint(dir);
          if(!current.pets.length)await request(endpoint,'/pets/manage',{action:'create',value:{name:'灵伴',follow:{mode:'source',source}}});
          else {
            for(const pet of current.pets)await request(endpoint,'/pets/manage',{action:'update',id:pet.id,value:{enabled:true,petVisible:true}});
          }
        }
      }
    }finally{busy=false;}
    return status();
  }
  async function run(action){
    if(!['start','stop','settings','status'].includes(action))throw new Error('未知桌宠操作');
    if(action==='status')return status();
    if(busy)return status();
    busy=true;operationError=undefined;
    if(backgroundStart&&action!=='stop'){
      void execute(action).catch(error=>{operationError=String(error.message||error);});
      return status();
    }
    return execute(action);
  }
  return {status,run};
}
