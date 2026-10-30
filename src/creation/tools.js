import {z} from 'zod';
import {ResourceTemplate} from '@modelcontextprotocol/sdk/server/mcp.js';
import {readFile} from 'node:fs/promises';
import {STATES} from './store.js';
import {INTERACTION_KINDS} from '../animation-kinds.js';

const id=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),text=z.string().max(16000),dimension=z.number().int().min(256).max(2048).multipleOf(32);
const role=id;
const priorityRows=z.array(z.object({id,enabled:z.boolean()}).strict()).min(1).max(33);
const apiValues=z.object({name:z.string().max(100).optional(),vendor:z.enum(['seedance','minimax','grok','gemini']).optional(),url:z.string().max(2048).optional(),model:z.string().max(2048).optional(),apiKey:z.string().max(8192).optional(),clearApiKey:z.boolean().optional(),protocol:z.enum(['openai-images','seedance','minimax-h3','minimax-hailuo','grok-video','gemini-interactions']).optional()}).strict();
const modelSchema=z.object(Object.fromEntries(['qwenModel','qwenClip','qwenVae','h3Model','h3Clip','h3Vae'].map(k=>[k,z.string().min(1).max(512).optional()]))).strict();
const actionRule=z.object({assetId:id,startFrame:z.number().int().min(0).max(127).default(0),loop:z.boolean().optional(),loopFrom:z.number().int().min(0).max(127).default(0),pingPong:z.boolean().default(false)}).strict();
const actionSet=actionRule.extend({alternatives:z.array(actionRule).max(7).optional(),selection:z.enum(['random','round-robin']).optional()}).strict();
export const creationSchemas={
  board_pet_generation_settings:z.object({action:z.enum(['inspect','configure','save-video','remove-video']).default('inspect'),serviceId:id.optional(),kind:z.enum(['image','seedance','minimax']).optional(),values:apiValues.optional(),priorities:z.object({image:priorityRows,video:priorityRows}).strict().optional()}).strict(),
  board_pet_character:z.object({action:z.enum(['create','list']),name:z.string().trim().min(1).max(40).optional(),description:z.string().max(1000).optional()}).strict(),
  board_pet_environment:z.object({action:z.enum(['inspect','configure']).default('inspect'),url:z.string().url().optional(),models:modelSchema.optional(),python:z.string().max(4096).optional(),targetedInterrupt:z.boolean().optional()}).strict(),
  board_pet_project:z.object({action:z.enum(['create','list','get','update','add_reference','select_base']),projectId:id.optional(),name:z.string().max(100).optional(),brief:text.optional(),character:role.optional(),constraints:z.array(z.string().max(1000)).max(50).optional(),path:z.string().max(4096).optional(),base64:z.string().max(44*1024*1024).optional(),purpose:z.enum(['identity','style','pose','base']).optional(),assetId:id.optional()}).strict(),
  board_pet_generate_image:z.object({projectId:id,provider:z.enum(['auto','api','imagegen','comfyui']).default('auto'),hostTools:z.array(z.enum(['imagegen'])).max(1).default([]),apiSize:z.string().regex(/^(auto|[0-9]{2,4}x[0-9]{2,4})$/).optional(),prompt:text.min(1),negativePrompt:text.default(''),referenceIds:z.array(id).max(10).default([]),size:z.union([z.literal(0),dimension]).optional(),width:dimension.optional(),height:dimension.optional(),sampler:z.string().min(1).max(80).default('euler'),scheduler:z.string().min(1).max(80).default('simple'),cache:z.boolean().default(false),cacheDevice:z.enum(['auto','gpu','cpu','off']).default('auto'),cacheDtype:z.enum(['default','int8','int4']).default('default'),steps:z.number().int().min(1).max(100).default(25),cfg:z.number().min(0).max(20).default(1),seed:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(42)}).strict(),
  board_pet_generate_video:z.object({projectId:id,provider:id.default('auto'),durationSeconds:z.number().int().min(1).max(30).optional(),resolution:z.enum(['480p','720p','1080p','720P','768P','1080P','2K']).optional(),baseId:id.optional(),state:z.enum([...STATES,...INTERACTION_KINDS]),prompt:text.min(1),size:dimension.max(1024).default(384),frames:z.number().int().min(22).max(362).refine(n=>(n-5)%17===0,'H3 帧数须为17k+5').default(124),steps:z.number().int().min(1).max(100).default(20),seed:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(42),returnToStart:z.boolean().default(false)}).strict(),
  board_pet_task:z.object({action:z.enum(['get','list','cancel']).default('get'),projectId:id,taskId:id.optional()}).strict(),
  board_pet_process_assets:z.object({projectId:id,clips:z.partialRecord(z.enum([...STATES,...INTERACTION_KINDS]),actionSet).refine(c=>Object.keys(c).length>0),variants:z.array(z.enum(['original','pixel'])).min(1).max(2).refine(a=>new Set(a).size===a.length).default(['original','pixel']),background:z.enum(['preserve','chroma']).default('preserve'),keyColor:z.array(z.number().int().min(0).max(255)).length(3).default([0,170,0]),threshold:z.number().min(0).max(200).default(30),feather:z.number().min(1).max(100).default(30),despill:z.boolean().default(false),spillTolerance:z.number().min(0).max(255).default(20),fps:z.number().min(1).max(30).default(12),originalSize:z.number().int().min(64).max(512).default(384),pixelSize:z.number().int().min(32).max(256).default(192),padding:z.number().int().min(0).max(30).default(12),colors:z.number().int().min(8).max(256).default(64),alphaThreshold:z.number().int().min(1).max(255).default(128)}).strict(),
  board_pet_preview:z.object({projectId:id,assetId:id}).strict(),
  board_pet_appearance:z.object({action:z.enum(['list','validate','import','activate']),projectId:id.optional(),taskId:id.optional(),appearanceId:id.optional(),name:z.string().min(1).max(100).optional(),character:role.optional(),petId:id.optional(),variant:z.enum(['original','pixel']).optional()}).strict(),
};
const descriptions={
  board_pet_generation_settings:'读取或配置生成服务和优先级。inspect 返回 apis.videoApis 配置列表（含 id/name/vendor/protocol/hasApiKey）和优先级，不返回密钥。save-video 通过 values 添加配置，带 serviceId 时编辑；厂家为 seedance/minimax/grok/gemini，保存完整配置后自动加入优先级。remove-video 通过 serviceId 删除未被进行中任务使用的配置。configure 保留 image 和旧版 seedance/minimax 配置入口，也可更新完整优先级；不提交生成。',
  board_pet_character:'新建独立角色或列出角色。create 需要 name，可填写 description；返回 character ID 供创作项目和形象导入使用。导入完整形象后才能应用到桌宠。',
  board_pet_environment:'检查或配置本机 ComfyUI 地址、Qwen-Image 2.1/H3 模型文件名和后处理 Python。inspect 不生成素材；仅保存明确指定的模型绑定，返回可用文件和缺项。',
  board_pet_project:'创建、读取、更新桌宠创作项目，导入 PNG/JPEG 参考图或选定基础图。path 是插件所在机器的绝对路径；也可传 base64。保留多个候选及其哈希，选择新基础图会让旧动作标记 stale。',
  board_pet_generate_image:'按应用设置的生图优先级使用 API、Codex ImageGen 或 ComfyUI 生成/编辑基础图。provider 可显式指定 api/imagegen/comfyui；默认 auto。仅在当前宿主实际提供 ImageGen 时传 hostTools:["imagegen"]。选中 ImageGen 时返回 requires_host_tool 交接请求而非任务，须调用宿主 ImageGen 并将结果用 board_pet_project add_reference 导入、审阅后 select_base；不可轮询交接请求。其他服务API 使用 apiSize，ComfyUI 使用以下采样参数。referenceIds 为空时文生图；有图时参考图生成/编辑。返回异步任务 ID，使用 board_pet_task 查询；不会自动选择基础图或启动视频。按工作流 v2：编辑默认 size=0 保留参考图尺寸、画幅跟随首图；文生图默认 1024 方图。可同时指定 width/height，自定义 sampler/scheduler，按需启用 cache。提示词用 <image1> 等引用按序参考图。CFG=1 时负向提示词不起作用。不会自动生成透明通道或启用 PE。',
  board_pet_generate_video:'使用选定基础图，按视频优先级通过 Seedance、MiniMax、Grok、Gemini API 或 ComfyUI 生成单个动作。provider 默认 auto，可指定 inspect 返回的 videoApis[].id 或 comfyui；旧 seedance/minimax ID 继续可用。API 使用 durationSeconds/resolution；Gemini 时长通过提示词请求，以实际输出为准，画幅使用模型支持的默认比例。ComfyUI 使用 size/frames/steps。返回任务并保存输入哈希。returnToStart 按协议支持情况使用。',
  board_pet_task:'查询、列出或取消本项目所属任务。get 查询原 API 任务或 ComfyUI 历史并下载真实产物，可跨 MCP 重启继续查询。list 为持久记录快照。cancel 只处理所属任务；Seedance/MiniMax H3 使用任务取消接口，Hailuo 当前需在服务商后台处理。ComfyUI 运行中任务需 targetedInterrupt:true，否则说明需手动停止；后处理协作取消。',
  board_pet_process_assets:'从同一当前基础图版本的动作视频异步导出原图/像素图集、共享色板、GIF 预览及 manifest。支持可配置色键/保留 alpha、采样、尺寸、循环起点和 ping-pong。每个状态可用 alternatives 添加最多7套候选，selection 为 random 或 round-robin；候选的 loop 必须一致。传部分动作可试片，导入需要八种动作齐全。loopFrom 是采样后播放序列下标。结构验证不能代替视觉审阅。',
  board_pet_preview:'获取项目资源预览。小型 PNG/JPEG 直接返回图像，同时返回 MCP 资源链接；视频/GIF 通过资源读取。生成结果路径在插件所在机器，远程 AI 使用资源 URI。',
  board_pet_appearance:'列出、验证、导入或激活自定义桌宠形象。导入创建原角色下的新形象并保留其他形象；不自动切换实例。激活必须明确给出已导入 appearanceId 和 petId。',
};
const publicValue=value=>{if(!value||typeof value!=='object')return value;if(Array.isArray(value))return value.map(publicValue);return Object.fromEntries(Object.entries(value).filter(([k])=>!['graph','apiKey'].includes(k)).map(([k,v])=>[k,publicValue(v)]));};
export function registerCreationTools(server,service){
  for(const [name,schema] of Object.entries(creationSchemas)){
    server.registerTool(name,{description:descriptions[name],inputSchema:schema,annotations:{readOnlyHint:name==='board_pet_preview',destructiveHint:false,openWorldHint:name.includes('generate')||name==='board_pet_environment'||name==='board_pet_task'}},async raw=>{
      try{
        const args=schema.parse(raw);let value;
        if(name==='board_pet_project'&&!['create','list'].includes(args.action)&&!args.projectId)throw new Error('此操作需要 projectId');
        if(name==='board_pet_project'&&args.action==='select_base'&&!args.assetId)throw new Error('请选择 assetId');
        if(name==='board_pet_task'&&args.action!=='list'&&!args.taskId)throw new Error('此操作需要 taskId');
        if(name==='board_pet_appearance'&&args.action!=='list'&&(!args.projectId||!args.taskId))throw new Error('此操作需要 projectId 和 taskId');
        if(name==='board_pet_generate_image')value=await service.generate('image',args);
        else if(name==='board_pet_generate_video')value=await service.generate('video',args);
        else if(name==='board_pet_process_assets')value=await service.process(args);
        else if(name==='board_pet_preview'){
          value=await service.preview(args);const bytes=await readFile(value.file),content=[{type:'resource_link',uri:value.uri,name:value.asset.name,mimeType:value.asset.mimeType}];
          if(['image/png','image/jpeg'].includes(value.asset.mimeType)&&bytes.length<=8*1024*1024)content.unshift({type:'image',data:bytes.toString('base64'),mimeType:value.asset.mimeType});
          return {content,structuredContent:{asset:value.asset,uri:value.uri}};
        }else value=await service[name.replace('board_pet_','')](args);
        value=publicValue(value);return {content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
      }catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}
    });
  }
  server.registerResource('桌宠创作指南','board-pet://creation/guide',{mimeType:'text/markdown'},async uri=>({contents:[{uri:uri.href,mimeType:'text/markdown',text:await readFile(new URL('../../skills/board-pet-creator/SKILL.md',import.meta.url),'utf8')}]}));
  server.registerResource('桌宠创作工具说明','board-pet://creation/tools',{mimeType:'text/markdown'},async uri=>({contents:[{uri:uri.href,mimeType:'text/markdown',text:await readFile(new URL('../../skills/board-pet-creator/references/tools.md',import.meta.url),'utf8')}]}));
  for(const name of ['capabilities','creation','project-record','assets','generation-services'])server.registerResource('桌宠创作参考 '+name,'board-pet://creation/references/'+name,{mimeType:'text/markdown'},async uri=>({contents:[{uri:uri.href,mimeType:'text/markdown',text:await readFile(new URL('../../skills/board-pet-creator/references/'+name+'.md',import.meta.url),'utf8')}]}));
  server.registerResource('桌宠创作产物',new ResourceTemplate('board-pet://assets/{assetId}',{list:undefined}),{mimeType:'application/octet-stream'},async(uri,{assetId})=>{
    const asset=await service.store.read('assets',assetId);return {contents:[{uri:uri.href,mimeType:asset.mimeType,blob:(await readFile(service.store.assetPath(asset.id))).toString('base64')}]};
  });
}
