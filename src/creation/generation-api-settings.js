import {json,save,CreationStore} from './store.js';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {videoVendor,videoVendors,videoProtocols,videoReady} from './video-providers.js';
const kinds=['image','video','seedance','minimax'];
const generationKinds=['image','video'];
function apiField(value,key){
 if(typeof value!=='string'||value.length>(key==='apiKey'?8192:2048)||/[\r\n\x00]/.test(value))throw new Error('API 配置字段无效');
 return value.trim();
}
function apiURL(value){
 let url;try{url=new URL(value);}catch{throw new Error('API 地址格式无效');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||url.search)throw new Error('API 地址需为无内嵌凭证的 HTTP(S) 地址');
 return url;
}
export function modelsEndpoint(value,kind){
 const url=apiURL(value);let base=url.href.replace(/\/+$/,'').replace(/\/(?:images\/(?:generations|edits)|contents\/generations\/tasks|videos\/generations|interactions|video_generation)$/,'');
 if(/\/models$/.test(base))return base;
 if(kind==='minimax')base=base.replace(/\/v[12]$/,'')+'/v1';
 return /\/models$/.test(base)?base:base+'/models';
}
export const providerIds={image:['api','imagegen','comfyui'],video:['seedance','minimax','comfyui']};
export const defaultPriorities=()=>Object.fromEntries(generationKinds.map(kind=>[kind,providerIds[kind].map(id=>({id,enabled:true}))]));
export function validatePriorities(value,ids=providerIds){
 if(!value||typeof value!=='object')throw new Error('生成优先级无效');
 for(const kind of generationKinds){const rows=value[kind];if(!Array.isArray(rows)||rows.length!==ids[kind].length||new Set(rows.map(r=>r?.id)).size!==rows.length||rows.some(r=>!ids[kind].includes(r?.id)||typeof r.enabled!=='boolean'))throw new Error('优先级需包含当前已配置服务和 ComfyUI，且不能重复；配置可能已变更，请刷新后重试');}
 return Object.fromEntries(generationKinds.map(kind=>[kind,value[kind].map(({id,enabled})=>({id,enabled}))]));
}
export class GenerationAPISettings{
 constructor(dir){this.store=new CreationStore(dir);this.file=path.join(this.store.root,'generation-apis.json');}
 async read(){const config=await json(this.file,{});if(!Array.isArray(config.videoApis)){
  config.videoApis=[];
  for(const kind of ['seedance','minimax','video']){const value=config[kind];if(!value?.url||!value.model)continue;const protocol=value.protocol||(kind==='seedance'?'seedance':kind==='minimax'?'minimax-h3':null);if(!videoProtocols.includes(protocol))continue;const vendor=videoVendors.find(v=>v.protocols.some(([p])=>p===protocol)).id;config.videoApis.push({...value,id:kind,name:videoVendor(vendor).name,vendor,protocol});}
 }return config;}
 public(config){return {...Object.fromEntries(kinds.map(kind=>{const value=config[kind]||{};return [kind,{url:value.url||'',model:value.model||'',hasApiKey:Boolean(value.apiKey),protocol:value.protocol||(kind==='image'?'openai-images':kind==='minimax'?'minimax-h3':kind==='seedance'?'seedance':'unconfigured')}];})),videoApis:config.videoApis.map(({id,name,vendor,url,model,protocol,apiKey})=>({id,name,vendor,url,model,protocol,hasApiKey:Boolean(apiKey)}))};}
 async get(){return this.public(await this.read());}
 async models(kind,values={},fetcher=globalThis.fetch){
  const config=await this.read(),entry=config.videoApis.find(row=>row.id===kind);
  if(!kinds.includes(kind)&&!entry&&kind!=='video-api'||!values||typeof values!=='object')throw new Error('无效的生成 API 配置');
  const current=entry||config[kind]||{},url=apiField(values.url??current.url??'','url'),protocol=values.protocol??current.protocol;
  if(!url)throw new Error('请先填写 API 基础地址');
  const target=modelsEndpoint(url,protocol?.startsWith('minimax-')?'minimax':kind),typedKey=apiField(values.apiKey??'','apiKey');
  // A newly entered host must never receive another service's stored key.
  const sameOrigin=current.url&&apiURL(current.url).origin===apiURL(url).origin&&(!entry||values.vendor===undefined||values.vendor===entry.vendor);
  const apiKey=values.clearApiKey===true?'':typedKey||(sameOrigin?current.apiKey:'');
  const signal=AbortSignal.timeout(20000),rows=[],tokens=new Set();let nextTarget=target;
  for(let page=0;page<20;page++){
  let response;
  try{response=await fetcher(nextTarget,{method:'GET',headers:apiKey?(protocol==='gemini-interactions'?{'x-goog-api-key':apiKey}:{Authorization:'Bearer '+apiKey}):{},redirect:'error',signal});}catch{throw new Error('获取模型失败：连接中断或超时，请检查 API 地址和网络');}
  if(!response.ok){await response.body?.cancel();throw new Error(response.status===404||response.status===405?'此服务未提供模型列表接口，请手动填写模型名称':'获取模型失败：HTTP '+response.status+'，请检查地址、密钥和访问权限');}
  let data;
  try{
   const limit=2*1024*1024;let size=0;const chunks=[];
   for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw new Error('too large');chunks.push(Buffer.from(chunk));}
   data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch{throw new Error('模型列表响应无效或过大，请手动填写模型名称');}
  if(data?.error||data?.base_resp?.status_code)throw new Error('服务拒绝获取模型，请检查密钥和访问权限');
  const items=Array.isArray(data)?data:data?.data??data?.models;
  if(!Array.isArray(items))throw new Error('服务未返回有效模型列表，请手动填写模型名称');rows.push(...items);
  const token=protocol==='gemini-interactions'?data.nextPageToken:null;if(!token)break;
  if(typeof token!=='string'||token.length>4096||tokens.has(token)||page===19||rows.length>10000)throw new Error('模型列表分页异常，请手动填写模型名称');
  tokens.add(token);const next=new URL(target);next.searchParams.set('pageToken',token);nextTarget=next.href;
  }
  return [...new Set(rows.map(row=>typeof row==='string'?row:row?.id??row?.name).filter(id=>typeof id==='string'&&id.trim()&&id.length<=2048&&!/[\r\n\x00]/.test(id)).map(id=>protocol==='gemini-interactions'?id.trim().replace(/^models\//,''):id.trim()))].sort();
 }
 priorityIds(config){return {image:providerIds.image,video:[...config.videoApis.filter(videoReady).map(v=>v.id),'comfyui']};}
 reconcile(config){const ids=this.priorityIds(config),saved=config.priorities||defaultPriorities();return Object.fromEntries(generationKinds.map(kind=>{const seen=new Set(),rows=[];for(const row of saved[kind]||[])if(ids[kind].includes(row.id)&&!seen.has(row.id)){seen.add(row.id);rows.push({id:row.id,enabled:row.enabled!==false});}for(const id of ids[kind])if(!seen.has(id))rows.push({id,enabled:true});return [kind,rows];}));}
 async priorities(){return this.reconcile(await this.read());}
 async setPriorities(value){return this.store.lock(async()=>{const config=await this.read(),priorities=validatePriorities(value,this.priorityIds(config));config.priorities=priorities;await save(this.file,config);return priorities;});}
 async saveVideo(id,values){return this.store.lock(async()=>{
  const config=await this.read();if(!values||typeof values!=='object')throw new Error('无效的视频 API 配置');
  const index=id?config.videoApis.findIndex(v=>v.id===id):-1;if(id&&index<0)throw new Error('视频 API 已被删除，请刷新');
  if(index<0&&config.videoApis.length>=32)throw new Error('最多添加 32 个视频 API');
  const current=index<0?{}:config.videoApis[index],vendor=videoVendor(values.vendor??current.vendor);if(!vendor)throw new Error('请选择支持的视频厂家');
  const protocol=values.protocol??current.protocol??vendor.protocols[0][0];if(!vendor.protocols.some(([p])=>p===protocol))throw new Error('视频厂家与协议不匹配');
  const next={...current,id:current.id||'video-'+randomUUID(),vendor:vendor.id,protocol};
  for(const key of ['url','model','apiKey','name'])if(values[key]!==undefined){const value=apiField(values[key],key);if(key!=='apiKey'||value)next[key]=value;}
  if(current.vendor&&current.vendor!==vendor.id&&!values.apiKey?.trim())delete next.apiKey;
  next.name=next.name||vendor.name;if(next.name.length>100)throw new Error('服务名称不能超过 100 个字符');
  if(!next.url||!next.model)throw new Error('请填写 API 地址和模型名称');next.url=apiURL(next.url).href;
  if(values.clearApiKey===true)delete next.apiKey;
  if(index<0)config.videoApis.push(next);else config.videoApis[index]=next;
  if(['seedance','minimax','video'].includes(next.id))config[next.id]={url:next.url,model:next.model,protocol:next.protocol,...(next.apiKey?{apiKey:next.apiKey}:{})};
  config.priorities=this.reconcile(config);await save(this.file,config);return {...this.public(config),savedVideoId:next.id};
 });}
 async removeVideo(id){return this.store.lock(async()=>{
  const config=await this.read();if(!config.videoApis.some(v=>v.id===id))throw new Error('视频 API 已被删除，请刷新');
  const active=['submitting','submission_unknown','queued','running','finalizing','cancelling','missing'];
  if((await this.store.list('tasks')).some(t=>t.provider===id&&active.includes(t.status)))throw new Error('此 API 仍有未完成的任务，请先完成或取消任务');
  config.videoApis=config.videoApis.filter(v=>v.id!==id);if(['seedance','minimax','video'].includes(id))delete config[id];config.priorities=this.reconcile(config);await save(this.file,config);return this.public(config);
 });}
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
   config[kind]=next;
   if(kind!=='image'){
    const index=config.videoApis.findIndex(v=>v.id===kind),protocol=next.protocol||(kind==='seedance'?'seedance':kind==='minimax'?'minimax-h3':null);
    if(next.url&&next.model&&videoProtocols.includes(protocol)){const vendor=videoVendors.find(v=>v.protocols.some(([p])=>p===protocol)).id,entry={...next,id:kind,name:config.videoApis[index]?.name||videoVendor(vendor).name,vendor,protocol};if(index<0)config.videoApis.push(entry);else config.videoApis[index]=entry;}
    else if(index>=0)config.videoApis.splice(index,1);
   }
   config.priorities=this.reconcile(config);await save(this.file,config);return this.public(config);
  });
 }
}
