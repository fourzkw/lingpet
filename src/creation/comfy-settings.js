import path from 'node:path';
import {CreationStore,save} from './store.js';
import {ComfyClient} from './comfy.js';
import {MODEL_KEYS} from './workflows.js';
export class ComfySettings{
 constructor(dir){this.store=new CreationStore(dir);}
 public(config){return {url:config.url,models:Object.fromEntries(MODEL_KEYS.map(key=>[key,config.models?.[key]||''])),python:config.python||'',targetedInterrupt:config.targetedInterrupt===true};}
 async get(){return this.public(await this.store.config());}
 async configure(values){
  if(!values||typeof values!=='object')throw new Error('无效的 ComfyUI 配置');
  return this.store.lock(async()=>{
   const config=await this.store.config();
   if(values.url!==undefined){if(typeof values.url!=='string'||!values.url.trim()||values.url.length>2048)throw new Error('请填写 ComfyUI 地址');new ComfyClient(values.url.trim());config.url=values.url.trim();}
   if(values.models!==undefined){if(!values.models||typeof values.models!=='object'||Array.isArray(values.models))throw new Error('模型配置无效');config.models={...config.models};for(const key of MODEL_KEYS)if(values.models[key]!==undefined){const value=values.models[key];if(typeof value!=='string'||value.length>512||/[\r\n\x00]/.test(value))throw new Error('模型文件名无效');config.models[key]=value.trim();}}
   if(values.python!==undefined){if(typeof values.python!=='string'||values.python.length>4096||/[\r\n\x00]/.test(values.python))throw new Error('Python 路径无效');config.python=values.python.trim();}
   if(values.targetedInterrupt!==undefined){if(typeof values.targetedInterrupt!=='boolean')throw new Error('定向中断开关无效');config.targetedInterrupt=values.targetedInterrupt;}
   await save(path.join(this.store.root,'config.json'),config);return this.public(config);
  });
 }
}
