import {RemoteGeneration} from './remote-generation.js';
import {GenerationAPISettings,providerIds} from './generation-api-settings.js';
import {ComfySettings} from './comfy-settings.js';
import {clipCandidates,maxClipDuration} from '../../desktop/action-clips.js';
import {readFile,writeFile,mkdir,cp,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {CreationStore,json,save,safeId,STATES,digest} from './store.js';
import {INTERACTION_KINDS} from '../animation-kinds.js';
import {ComfyClient} from './comfy.js';
import {environment,qwenWorkflow,h3Workflow} from './workflows.js';
import {validateAppearance} from './validation.js';
import {readEndpoint,request} from '../bridge-client.js';
import {CHARACTERS} from '../characters.js';

const ACTIVE=['submitting','submission_unknown','queued','running','processing','finalizing','cancelling','missing'];
const now=()=>new Date().toISOString();
export class CreationService{
  constructor(dir,{fetcher=fetch}={}){this.dir=dir;this.store=new CreationStore(dir);this.fetcher=fetcher;}
  client(config){return new ComfyClient(config.url,this.fetcher);}
  async environment({action='inspect',url,models,python,targetedInterrupt}={}){
    return this.store.lock(async()=>{
      const config=await this.store.config();
      if(action==='configure'){
        if(url){this.client({url});config.url=url;}
        if(models)config.models={...config.models,...models};if(python!==undefined)config.python=python;
        if(targetedInterrupt!==undefined)config.targetedInterrupt=targetedInterrupt;
        await save(path.join(this.store.root,'config.json'),config);
      }
      let result;try{const info=await this.client(config).json('/object_info');result={reachable:true,...environment(info,config.models)};}catch(e){result={reachable:false,error:e.message};}
      let processing={ready:false,missing:['python','Pillow','numpy','av']};
      if(config.python)try{await run(config.python,['-c','import PIL,numpy,av;print("ok")'],10000);processing={ready:true};}catch(e){processing={ready:false,error:e.message};}
      return {config,...result,processing,workflowVersion:2};
    });
  }
  async character(p){return this.store.lock(async()=>{
    const roles=await this.store.list('characters');
    if(p.action==='list')return {characters:[...CHARACTERS.filter(c=>!c.customRole),...roles]};
    if(p.action!=='create')throw new Error('未知角色操作');
    const name=typeof p.name==='string'?p.name.trim():'';
    if(!name||name.length>40)throw new Error('角色名称需为 1–40 个字符');
    if(p.description!==undefined&&(typeof p.description!=='string'||p.description.length>1000))throw new Error('角色简介不能超过 1000 个字符');
    if([...CHARACTERS,...roles].some(c=>c.name===name))throw new Error('角色名称已存在');
    const role={id:'custom-'+randomUUID(),name,description:p.description||'',createdAt:now()};
    await this.store.write('characters',role);return {...role,runtime:await this.syncAppearances()};
  });}
  async requireCharacter(id){
    const role=(await this.store.list('characters')).find(c=>c.id===id)||CHARACTERS.find(c=>c.id===id);
    if(!role)throw new Error('未知目标角色');return role;
  }
  async project(p){return this.store.lock(async()=>{
    if(p.action==='list')return {projects:await this.store.list('projects')};
    if(p.action==='create'){
      await this.requireCharacter(p.character||'chatgpt');
      const value={id:randomUUID(),name:p.name||'新桌宠',brief:p.brief||'',character:p.character||'chatgpt',constraints:p.constraints||[],references:[],selectedBase:null,createdAt:now(),updatedAt:now()};await this.store.write('projects',value);return value;
    }
    const value=await this.store.read('projects',p.projectId);
    if(p.action==='get')return {...value,assets:await this.assets(value.id),tasks:await this.tasks(value.id)};
    if(p.action==='update'){if(p.character!==undefined)await this.requireCharacter(p.character);for(const key of ['name','brief','character','constraints'])if(p[key]!==undefined)value[key]=p[key];}
    else if(p.action==='add_reference'){
      if(Boolean(p.path)===Boolean(p.base64))throw new Error('参考图须提供本机绝对路径或 base64 之一');
      if(p.path&&!path.isAbsolute(p.path))throw new Error('请使用插件所在机器的绝对路径');
      const bytes=p.path?await readFile(p.path):Buffer.from(p.base64,'base64');if(bytes.length>32*1024*1024)throw new Error('参考图超过32MB');
      const mime=imageMime(bytes);const asset=await this.store.asset(value.id,bytes,p.path?path.basename(p.path):(p.name||'reference.png'),mime,{kind:'reference',purpose:p.purpose||'identity'});value.references.push(asset.id);await this.store.write('projects',{...value,updatedAt:now()});return asset;
    }else if(p.action==='select_base'){
      const asset=await this.asset(value.id,p.assetId);if(!asset.mimeType.startsWith('image/'))throw new Error('基础图必须是图像');value.selectedBase=asset.id;
    }else throw new Error('未知项目操作');
    value.updatedAt=now();await this.store.write('projects',value);return value;
  });}
  async assets(id){return (await this.store.list('assets')).filter(a=>a.projectId===id);}
  async tasks(id){const project=await this.store.read('projects',id);return (await this.store.list('tasks')).filter(t=>t.projectId===id).map(t=>({...t,stale:Boolean(t.baseId&&t.baseId!==project.selectedBase)}));}
  async asset(projectId,id){const a=await this.store.read('assets',id);if(a.projectId!==projectId)throw new Error('资源不属于该项目');return a;}
  async generation_settings({action='inspect',kind,values,priorities,serviceId}={}){
    if(!['inspect','configure','save-video','remove-video'].includes(action))throw new Error('未知生成设置操作');if(action==='configure'&&(!kind||!values)&&!priorities)throw new Error('请提供服务配置或优先级');
    const settings=new GenerationAPISettings(this.dir);
    if(action==='configure'){if(kind&&values)await settings.configure(kind,values);if(priorities)await settings.setPriorities(priorities);}
    let savedVideoId;if(action==='save-video')savedVideoId=(await settings.saveVideo(serviceId,values)).savedVideoId;
    if(action==='remove-video')await settings.removeVideo(serviceId);
    return {apis:await settings.get(),priorities:await settings.priorities(),...(savedVideoId?{savedVideoId}:{}),comfyui:await new ComfySettings(this.dir).get(),selection:'宿主具备 ImageGen 时生图传 hostTools:["imagegen"]，被选中返回 requires_host_tool 供助手调用宿主工具并导入。auto 按已启用顺序选择已配置服务；仅在提交前跳过不可用服务，提交失败或结果不明不会自动重提或切换。'};
  }
  async generationProvider(kind,provider='auto',hostTools=[]){
    const available=kind==='video'?[...(await new GenerationAPISettings(this.dir).read()).videoApis.map(v=>v.id),'seedance','minimax','comfyui']:providerIds[kind];
    if(!available?.includes(provider)&&provider!=='auto')throw new Error('该生成类型不支持此服务');
    const settings=new GenerationAPISettings(this.dir),rows=(await settings.priorities())[kind],candidates=provider==='auto'?rows.filter(r=>r.enabled).map(r=>r.id):[provider],reasons=[];
    for(const id of candidates){
      if(id==='imagegen'){if(provider==='imagegen'||hostTools.includes('imagegen'))return {id};reasons.push('当前宿主未提供 Codex ImageGen');continue;}
      if(id!=='comfyui'){try{const config=await new RemoteGeneration(this).configuration(id,kind);return {id,config};}catch(error){reasons.push(error.message);if(provider!=='auto')throw error;}}
      else{try{const config=await this.store.config(),profile=kind==='image'?'qwen':'h3',info=await this.client(config).json('/object_info'),env=environment(info,config.models);if(!env.profiles[profile].ready)throw new Error('ComfyUI 模型或节点不齐全：'+JSON.stringify(env.profiles[profile]));return {id,info};}catch(error){reasons.push(error.message);if(provider!=='auto')throw error;}}
    }
    throw new Error('没有可用的生成服务：'+(reasons.join('；')||'全部服务已禁用'));
  }
  async generate(kind,p){return this.store.lock(async()=>{
    const route=await this.generationProvider(kind,p.provider,p.hostTools);
    if(route.id==='imagegen'){
      const project=await this.store.read('projects',p.projectId),references=[];
      for(const id of p.referenceIds||[]){const asset=await this.asset(project.id,id);if(!asset.mimeType.startsWith('image/'))throw new Error('参考输入必须是图像');if(digest(await readFile(this.store.assetPath(id)))!==asset.sha256)throw new Error('输入资源被改动');references.push({id,path:this.store.assetPath(id),mimeType:asset.mimeType});}
      return {provider:'imagegen',status:'requires_host_tool',projectId:project.id,hostTool:'imagegen',requestedSize:{...(p.apiSize!==undefined?{apiSize:p.apiSize}:{}),...(p.size!==undefined?{size:p.size}:{}),...(p.width!==undefined?{width:p.width}:{}),...(p.height!==undefined?{height:p.height}:{})},prompt:p.prompt,negativePrompt:p.negativePrompt||'',brief:project.brief,constraints:project.constraints,references,instructions:'使用当前 Codex 会话的 ImageGen 工具，根据 prompt、negativePrompt、项目 brief/constraints、requestedSize 和参考图片生成。先查看参考图。生成完成后调用 board_pet_project action:add_reference，传 projectId、生成文件的绝对 path（无本地路径时传 base64）、purpose:base；审阅后用 select_base 选定。此返回仅表示交接，尚未提交生成或创建后台任务；若宿主无 ImageGen 工具，报告不可用。'};
    }
    if(route.id!=='comfyui')return new RemoteGeneration(this).submit(kind,p,route.id);
    if(p.durationSeconds!==undefined||p.resolution!==undefined||p.apiSize!==undefined)throw new Error('API 专用参数不能用于 ComfyUI，请明确选择 API 服务或移除这些参数');
    const project=await this.store.read('projects',p.projectId),config=await this.store.config(),client=this.client(config);
    const profile=kind==='image'?'qwen':'h3',info=route.info,env=environment(info,config.models);
    if(!env.profiles[profile].ready)throw new Error('请先配置对应模型并补齐节点：'+JSON.stringify(env.profiles[profile]));
    const job={id:randomUUID(),projectId:project.id,kind,workflowVersion:kind==='image'?2:1,projectSnapshot:{brief:project.brief,constraints:project.constraints},config:{url:config.url,models:config.models,targetedInterrupt:config.targetedInterrupt===true},parameters:p,status:'submitting',createdAt:now(),outputs:[]};
    if(kind==='image'){
      if((p.width===undefined)!==(p.height===undefined))throw new Error('width 和 height 必须一起指定');
      if(p.cache&&!env.optional.qwenCache)throw new Error('启用缓存需要 QwenImage21Cache 节点');
      for(const [key,value] of [['sampler_name',p.sampler??'euler'],['scheduler',p.scheduler??'simple']]){
        const options=info.KSampler?.input?.required?.[key]?.[0];if(Array.isArray(options)&&!options.includes(value))throw new Error('ComfyUI 不支持 '+key+': '+value);
      }
      job.warnings=[];if(p.cfg===1&&p.negativePrompt)job.warnings.push('CFG=1 时负向提示词不起作用；本次保留输入记录，不自动修改 CFG。');
    }
    const refs=kind==='image'?(p.referenceIds||[]):[p.baseId||project.selectedBase];
    if(kind==='video'&&!refs[0])throw new Error('请先选定基础图');
    const source=await Promise.all(refs.map(id=>this.asset(project.id,id)));for(const a of source)if(!a.mimeType.startsWith('image/'))throw new Error('参考输入必须是图像');
    job.inputs=source.map(a=>({id:a.id,sha256:a.sha256}));if(kind==='video')job.baseId=refs[0];
    const uploaded=[];for(const a of source){const bytes=await readFile(this.store.assetPath(a.id));if(digest(bytes)!==a.sha256)throw new Error('输入资源被改动');uploaded.push(await client.upload(bytes,job.id+'-'+a.id+(a.mimeType==='image/png'?'.png':'.jpg'),a.mimeType));}
    const graph=kind==='image'?qwenWorkflow(p,config.models,uploaded,'board_pet/'+job.id):h3Workflow(p,config.models,uploaded[0],'board_pet/'+job.id);
    job.graph=graph;job.workflowHash=digest(JSON.stringify(graph));await this.store.write('tasks',job);
    try{
      const result=await client.json('/prompt',{method:'POST',body:{prompt:graph,client_id:job.id,extra_data:{board_pet:{jobId:job.id,projectId:project.id}}},timeout:60000});
      if(!result.prompt_id)throw new Error('服务未返回 prompt_id');job.promptId=result.prompt_id;job.status='queued';
    }catch(e){job.status=/ComfyUI 4\d\d:/.test(e.message)?'failed':'submission_unknown';job.error=e.message;}
    await this.store.write('tasks',job);return job;
  });}
  async task({action='get',projectId,taskId}){return this.store.lock(async()=>{
    await this.store.read('projects',projectId);
    if(action==='list')return {tasks:await this.tasks(projectId)};
    const job=await this.store.read('tasks',taskId);if(job.projectId!==projectId)throw new Error('任务不属于该项目');
    if(ACTIVE.includes(job.status)){
      if(job.kind==='process')await this.refreshProcess(job,action==='cancel');
      else if(job.provider&&job.provider!=='comfyui'){try{await new RemoteGeneration(this).refresh(job,action==='cancel');}catch(error){job.error=error.message;}}
      else await this.refreshGeneration(job,action==='cancel');
      job.updatedAt=now();await this.store.write('tasks',job);
    }
    const project=await this.store.read('projects',projectId);return {...job,stale:Boolean(job.baseId&&job.baseId!==project.selectedBase)};
  });}
  async refreshGeneration(job,cancel){
    const client=this.client(job.config);
    // Ambiguous submission is recovered by the unique persisted client ID; never resubmit it blindly.
    let queue=await client.json('/queue');
    if(!job.promptId){
      const all=[...(queue.queue_running||[]),...(queue.queue_pending||[])];let match=all.find(q=>q[3]?.board_pet?.jobId===job.id||q[3]?.client_id===job.id);
      if(match)job.promptId=match[1];
      else{const history=await client.json('/history?max_items=200');const hit=Object.entries(history).find(([,v])=>v.prompt?.[3]?.board_pet?.jobId===job.id||v.prompt?.[3]?.client_id===job.id);if(hit)job.promptId=hit[0];}
      if(!job.promptId){job.status='submission_unknown';job.error='提交结果不明；没有重新提交。请核对 ComfyUI 队列或历史。';return;}
    }
    const history=await client.json('/history/'+encodeURIComponent(job.promptId)),entry=history[job.promptId];
    if(entry?.status?.status_str==='error'){job.error=JSON.stringify(entry.status.messages).slice(0,6000);job.status=job.cancelRequestedAt&&/execution_interrupted/.test(job.error)?'cancelled':'failed';return;}
    if(entry?.status?.completed){
      job.status='finalizing';
      const descriptors=Object.values(entry.outputs||{}).flatMap(o=>[...(o.images||[]),...(o.videos||[]),...(o.gifs||[])]).filter(o=>o.filename&&o.type!=='temp'&&/\.(png|jpe?g|webp|mp4|webm|gif)$/i.test(o.filename));
      const unique=[...new Map(descriptors.map(o=>[JSON.stringify(o),o])).values()];
      for(const output of unique){if(job.outputs.some(o=>o.source===JSON.stringify(output)))continue;const bytes=await client.download(output),ext=path.extname(output.filename).toLowerCase(),mime={'.mp4':'video/mp4','.webm':'video/webm','.gif':'image/gif','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png'}[ext];
        if(mime==='image/png'||mime==='image/jpeg')imageMime(bytes);
        const asset=await this.store.asset(job.projectId,bytes,output.filename,mime,{kind:job.kind,taskId:job.id,baseId:job.baseId,state:job.parameters.state,source:JSON.stringify(output)});job.outputs.push(asset);await this.store.write('tasks',job);
      }
      if(!job.outputs.some(o=>job.kind==='video'?o.mimeType.startsWith('video/'):o.mimeType.startsWith('image/')))throw new Error('执行完成但没有可读的目标产物');
      job.status='completed';delete job.error;return;
    }
    let running=(queue.queue_running||[]).some(q=>q[1]===job.promptId),pending=(queue.queue_pending||[]).some(q=>q[1]===job.promptId);
    if(cancel){
      if(pending){await client.json('/queue',{method:'POST',body:{delete:[job.promptId]}});queue=await client.json('/queue');running=(queue.queue_running||[]).some(q=>q[1]===job.promptId);}
      if(running){
        if(!job.config.targetedInterrupt){job.status='running';job.error='未启用支持 prompt_id 的定向中断；没有调用全局中断。请在 ComfyUI 手动停止，或确认服务支持后配置 targetedInterrupt:true。';return;}
        // Recheck immediately before the legacy global interrupt; never clear or interrupt a foreign queue.
        queue=await client.json('/queue');const active=queue.queue_running||[];
        if(active.length===1&&active[0][1]===job.promptId)await client.json('/interrupt',{method:'POST',body:{prompt_id:job.promptId}});
        else{job.status='cancelling';job.error='运行任务已变化，未调用全局中断';return;}
      }
      job.cancelRequestedAt=now();job.status='cancelling';return;
    }
    job.status=running?(job.cancelRequestedAt?'cancelling':'running'):pending?'queued':job.cancelRequestedAt?'cancelled':'missing';
    if(job.status==='missing')job.error='任务不在队列或历史中；可能已被外部删除，未自动重提';
  }
  async process(p){return this.store.lock(async()=>{
    const project=await this.store.read('projects',p.projectId),config=await this.store.config();if(!config.python)throw new Error('请配置安装了 Pillow、numpy、av 的 Python 可执行文件');
    await run(config.python,['-c','import PIL,numpy,av'],10000);
    const clips={};let baseId;
    for(const [state,rule]of Object.entries(p.clips)){
      if(![...STATES,...INTERACTION_KINDS].includes(state))throw new Error('未知动作');const candidates=[];
      if(INTERACTION_KINDS.includes(state)&&clipCandidates(rule).some(c=>c.loop===true))throw new Error('互动动作需单次播放');
      for(const candidate of clipCandidates(rule)){const asset=await this.asset(project.id,candidate.assetId);if(!asset.mimeType.startsWith('video/'))throw new Error('动作输入必须是视频');
      if(!asset.baseId||asset.baseId!==project.selectedBase)throw new Error('动作未绑定当前选定基础图，拒绝混用版本');baseId=asset.baseId;const copy={...candidate,path:this.store.assetPath(asset.id),sha256:asset.sha256};delete copy.alternatives;delete copy.selection;candidates.push(copy);}
      clips[state]=candidates[0];if(candidates.length>1){clips[state].alternatives=candidates.slice(1);clips[state].selection=rule.selection||'random';}
    }
    const id=randomUUID(),root=path.join(this.store.root,'processing',id);await mkdir(root,{recursive:true});
    const spec={...p,id,root,clips,baseId},job={id,kind:'process',projectId:project.id,baseId,parameters:p,status:'processing',createdAt:now(),root,outputs:[]};
    await save(path.join(root,'spec.json'),spec);await this.store.write('tasks',job);
    try{const child=spawn(config.python,[fileURLToPath(new URL('./processor.py',import.meta.url)),path.join(root,'spec.json')],{stdio:'ignore',windowsHide:true,detached:true});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});job.workerPid=child.pid;await this.store.write('tasks',job);child.unref();}catch(e){job.status='failed';job.error=e.message;await this.store.write('tasks',job);}
    return job;
  });}
  async refreshProcess(job,cancel){
    const marker=path.join(job.root,'result.json');const result=await json(marker,null);
    if(!result){if(cancel){await writeFile(path.join(job.root,'cancel'),'cancel');job.status='cancelling';}if(job.workerPid)try{process.kill(job.workerPid,0);}catch(e){if(e.code==='ESRCH'){job.status='failed';job.error='后处理进程已退出且没有结果，请查看 Python 环境';}}return;}
    if(result.status!=='completed'){job.status=result.status;job.error=result.error;return;}
    for(const file of result.previews||[]){if(job.outputs.some(a=>a.name===file))continue;const bytes=await readFile(path.join(job.root,file));job.outputs.push(await this.store.asset(job.projectId,bytes,file,file.endsWith('.gif')?'image/gif':'image/png',{kind:'preview',taskId:job.id,baseId:job.baseId}));await this.store.write('tasks',job);}
    job.status='completed';job.bundle=path.join(job.root,'bundle');job.validation=await validateAppearance(job.bundle);if(!job.validation.valid){job.status='failed';job.error=job.validation.errors.join('; ');}
  }
  async preview({projectId,assetId}){const asset=await this.asset(projectId,assetId);return {asset,uri:`board-pet://assets/${asset.id}`,file:this.store.assetPath(asset.id)};}
  async appearance(p){return this.store.lock(async()=>{
    if(p.action==='list')return {appearances:await this.store.list('appearances')};
    const job=await this.store.read('tasks',p.taskId);if(job.projectId!==p.projectId||job.kind!=='process'||job.status!=='completed')throw new Error('请先查询并确认后处理任务已完成');
    const report=await validateAppearance(job.bundle);if(p.action==='validate')return report;if(!report.valid)throw new Error(report.errors.join('; '));
    const project=await this.store.read('projects',p.projectId);if(job.baseId!==project.selectedBase)throw new Error('基础图已经改变，请重新处理当前版本');
    if(p.action==='import'){
      if(!report.complete)throw new Error('导入需要全部八种动作');
      const id=safeId(p.appearanceId||'custom-'+job.id),character=p.character||project.character;
      const role=await this.requireCharacter(character);
      if((role.appearances||[]).some(a=>a.id===id&&!a.custom))throw new Error('新形象不能覆盖内置形象 ID');
      if((await this.store.list('appearances')).some(a=>a.id===id))throw new Error('该形象 ID 已存在，请使用新 ID 保留原有形象');
      const root=path.join(this.dir,'appearances',id);try{await access(root);throw new Error('目标资源目录已存在');}catch(e){if(e.code!=='ENOENT')throw e;}
      await cp(job.bundle,root,{recursive:true,errorOnExist:true,force:false});
      const entry={id,character,name:p.name||project.name,asset:'custom:'+id,variants:report.variants,pixelSize:report.manifest.tileSize,doneMs:maxClipDuration(report.manifest.clips.done),root,manifest:report.manifest,projectId:project.id,taskId:job.id,createdAt:now()};await this.store.write('appearances',entry);
      const sync=await this.syncAppearances();return {imported:true,activated:false,appearance:entry,runtime:sync};
    }
    if(p.action==='activate'){
      const entry=(await this.store.list('appearances')).find(a=>a.id===p.appearanceId&&a.taskId===job.id);if(!entry)throw new Error('形象尚未导入');if(!p.petId)throw new Error('激活必须明确指定桌宠实例 ID');
      const endpoint=await readEndpoint(this.dir);if(!endpoint)throw new Error('请先启动桌宠');await this.syncAppearances();const result=await request(endpoint,'/pets/manage',{action:'update',id:p.petId,value:{character:entry.character,appearance:entry.id,variant:p.variant||entry.variants[0]}},5000);return {activated:true,result};
    }throw new Error('未知形象操作');
  });}
  async syncAppearances(){const endpoint=await readEndpoint(this.dir);if(!endpoint)return {synced:false,reason:'桌宠未运行；下次启动将加载形象'};try{return await request(endpoint,'/appearances/reload',{},5000);}catch(e){return {synced:false,error:e.message,reason:'运行中的旧版可能不支持形象动态加载，请升级后重启'};}}
}
function imageMime(bytes){if(bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a')return 'image/png';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';throw new Error('当前参考输入支持 PNG 或 JPEG');}
function run(command,args,timeout){return new Promise((resolve,reject)=>{const child=spawn(command,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>out+=b);const timer=setTimeout(()=>{child.kill();reject(new Error('Python 环境检查超时'));},timeout);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve(out):reject(new Error(out.slice(-1500)||'Python 检查失败'));});});}
