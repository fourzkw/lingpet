import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {CreationService} from '../src/creation/service.js';
import {creationSchemas} from '../src/creation/tools.js';
import {json,save,digest,STATES} from '../src/creation/store.js';
const root=path.resolve('output/video/deepseek-h3-v1'),recordFile=path.join(root,'project.json'),service=new CreationService(path.join(root,'project-data'));
let record=await json(recordFile,{});const action=process.argv[2]||'status';
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
const identity='Exactly the SAME seated DeepSeek whale-maid chibi girl shown in the first frame. Enormous rounded head and tiny seated dumpling body, long dark indigo-to-cyan hair spreading near the feet, relaxed blue eyes, small playful smile, white ruffled maid headband, fin-shaped side ears, blue bow, navy maid dress with white apron, two white mitten hands, two small white feet side by side pointing forward, ONE blue whale tail on viewer-right with the same TWO-LOBED WHALE FLUKE. Preserve her exact face, outfit and proportions. ';
const actions={
 idle:'A very gentle idle: tiny natural breathing, a slight soft sway only at the hair tips and whale-tail tip. Exactly ONE quick natural simultaneous blink, then promptly return to the same relaxed half-lidded eyes. Blink lasts a fraction of a second, eyes keep identical size and position, no eyelid distortion. Both hands and feet remain at the starting positions. Return smoothly to the exact initial pose.',
 thinking:'One little mitten hand slowly moves to rest under her chin. A subtle thoughtful head tilt and small sideways eye glance. Hold the thinking pose with faint breathing through the end. Keep both feet and lower body still. Do not return to the neutral pose at the end.',
 working:'A small simple floating keyboard appears directly in front of her lap above the feet. Both mitten hands move to it and alternate soft continuous typing. Her head and upper torso stay calm and nearly still. End still typing on the keyboard. No waving or bouncing.',
 input:'One little mitten hand lifts beside her cheek and gives two small friendly inviting waves with a gentle smile. Lower it calmly back to the exact starting pose. Feet stay still. Return smoothly to the initial pose.',
 approval:'Both little mitten hands lift and hold ONE SMALL AMBER SHIELD with a dark KEYHOLE motif in front of her chest below her face. Calm patient expression, gentle breathing. Keep holding the shield steadily at the end. No checkmark and no disappearing shield.',
 done:'A warm happy smile and one gentle celebratory lift of both little mitten hands beside her cheeks, then lower them and settle back to the exact starting pose. Remain seated, no jumping or leg movement. No confetti or special effects.',
 error:'Brief mild surprise: little mitten hands lift towards her cheeks, eyebrows rise slightly, then hands lower and she calmly returns to her small initial smile. Keep the face and eye sizes stable, no extreme grimace, no crying or prolonged shaking. Remain seated.',
 sleep:'Slowly close BOTH eyes fully, relax the mitten hands at the lap, and let the head tilt a little in a comfortable seated doze. After closing, eyes remain fully shut for the rest of the video. End in a stable sleeping pose with faint breathing. Never reopen the eyes or return to the awake first pose.',
};
if(action==='prepare'){
 await queueFree();await mkdir(root,{recursive:true});
 if(record.projectId)throw new Error('项目已存在，直接继续 generate');
 const source='C:/Users/86476/AppData/Local/Temp/codex-clipboard-ed359961-3a4c-4474-8a51-3a732aefbcf9.png';
 const env=await service.environment({action:'configure',models:{h3Model:'minimax_h3_fl2va_pruned_int8_convrot.safetensors',h3Clip:'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',h3Vae:'minimax_h3_video_vae_fp16.safetensors'},python:'E:/ComfyUI_windows_portable/python_embeded/python.exe',targetedInterrupt:true});
 if(!env.profiles.h3.ready||!env.processing.ready)throw new Error(JSON.stringify(env));
 const project=await service.project({action:'create',character:'deepseek',name:'DeepSeek · 鲸鱼娘 H3',brief:'严格按用户确认图制作八种 H3 动作，增加原图版本，并替换当前鲸鱼娘像素显示；保留旧版资源备份。',constraints:['用户已确认基础图，不再生图','保留长发、团子坐姿、两只白色圆脚及一条双叶鲸尾','八种动作自然、眨眼短促、固定镜头与尺度','原图与像素来自同一组 H3 视频']});
 await copyFile(source,path.join(root,'base.png'));const asset=await service.project({action:'add_reference',projectId:project.id,path:path.join(root,'base.png'),purpose:'base'});
 record={projectId:project.id,sourceId:asset.id,sourceSha256:asset.sha256,tasks:{},createdAt:new Date().toISOString()};await save(recordFile,record);
 const config=await service.store.config(),client=service.client(config),uploaded=await client.upload(await readFile(service.store.assetPath(asset.id)),'deepseek_h3_confirmed_base.png');
 const id=randomUUID(),graph={'1':{class_type:'LoadImage',inputs:{image:uploaded}},'2':{class_type:'ImageScale',inputs:{image:['1',0],upscale_method:'lanczos',width:640,height:640,crop:'disabled'}},'3':{class_type:'InvertMask',inputs:{mask:['1',1]}},'4':{class_type:'EmptyImage',inputs:{width:768,height:768,batch_size:1,color:43520}},'5':{class_type:'ImageCompositeMasked',inputs:{destination:['4',0],source:['2',0],mask:['3',0],x:64,y:64,resize_source:false}},'6':{class_type:'SaveImage',inputs:{images:['5',0],filename_prefix:'board_pet/deepseek_reference_'+id}}};
 const job={id,projectId:project.id,kind:'image',config,parameters:{operation:'composite actual alpha onto green; fixed canvas and safe margins'},graph,workflowHash:digest(JSON.stringify(graph)),inputs:[{id:asset.id,sha256:asset.sha256}],status:'submitting',outputs:[],createdAt:new Date().toISOString()};await service.store.write('tasks',job);record.prepareTask=id;await save(recordFile,record);
 const submission=await client.json('/prompt',{method:'POST',body:{prompt:graph,client_id:id,extra_data:{board_pet:{jobId:id,projectId:project.id}}}});job.promptId=submission.prompt_id;job.status='queued';await service.store.write('tasks',job);
 const finished=await wait(id),reference=finished.outputs[0];await writeFile(path.join(root,'reference-green.png'),await readFile(service.store.assetPath(reference.id)));await service.project({action:'select_base',projectId:project.id,assetId:reference.id});record.baseId=reference.id;await save(recordFile,record);console.log(JSON.stringify({prepared:true,...record}));
}else if(action==='generate'){
 if(!record.baseId)throw new Error('请先 prepare');
 const states=process.argv.slice(3);if(!states.length)states.push(...STATES);
 for(const state of states){
  if(!STATES.includes(state))throw new Error('未知动作');if(await stopped())throw new Error('批次已停止');
  const out=path.join(root,state);await mkdir(out,{recursive:true});let task;
  if(record.tasks[state]){task=await service.task({projectId:record.projectId,taskId:record.tasks[state]});if(['failed','cancelled','missing','submission_unknown'].includes(task.status))throw new Error('已有任务需检查，不盲目重提: '+JSON.stringify(task));}
  else{
   await queueFree();const prompt=identity+actions[state]+' Locked static front-facing camera, consistent smooth 2D anime illustration, no pixel art or 3D. Entire head, headband, hair, hands, feet and whale fluke stay fully inside the frame with the same scale and baseline. Do not stretch or squash the body, change eye shape, shorten the hair, duplicate appendages, rotate feet inward, add legs or turn the whale tail into a spiral. Background stays perfectly FLAT SOLID GREEN #00AA00 throughout, no scenery, gradient, ground shadow, text, extra symbols or characters. No camera movement, zoom, cuts or speech. Silent desktop pet animation.';
   task=await service.generate('video',creationSchemas.board_pet_generate_video.parse({projectId:record.projectId,state,prompt,size:384,frames:124,steps:20,seed:2026102510+STATES.indexOf(state),returnToStart:['idle','input','done','error'].includes(state)}));record.tasks[state]=task.id;await save(recordFile,record);await save(path.join(out,'workflow.json'),task.graph);console.log(state+' submitted '+task.promptId);
  }
  const result=task.status==='completed'?task:await wait(task.id);const asset=result.outputs.find(a=>a.mimeType==='video/mp4');if(!asset)throw new Error('没有 mp4');await writeFile(path.join(out,'video.mp4'),await readFile(service.store.assetPath(asset.id)));await save(path.join(out,'task.json'),result);console.log(state+' completed '+asset.sha256);
 }
}else if(action==='process'){
 const clips={};for(const state of STATES){const task=await service.task({projectId:record.projectId,taskId:record.tasks[state]}),asset=task.outputs.find(a=>a.mimeType==='video/mp4');if(!asset)throw new Error('缺少 '+state);clips[state]={assetId:asset.id,startFrame:state==='working'?20:0,loop:!['done','error'].includes(state),loopFrom:['thinking','approval','sleep'].includes(state)?42:0,pingPong:['thinking','approval','sleep'].includes(state)};}
 if(!record.processTask){const job=await service.process(creationSchemas.board_pet_process_assets.parse({projectId:record.projectId,clips,background:'chroma',keyColor:[0,170,0],threshold:30,feather:40,despill:true,spillTolerance:10,variants:['original','pixel'],originalSize:384,pixelSize:192,padding:12,colors:64,alphaThreshold:160,fps:12}));record.processTask=job.id;await save(recordFile,record);}
 const result=await wait(record.processTask);console.log(JSON.stringify({processed:true,bundle:result.bundle,taskId:result.id,validation:result.validation}));
}else{const tasks=[];for(const [state,id]of Object.entries(record.tasks||{})){const job=await service.task({projectId:record.projectId,taskId:id});tasks.push({state,taskId:id,promptId:job.promptId,status:job.status,error:job.error});}console.log(JSON.stringify({projectId:record.projectId,tasks,processTask:record.processTask}));}
