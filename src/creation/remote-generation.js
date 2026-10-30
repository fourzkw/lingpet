import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {GenerationAPISettings} from './generation-api-settings.js';
import {videoProtocols} from './video-providers.js';
import {digest,json,save} from './store.js';
const now=()=>new Date().toISOString();
function endpoint(config,kind){
 const u=new URL(config.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw new Error('生成 API 地址无效');
 let base=u.href.replace(/\/$/,'');
 if(kind==='image')return /\/images\/generations$/.test(base)?base:base+'/images/generations';
 if(config.protocol==='seedance')return /\/contents\/generations\/tasks$/.test(base)?base:base+'/contents/generations/tasks';
 if(config.protocol==='grok-video')return /\/videos\/generations$/.test(base)?base:base+'/videos/generations';
 if(config.protocol==='gemini-interactions')return /\/interactions$/.test(base)?base:base+'/interactions';
 base=base.replace(/\/v[12](?:\/video_generation)?$/,'');return base+(config.protocol==='minimax-h3'?'/v2/video_generation':'/v1/video_generation');
}
function taskId(value){if(typeof value!=='string'||!value||value.length>200||! /^[\w.-]+$/.test(value))throw new Error('生成服务未返回有效任务 ID');return value;}
async function bounded(response,limit){if(Number(response.headers.get('content-length'))>limit)throw new Error('生成产物超出大小限制');let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw new Error('生成产物超出大小限制');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);}
function imageType(bytes){if(bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a')return 'image/png';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';throw new Error('生成图片必须为 PNG 或 JPEG');}
export class RemoteGeneration{
 constructor(service){this.service=service;this.store=service.store;this.settings=new GenerationAPISettings(service.dir);}
 async configuration(provider,kind){const all=await this.settings.read(),config=kind==='image'?all.image:all.videoApis.find(v=>v.id===provider);if(!config?.url||!config.model)throw new Error('生成服务未配置：'+provider);const protocol=config.protocol||(kind==='image'?'openai-images':provider==='seedance'?'seedance':'minimax-h3');if(!(kind==='image'?['openai-images']:videoProtocols).includes(protocol))throw new Error('生成服务协议不匹配');endpoint({...config,protocol},kind);return {...config,protocol};}
 async credentials(job){const config=await this.configuration(job.provider,job.kind);if(config.url!==job.config.url||config.protocol!==job.config.protocol)throw new Error('生成服务地址或协议已变更，请恢复原配置后查询此任务');return config.apiKey;}
 async request(url,{apiKey,auth='bearer',method='GET',body,timeout=30000}={}){
  const headers={...(apiKey?(auth==='google'?{'x-goog-api-key':apiKey}:{Authorization:'Bearer '+apiKey}):{}),...(body===undefined||body instanceof FormData?{}:{'Content-Type':'application/json'})};let response;
  try{response=await this.service.fetcher(url,{method,headers,body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(timeout)});}catch{throw new Error('生成服务请求中断或超时；请查询原任务，不要重复提交');}
  if(!response.ok){const error=new Error('生成 API HTTP '+response.status);error.status=response.status;throw error;}
  return response;
 }
 async api(url,options){const res=await this.request(url,options);let data;try{data=JSON.parse((await bounded(res,options?.auth==='google'?360*1024*1024:64*1024*1024)).toString('utf8'));}catch{throw new Error('生成服务返回了无效或过大的 JSON 响应');}
  if(data.error&&!data.status&&!data.task||data.type==='error'||data.base_resp?.status_code){const error=new Error('生成服务拒绝请求：'+(data.error?.code||data.error?.type||data.base_resp?.status_code||'provider_error'));error.rejected=true;throw error;}return data;
 }
 async download(url,kind){const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('产物下载地址无效');const res=await this.request(parsed.href,{timeout:120000});return bounded(res,kind==='image'?32*1024*1024:256*1024*1024);}
 responseFile(job){return path.join(this.store.root,'generation-responses',job.id+'.json');}
 async output(job,bytes,index=0){
  let mime;if(job.kind==='image')mime=imageType(bytes);else{if(bytes.length<12||bytes.toString('ascii',4,8)!=='ftyp')throw new Error('视频产物不是有效的 MP4 文件');mime='video/mp4';}
  const source='remote:'+job.id+':'+index,previous=(await this.service.assets(job.projectId)).find(a=>a.source===source);const asset=previous||await this.store.asset(job.projectId,bytes,job.kind+'-'+job.id+(mime==='video/mp4'?'.mp4':mime==='image/png'?'.png':'.jpg'),mime,{kind:job.kind,taskId:job.id,baseId:job.baseId,state:job.parameters.state,source});if(!job.outputs.some(a=>a.id===asset.id))job.outputs.push(asset);await this.store.write('tasks',job);
 }
 async finishImage(job){const result=await json(this.responseFile(job));if(!Array.isArray(result.data)||!result.data.length)throw new Error('生图 API 没有返回 data 图片列表');for(let i=0;i<result.data.length;i++){if(job.outputs.some(o=>o.source==='remote:'+job.id+':'+i))continue;const item=result.data[i];let bytes;if(item.b64_json){if(typeof item.b64_json!=='string'||item.b64_json.length>44*1024*1024)throw new Error('生成图片过大');bytes=Buffer.from(item.b64_json,'base64');if(bytes.length>32*1024*1024)throw new Error('生成图片过大');}else if(item.url)bytes=await this.download(item.url,'image');else throw new Error('生图响应缺少 b64_json 或 url');await this.output(job,bytes,i);}job.status='completed';delete job.error;}
 async finishGemini(job,key){
  const result=await json(this.responseFile(job));
  const video=result.steps?.filter(s=>s.type==='model_output').flatMap(s=>s.content||[]).find(c=>c.type==='video')||result.output_video;
  if(!video)throw new Error('Gemini 未返回视频产物');
  let bytes;
  if(video.data){if(typeof video.data!=='string'||video.data.length>350*1024*1024)throw new Error('生成视频过大');bytes=Buffer.from(video.data,'base64');}
  else if(video.uri){
   const base=endpoint(job.config,'video').replace(/\/interactions$/,'/'),url=new URL(video.uri,base),origin=new URL(base).origin;
   if(url.username||url.password||!['http:','https:'].includes(url.protocol))throw new Error('视频下载地址无效');
   if(url.origin===origin){
    const match=url.pathname.match(/\/files\/([\w.-]+)(?::download)?$/);if(!match)throw new Error('Gemini 文件地址无效');
    const file=await this.api(base+'files/'+encodeURIComponent(match[1]),{apiKey:key,auth:'google'});
    if(file.state==='FAILED'){job.status='failed';job.error='Gemini 视频文件处理失败';return;}
    if(file.state!=='ACTIVE'){job.status='finalizing';return;}
    const response=await this.request(base+'files/'+encodeURIComponent(match[1])+':download?alt=media',{apiKey:key,auth:'google',timeout:120000});bytes=await bounded(response,256*1024*1024);
   }else bytes=await this.download(url.href,'video');
  }else throw new Error('Gemini 视频响应缺少 data 或 uri');
  if(bytes.length>256*1024*1024)throw new Error('生成视频过大');await this.output(job,bytes);job.status='completed';delete job.error;
 }
 async submit(kind,p,provider){
  const project=await this.store.read('projects',p.projectId),config=await this.configuration(provider,kind),url=endpoint(config,kind);
  if(kind==='image'&&((p.width===undefined)!==(p.height===undefined)))throw new Error('width 和 height 必须一起指定');
  const refs=kind==='image'?(p.referenceIds||[]):[p.baseId||project.selectedBase];if(kind==='video'&&!refs[0])throw new Error('请先选定基础图');
  const inputs=await Promise.all(refs.map(id=>this.service.asset(project.id,id))),images=[];
  for(const asset of inputs){const bytes=await readFile(this.store.assetPath(asset.id));if(digest(bytes)!==asset.sha256)throw new Error('输入资源被改动');const mime=imageType(bytes);if(bytes.length>20*1024*1024)throw new Error('API 参考图不能超过 20MB');images.push({bytes,mime,data:'data:'+mime+';base64,'+bytes.toString('base64')});}
  const job={id:randomUUID(),projectId:project.id,kind,provider,workflowVersion:3,projectSnapshot:{brief:project.brief,constraints:project.constraints},config:{url:config.url,model:config.model,protocol:config.protocol},parameters:p,inputs:inputs.map(a=>({id:a.id,sha256:a.sha256})),status:'submitting',createdAt:now(),outputs:[]};if(kind==='video')job.baseId=refs[0];
  job.warnings=['ComfyUI 的采样器、steps、cfg、cache 和 frames 不用于云端 API；云端视频使用 durationSeconds/resolution。'];
  let body,target=url;const prompt=p.prompt+(p.negativePrompt?'\n避免：'+p.negativePrompt:'');
  if(kind==='image'){
   const size=p.apiSize||(p.width?p.width+'x'+p.height:p.size?p.size+'x'+p.size:'1024x1024');
   if(images.length){target=url.replace(/\/generations$/,'/edits');body=new FormData();body.set('model',config.model);body.set('prompt',prompt);body.set('size',size);for(let i=0;i<images.length;i++)body.append('image[]',new Blob([images[i].bytes],{type:images[i].mime}),'reference-'+i+(images[i].mime==='image/png'?'.png':'.jpg'));}
   else body={model:config.model,prompt,size,n:1};
  }else{
   const protocol=config.protocol,duration=p.durationSeconds??(protocol==='minimax-hailuo'?6:5),content=[{type:'text',text:p.prompt},{type:'image_url',image_url:{url:images[0].data},role:'first_frame'}];if(p.returnToStart)content.push({type:'image_url',image_url:{url:images[0].data},role:'last_frame'});
   if(protocol==='seedance')body={model:config.model,content,duration,ratio:'adaptive',resolution:p.resolution||'720p',seed:p.seed??42};
   else if(protocol==='minimax-h3')body={model:config.model,content,duration,ratio:'adaptive',resolution:p.resolution||'768P'};
   else if(protocol==='grok-video'){
    if(p.returnToStart&&!/grok-imagine-video-1\.5/.test(config.model))throw new Error('此 Grok 模型的首尾帧能力未验证，请关闭 returnToStart 或使用支持该能力的 1.5 模型');
    body={model:config.model,prompt:p.prompt,image:{url:images[0].data},duration,resolution:(p.resolution||'720p').toLowerCase(),aspect_ratio:'1:1'};if(p.returnToStart)body.last_frame={url:images[0].data};
   }else if(protocol==='gemini-interactions'){
    const frame='[# Sources <FIRST_FRAME>@Image1'+(p.returnToStart?' <LAST_FRAME>@Image1':'')+']';
    body={model:config.model,input:[{type:'image',data:images[0].bytes.toString('base64'),mime_type:images[0].mime},{type:'text',text:frame+'\n'+p.prompt+(p.durationSeconds?'\nTarget video duration: '+p.durationSeconds+' seconds.':'')}],response_format:{type:'video',resolution:(p.resolution||'720p').toLowerCase(),delivery:'uri'}};
    job.warnings.push('Gemini 的时长通过提示词请求，实际时长以生成视频为准；画幅按该模型支持的默认比例输出。');
   }else{if(p.returnToStart)throw new Error('MiniMax Hailuo 的首尾帧能力依模型而异，请使用 H3 或 Seedance 协议');body={model:config.model,prompt:p.prompt,first_frame_image:images[0].data,duration,resolution:p.resolution||'720P',prompt_optimizer:false};}
   job.effectiveParameters={durationSeconds:protocol==='gemini-interactions'?null:duration,resolution:body.resolution||body.response_format?.resolution};
  }
  await this.store.write('tasks',job);
  try{const result=await this.api(target,{apiKey:config.apiKey,auth:config.protocol==='gemini-interactions'?'google':'bearer',method:'POST',body,timeout:kind==='image'||config.protocol==='gemini-interactions'?180000:60000});
   if(kind==='image'){await save(this.responseFile(job),result);job.status='finalizing';await this.store.write('tasks',job);await this.finishImage(job);}
   else if(config.protocol==='gemini-interactions'){
    if(result.id)job.remoteId=taskId(result.id);
    if(result.status==='failed'){job.status='failed';job.error='Gemini 视频生成失败';}
    else if(result.status==='completed'||result.output_video){await save(this.responseFile(job),result);job.status='finalizing';await this.store.write('tasks',job);await this.finishGemini(job,config.apiKey);}
    else{if(!job.remoteId)throw new Error('Gemini 未返回交互 ID');job.status='queued';}
   }else{job.remoteId=taskId(result.request_id||result.id||result.task_id);job.status='queued';}
  }catch(error){if(job.status!=='finalizing')job.status=error.rejected||error.status>=400&&error.status<500?'failed':'submission_unknown';job.error=error.message;}
  await this.store.write('tasks',job);return job;
 }
 async refresh(job,cancel){
  if(job.kind==='image'){if(job.status==='finalizing'){await this.finishImage(job);return;}job.error='生图提交结果不明，接口不支持按本机任务 ID 恢复；请在服务商后台核对，不会自动重新提交。';return;}
  if(job.config.protocol==='gemini-interactions'){
   const key=await this.credentials(job);if(job.status==='finalizing'){await this.finishGemini(job,key);return;}
   if(!job.remoteId){job.status='submission_unknown';job.error='Gemini 提交结果不明，请在服务商后台核对，不会自动重新提交。';return;}
   const result=await this.api(endpoint(job.config,'video')+'/'+encodeURIComponent(taskId(job.remoteId)),{apiKey:key,auth:'google'});
   if(result.status==='completed'){await save(this.responseFile(job),result);job.status='finalizing';await this.store.write('tasks',job);await this.finishGemini(job,key);}
   else if(['failed','cancelled','canceled'].includes(result.status)){job.status=result.status==='failed'?'failed':'cancelled';job.error='Gemini 视频生成'+(job.status==='failed'?'失败':'已取消');}
   else{job.status='running';if(cancel)job.error='当前 Gemini 适配器不支持取消，远端任务仍在执行；请在服务商后台处理。';}
   return;
  }
  if(!job.remoteId){job.status='submission_unknown';job.error='视频提交结果不明且未收到服务商任务 ID；请在服务商后台核对，不会自动重新提交。';return;}
  const key=await this.credentials(job),url=endpoint(job.config,'video'),id=encodeURIComponent(taskId(job.remoteId)),h3=job.config.protocol==='minimax-h3',seedance=job.config.protocol==='seedance';
  const grok=job.config.protocol==='grok-video',base=url.replace(/\/v[12]\/video_generation$/,''),query=grok?url.replace(/\/generations$/,'')+'/'+id:seedance?url+'/'+id:h3?base+'/v2/query/video_generation/'+id:base+'/v1/query/video_generation?task_id='+id;
  let data;try{data=await this.api(query,{apiKey:key});}catch(error){if(error.status===404){job.status=job.cancelRequestedAt?'cancelled':'missing';job.error='服务商未找到此任务';return;}throw error;}
  const task=data.task||data,status=String(task.status||'').toLowerCase();
  if(['succeeded','success','completed','done'].includes(status)){
   job.status='finalizing';await this.store.write('tasks',job);let output=task.video?.url||task.content?.video_url||task.content?.url;
   if(!output&&task.file_id){const file=await this.api(base+'/v1/files/retrieve?file_id='+encodeURIComponent(task.file_id),{apiKey:key});output=file.file?.download_url;}
   if(!output)throw new Error('视频任务已完成但没有下载地址');await this.output(job,await this.download(output,'video'));job.status='completed';delete job.error;return;
  }
  if(['failed','expired'].includes(status)){job.status='failed';job.error='视频生成失败：'+(task.error?.code||'provider_failed');return;}
  if(['cancelled','canceled'].includes(status)){job.status='cancelled';delete job.error;return;}
  job.status=['queued','pending','preparing','queueing'].includes(status)?'queued':'running';
  if(cancel){if(!seedance&&!h3){job.error=(grok?'Grok':'MiniMax Hailuo')+' 未提供当前适配器支持的取消接口，远端任务仍在执行；请到服务商后台处理。';return;}
   await this.request(seedance?url+'/'+id:url+'/'+id,{apiKey:key,method:'DELETE'});job.cancelRequestedAt=now();job.status='cancelled';delete job.error;return;}
  job.status=['queued','pending','preparing','queueing'].includes(status)?'queued':['running','processing','in_progress'].includes(status)?'running':'missing';if(job.status==='missing')job.error='生成服务返回未知任务状态，请在服务商后台核对';else delete job.error;
 }
}
