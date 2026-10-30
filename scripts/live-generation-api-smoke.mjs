// Explicit manual test only. Credentials are read in memory from the existing installation.
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [installation='E:/Program Files/LingPet',output,action='image']=process.argv.slice(2);
if(!output||!['image','video','poll','models'].includes(action))throw Error('Expected installation, output directory and image/video/poll/models');
const location=JSON.parse(await readFile(path.join(installation,'desktop-location.json'),'utf8'));
const app=path.join(installation,'versions',location.version,'resources/app');
const {GenerationAPISettings}=await import(pathToFileURL(path.join(app,'src/creation/generation-api-settings.js')));
const {CreationService}=await import(pathToFileURL(path.join(app,'src/creation/service.js')));
const {RemoteGeneration}=await import(pathToFileURL(path.join(app,'src/creation/remote-generation.js')));
const settings=new GenerationAPISettings(location.dataDir),config=await settings.read();
await mkdir(output,{recursive:true});
const reportFile=path.join(output,'report.json');let report;
try{report=JSON.parse(await readFile(reportFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;report={installedVersion:location.version,startedAt:new Date().toISOString(),requests:[],tests:{}};}
const keys=[config.image?.apiKey,...config.videoApis.map(v=>v.apiKey)].filter(Boolean);
function clean(text){let value=String(text);for(const key of keys)value=value.replaceAll(key,'[REDACTED]');return value.replace(/Bearer\s+[^\s"<>]+/gi,'Bearer [REDACTED]');}
const persist=()=>writeFile(reportFile,JSON.stringify(report,null,2));
const service=new CreationService(path.resolve(output),{fetcher:async(url,options)=>{
 const started=Date.now(),response=await fetch(url,options),u=new URL(url);
 const entry={method:options?.method||'GET',host:u.host,path:u.pathname,status:response.status,elapsedMs:Date.now()-started};
 if(!response.ok){const reader=response.clone().body.getReader();let bytes=0,chunks=[];try{while(bytes<16000){const {value,done}=await reader.read();if(done)break;bytes+=value.length;chunks.push(Buffer.from(value));}}finally{void reader.cancel();}entry.error=clean(Buffer.concat(chunks).toString('utf8').slice(0,4000));}
 report.requests.push(entry);await persist();console.log(JSON.stringify(entry));return response;
}});
const remote=new RemoteGeneration(service);remote.settings.read=async()=>config;
if(action==='models'){
 for(const [kind,model] of [['image',config.image?.model],...config.videoApis.map(v=>[v.id,v.model])]){
  try{const rows=await settings.models(kind,{},service.fetcher);report.tests['models-'+kind]={status:'completed',count:rows.length,configuredModel:model,found:rows.includes(model)};}
  catch(e){report.tests['models-'+kind]={status:'failed',error:clean(e.message)};}
 }await persist();console.log(JSON.stringify(report.tests));
}else{
 let project=report.projectId?await service.store.read('projects',report.projectId):await service.project({action:'create',name:'API 实测 '+new Date().toISOString(),brief:'API 可用性测试：白底上单只圆润蓝色小鸟，居中全身，无文字。',constraints:['仅测试，不应用到当前桌宠']});report.projectId=project.id;await persist();
 let job;
 if(action==='poll'){
  const id=report.tests.video?.taskId||report.tests.image?.taskId;if(!id)throw Error('No existing task to poll');job=await service.store.read('tasks',id);
 }else{
  if(report.tests[action]?.taskId)throw Error('Existing task found; use poll instead of resubmitting');
  if(action==='image')job=await remote.submit('image',{projectId:project.id,prompt:'A single cute round blue bird desktop companion, full body centered, tiny orange beak, two feet clearly visible, simple clean white background, no text, no watermark.',apiSize:'1024x1024'},'api');
  else{
   const video=config.videoApis.find(v=>v.url&&v.model);if(!video)throw Error('No configured video API');
   const imageJob=report.tests.image?.taskId&&await service.store.read('tasks',report.tests.image.taskId);if(!imageJob?.outputs?.length)throw Error('Image test has no output; video not submitted');
   job=await remote.submit('video',{projectId:project.id,baseId:imageJob.outputs[0].id,state:'idle',prompt:'The single blue bird gently blinks and breathes, feet stay still, fixed camera, unchanged plain background, no text.',durationSeconds:5,resolution:'480p',returnToStart:false},video.id);
  }
 }
 async function record(){const outputs=[];for(const asset of job.outputs||[]){const dest=path.join(output,job.kind+'-'+asset.id+(job.kind==='image'?asset.mimeType==='image/jpeg'?'.jpg':'.png':'.mp4'));await copyFile(service.store.assetPath(asset.id),dest);outputs.push({path:path.resolve(dest),bytes:asset.bytes,mimeType:asset.mimeType});}report.tests[job.kind]={provider:job.provider,model:job.config.model,taskId:job.id,remoteId:job.remoteId,status:job.status,error:job.error,outputs};await service.store.write('tasks',job);await persist();console.log(JSON.stringify(report.tests[job.kind]));}
 await record();
 const deadline=Date.now()+7*60*1000;
 while(['queued','running','finalizing'].includes(job.status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,10000));try{await remote.refresh(job,false);}catch(e){job.error=clean(e.message);await record();break;}await record();}
}
