import {json,save,CreationStore} from './store.js';
import path from 'node:path';
const kinds=['image','video','seedance','minimax'];
const generationKinds=['image','video'];
export const providerIds={image:['api','comfyui'],video:['seedance','minimax','comfyui']};
export const defaultPriorities=()=>Object.fromEntries(generationKinds.map(kind=>[kind,providerIds[kind].map(id=>({id,enabled:true}))]));
export function validatePriorities(value){
 if(!value||typeof value!=='object')throw new Error('生成优先级无效');
 for(const kind of generationKinds){const rows=value[kind];if(!Array.isArray(rows)||rows.length!==providerIds[kind].length||new Set(rows.map(r=>r?.id)).size!==rows.length||rows.some(r=>!providerIds[kind].includes(r?.id)||typeof r.enabled!=='boolean'))throw new Error('每类优先级需包含 API 和 ComfyUI，且不能重复');}
 return Object.fromEntries(generationKinds.map(kind=>[kind,value[kind].map(({id,enabled})=>({id,enabled}))]));
}
export class GenerationAPISettings{
 constructor(dir){this.store=new CreationStore(dir);this.file=path.join(this.store.root,'generation-apis.json');}
 async read(){return json(this.file,{});}
 public(config){return Object.fromEntries(kinds.map(kind=>{const value=config[kind]||{};return [kind,{url:value.url||'',model:value.model||'',hasApiKey:Boolean(value.apiKey),protocol:value.protocol||(kind==='image'?'openai-images':kind==='minimax'?'minimax-h3':kind==='seedance'?'seedance':'unconfigured')}];}));}
 async get(){return this.public(await this.read());}
 async priorities(){return (await this.read()).priorities||defaultPriorities();}
 async setPriorities(value){const priorities=validatePriorities(value);return this.store.lock(async()=>{const config=await this.read();config.priorities=priorities;await save(this.file,config);return priorities;});}
 async configure(kind,values){
  if(!kinds.includes(kind)||!values||typeof values!=='object')throw new Error('无效的生成 API 配置');
  return this.store.lock(async()=>{
   const config=await this.read(),current=config[kind]||{},next={...current};
   if(values.protocol!==undefined){if(!(kind==='image'?['openai-images']:kind==='seedance'?['seedance']:kind==='minimax'?['minimax-h3','minimax-hailuo']:['seedance','minimax-h3','minimax-hailuo']).includes(values.protocol))throw new Error('不支持的生成协议');next.protocol=values.protocol;}
   for(const key of ['url','model','apiKey'])if(values[key]!==undefined){
    if(typeof values[key]!=='string'||values[key].length>(key==='apiKey'?8192:2048)||/[\r\n\x00]/.test(values[key]))throw new Error('API 配置字段无效');
    const value=values[key].trim();if(key!=='apiKey'||value)next[key]=value;
   }
   if(next.url){let url;try{url=new URL(next.url);}catch{throw new Error('API 地址格式无效');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||url.search)throw new Error('API 地址需为无内嵌凭证的 HTTP(S) 地址');next.url=url.href;}
   if(Boolean(next.url)!==Boolean(next.model))throw new Error('请同时填写 API 地址和模型名称');
   if(values.clearApiKey===true)delete next.apiKey;
   config[kind]=next;await save(this.file,config);return this.public(config);
  });
 }
}
