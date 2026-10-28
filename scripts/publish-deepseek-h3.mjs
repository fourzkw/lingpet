import {cp,mkdir,readFile,copyFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {json,save,digest,STATES} from '../src/creation/store.js';
import {CreationService} from '../src/creation/service.js';
import {validateAppearance} from '../src/creation/validation.js';
const root=path.resolve('output/video/deepseek-h3-v1'),record=await json(path.join(root,'project.json')),service=new CreationService(path.join(root,'project-data'));
const job=await service.task({projectId:record.projectId,taskId:record.processTask});if(job.status!=='completed'||!job.validation.complete)throw new Error('八种动作后处理尚未完成');
const out=path.resolve('assets/deepseek-h3/actions-v1');await mkdir(out,{recursive:true});await cp(job.bundle,out,{recursive:true});
await copyFile(path.join(root,'base.png'),path.resolve('assets/deepseek-h3/base.png'));
const manifest=await json(path.join(out,'manifest.json'));manifest.character='deepseek-h3';await save(path.join(out,'manifest.json'),manifest);await writeFile(path.join(out,'manifest.js'),'export default '+JSON.stringify(manifest)+';\n');
const videos={};for(const state of STATES){const task=await service.task({projectId:record.projectId,taskId:record.tasks[state]});const video=task.outputs.find(a=>a.mimeType==='video/mp4');videos[state]={promptId:task.promptId,sha256:video.sha256,inputSha256:task.inputs[0].sha256,workflowHash:task.workflowHash,model:task.config.models.h3Model,clip:task.config.models.h3Clip,vae:task.config.models.h3Vae,prompt:task.parameters.prompt};}
const old={};for(const relative of ['assets/deepseek/states.png','assets/deepseek/actions-v1/atlas.png','desktop/deepseek-actions.js'])old[relative]=digest(await readFile(relative));
await save(path.join(out,'provenance.json'),{schemaVersion:1,character:'deepseek-h3',projectId:record.projectId,visualInputSha256:record.sourceSha256,baseImage:'../base.png',imageGeneration:false,videoGeneration:'local ComfyUI MiniMax H3',videos,processing:job.parameters,legacyAssets:old,reusedPreviousAnimationAssets:false,createdAt:new Date().toISOString()});
const validation=await validateAppearance(out);if(!validation.valid||!validation.complete)throw new Error(JSON.stringify(validation));
await writeFile(path.resolve('assets/deepseek-h3/README.md'),'# DeepSeek 鲸鱼娘 H3\n\n以用户确认的透明 Q 版形象为唯一人物输入，MiniMax H3 生成八种动作；384×384、124帧、24fps、20步。每种动作单独保存源视频与工作流于 output/video/deepseek-h3-v1。\n\n原图版384px、像素版192px，按时间戳约12fps采样，跨动作共用64色色板。像素采用二值透明度，原图保留平滑边缘；两版构图与动作时序一致。思考/工作/批准/休眠从持续段循环，完成/异常单次播放。\n\n默认 deepseek/whale 使用这套资源，含原图和像素版本。旧版完整素材保留在 assets/deepseek，角色下可选择 whale-classic 恢复旧像素形象。provenance.json 记录输入、视频、模型和旧资源哈希。\n');
console.log(JSON.stringify({published:out,variants:validation.variants,states:Object.keys(manifest.clips),legacyAssetsPreserved:true}));
