import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {CreationService} from '../src/creation/service.js';
import {creationSchemas} from '../src/creation/tools.js';
import {json,save,digest,STATES} from '../src/creation/store.js';
const spec=JSON.parse(await readFile(path.resolve(process.argv[2]),'utf8'));
const root=path.resolve(spec.outputRoot),recordFile=path.join(root,'project.json'),service=new CreationService(path.join(root,'project-data'));
let record=await json(recordFile,{});const action=process.argv[3]||'status';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function queueFree(){const config=await service.store.config(),q=await service.client(config).json('/queue');if(q.queue_running.length||q.queue_pending.length)throw new Error('ComfyUI 有活动任务，暂不追加批次；可稍后继续');}
async function stopped(){try{await access(path.join(root,'stop'));return true;}catch{return false;}}
async function wait(taskId){
  while(true){
    if(await stopped()){await service.task({action:'cancel',projectId:record.projectId,taskId});throw new Error('用户停止，本批次不会继续提交');}
    const task=await service.task({projectId:record.projectId,taskId});
    await save(path.join(root,'progress.json'),{taskId,status:task.status,state:task.parameters?.state,updatedAt:new Date().toISOString()});
    if(task.status==='completed')return task;
    if(['failed','cancelled','missing','submission_unknown'].includes(task.status))throw new Error(JSON.stringify({taskId,status:task.status,error:task.error}));
    await sleep(4000);
  }
}
const identity=spec.identity,actions=spec.actions;
if(action==='prepare'){
 await queueFree();await mkdir(root,{recursive:true});
 if(record.projectId)throw new Error('项目已存在，直接继续 generate');
 const source=path.resolve(spec.baseImage);
 const env=await service.environment({action:'configure',...spec.environment});
 if(!env.profiles.h3.ready||!env.processing.ready)throw new Error(JSON.stringify(env));
 const project=await service.project({action:'create',...spec.project});
 await copyFile(source,path.join(root,'base.png'));const asset=await service.project({action:'add_reference',projectId:project.id,path:path.join(root,'base.png'),purpose:'base'});
 record={projectId:project.id,sourceId:asset.id,sourceSha256:asset.sha256,tasks:{},createdAt:new Date().toISOString()};await save(recordFile,record);
 const config=await service.store.config(),client=service.client(config),uploaded=await client.upload(await readFile(service.store.assetPath(asset.id)),'confirmed_pet_base.png');
 const id=randomUUID(),graph={'1':{class_type:'LoadImage',inputs:{image:uploaded}},'2':{class_type:'ImageScale',inputs:{image:['1',0],upscale_method:'lanczos',width:640,height:640,crop:'disabled'}},'3':{class_type:'InvertMask',inputs:{mask:['1',1]}},'4':{class_type:'EmptyImage',inputs:{width:768,height:768,batch_size:1,color:43520}},'5':{class_type:'ImageCompositeMasked',inputs:{destination:['4',0],source:['2',0],mask:['3',0],x:64,y:64,resize_source:false}},'6':{class_type:'SaveImage',inputs:{images:['5',0],filename_prefix:'board_pet/pet_reference_'+id}}};
 const job={id,projectId:project.id,kind:'image',config,parameters:{operation:'composite actual alpha onto green; fixed canvas and safe margins'},graph,workflowHash:digest(JSON.stringify(graph)),inputs:[{id:asset.id,sha256:asset.sha256}],status:'submitting',outputs:[],createdAt:new Date().toISOString()};await service.store.write('tasks',job);record.prepareTask=id;await save(recordFile,record);
 const submission=await client.json('/prompt',{method:'POST',body:{prompt:graph,client_id:id,extra_data:{board_pet:{jobId:id,projectId:project.id}}}});job.promptId=submission.prompt_id;job.status='queued';await service.store.write('tasks',job);
 const finished=await wait(id),reference=finished.outputs[0];await writeFile(path.join(root,'reference-green.png'),await readFile(service.store.assetPath(reference.id)));await service.project({action:'select_base',projectId:project.id,assetId:reference.id});record.baseId=reference.id;await save(recordFile,record);console.log(JSON.stringify({prepared:true,...record}));
}else if(action==='generate'){
 if(!record.baseId)throw new Error('请先 prepare');
 const states=process.argv.slice(4);if(!states.length)states.push(...STATES);
 for(const state of states){
  if(!STATES.includes(state))throw new Error('未知动作');if(await stopped())throw new Error('批次已停止');
  const out=path.join(root,state);await mkdir(out,{recursive:true});let task;
  if(record.tasks[state]){task=await service.task({projectId:record.projectId,taskId:record.tasks[state]});if(['failed','cancelled','missing','submission_unknown'].includes(task.status))throw new Error('已有任务需检查，不盲目重提: '+JSON.stringify(task));}
  else{
   await queueFree();const prompt=identity+actions[state]+spec.motionConstraints;
   task=await service.generate('video',creationSchemas.board_pet_generate_video.parse({projectId:record.projectId,state,prompt,...spec.video,seed:spec.seed+STATES.indexOf(state),returnToStart:['idle','input','done','error'].includes(state)}));record.tasks[state]=task.id;await save(recordFile,record);await save(path.join(out,'workflow.json'),task.graph);console.log(state+' submitted '+task.promptId);
  }
  const result=task.status==='completed'?task:await wait(task.id);const asset=result.outputs.find(a=>a.mimeType==='video/mp4');if(!asset)throw new Error('没有 mp4');await writeFile(path.join(out,'video.mp4'),await readFile(service.store.assetPath(asset.id)));await save(path.join(out,'task.json'),result);console.log(state+' completed '+asset.sha256);
 }
}else if(action==='process'){
 const clips={};for(const state of STATES){const task=await service.task({projectId:record.projectId,taskId:record.tasks[state]}),asset=task.outputs.find(a=>a.mimeType==='video/mp4');if(!asset)throw new Error('缺少 '+state);clips[state]={assetId:asset.id,loop:!['done','error'].includes(state),...spec.clipRules[state]};}
 if(!record.processTask){const job=await service.process(creationSchemas.board_pet_process_assets.parse({projectId:record.projectId,clips,...spec.processing}));record.processTask=job.id;await save(recordFile,record);}
 const result=await wait(record.processTask);console.log(JSON.stringify({processed:true,bundle:result.bundle,taskId:result.id,validation:result.validation}));
}else{const tasks=[];for(const [state,id]of Object.entries(record.tasks||{})){const job=await service.task({projectId:record.projectId,taskId:id});tasks.push({state,taskId:id,promptId:job.promptId,status:job.status,error:job.error});}console.log(JSON.stringify({projectId:record.projectId,tasks,processTask:record.processTask}));}
