import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {ensureRuntime} from './bootstrap.js';
import {readEndpoint,request} from './bridge-client.js';

export function createPetControl(dir,{start=ensureRuntime}={}){
  let busy=false;
  async function status(){
    const endpoint=await readEndpoint(dir);
    if(endpoint)try{
      const health=await request(endpoint,'/health');
      const result=await request(endpoint,'/pets');
      return {running:true,state:health.state,pets:result.pets.map(({id,name,character,enabled,petVisible})=>({id,name,character,enabled,visible:petVisible}))};
    }catch{}
    return {running:false,pets:[]};
  }
  async function run(action){
    if(!['start','stop','settings','status'].includes(action))throw new Error('未知桌宠操作');
    if(action==='status')return status();
    if(busy)throw new Error('正在处理，请稍候');busy=true;
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
          if(!current.pets.length)await request(endpoint,'/pets/manage',{action:'create',value:{name:'灵伴',follow:{mode:'source',source:'codex'}}});
          else {
            for(const pet of current.pets)await request(endpoint,'/pets/manage',{action:'update',id:pet.id,value:{enabled:true,petVisible:true}});
          }
        }
      }
      return status();
    }finally{busy=false;}
  }
  return {status,run};
}
