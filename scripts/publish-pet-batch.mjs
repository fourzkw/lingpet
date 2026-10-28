import {cp,mkdir,readFile,copyFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {json,save,digest,STATES,safeId} from '../src/creation/store.js';
import {CreationService} from '../src/creation/service.js';
import {validateAppearance} from '../src/creation/validation.js';
const spec=await json(path.resolve(process.argv[2])),root=path.resolve(spec.outputRoot),record=await json(path.join(root,'project.json')),service=new CreationService(path.join(root,'project-data'));
const job=await service.task({projectId:record.projectId,taskId:record.processTask});if(job.status!=='completed'||!job.validation.complete)throw new Error('八种动作后处理尚未完成');
const asset=safeId(spec.asset),out=path.resolve('assets',asset,'actions-v1');await mkdir(out,{recursive:true});await cp(job.bundle,out,{recursive:true});
await copyFile(path.join(root,'base.png'),path.resolve('assets',asset,'base.png'));
const manifest=await json(path.join(out,'manifest.json'));manifest.character=asset;for(const [state,override] of Object.entries(spec.playbackOverrides||{})){const clip=manifest.clips[state];clip.durations=clip.frames.map((frame,i)=>override.frameDurations?.[frame]??clip.durations[i]);}await save(path.join(out,'manifest.json'),manifest);await writeFile(path.join(out,'manifest.js'),'export default '+JSON.stringify(manifest)+';\n');
const videos={};for(const state of STATES){const task=await service.task({projectId:record.projectId,taskId:record.tasks[state]});const video=task.outputs.find(a=>a.mimeType==='video/mp4');videos[state]={promptId:task.promptId,sha256:video.sha256,inputSha256:task.inputs[0].sha256,workflowHash:task.workflowHash,model:task.config.models.h3Model,clip:task.config.models.h3Clip,vae:task.config.models.h3Vae,prompt:task.parameters.prompt};}
const legacyAssets={};for(const file of spec.legacyAssets||[])legacyAssets[file]=digest(await readFile(file));
await save(path.join(out,'provenance.json'),{schemaVersion:1,character:asset,projectId:record.projectId,visualInputSha256:record.sourceSha256,baseImage:'../base.png',imageGeneration:'user-approved built-in imagegen candidate v4',videoGeneration:'local ComfyUI MiniMax H3',videos,processing:job.parameters,processorSha256:digest(await readFile('src/creation/processor.py')),playbackOverrides:spec.playbackOverrides,legacyAssets,reusedPreviousAnimationAssets:false,createdAt:new Date().toISOString()});
const validation=await validateAppearance(out);if(!validation.valid||!validation.complete)throw new Error(JSON.stringify(validation));
await writeFile(path.resolve('assets',asset,'README.md'),'# '+spec.project.name+'\n\n基于用户确认的第四版白羽龙姬制作，使用新 H3 八动作视频，原图384px与像素192px共用动作时序；旧版素材保留源码备份。输入、提示词、模型和视频哈希见 actions-v1/provenance.json。\n');
console.log(JSON.stringify({published:out,variants:validation.variants,states:Object.keys(manifest.clips)}));
