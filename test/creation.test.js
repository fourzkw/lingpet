import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {CreationService} from '../src/creation/service.js';
import {creationSchemas} from '../src/creation/tools.js';
import {CreationStore,STATES,save} from '../src/creation/store.js';
import {validateAppearance} from '../src/creation/validation.js';
import {loadCustomAppearances,appearanceSheet} from '../src/creation/catalog.js';
import {setCustomAppearances,appearanceInfo} from '../src/characters.js';
import {PetRegistry,migratePetConfig} from '../src/pet-registry.js';
import {createSidebarServer} from '../src/sidebar-server.js';
import {startLocalServer} from '../src/local-server.js';
import {StateStore} from '../src/state-store.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
const models={qwenModel:'qwen.safetensors',qwenClip:'qwen-clip.safetensors',qwenVae:'qwen-vae.safetensors',h3Model:'h3.safetensors',h3Clip:'h3-clip.safetensors',h3Vae:'h3-vae.safetensors'};
const parse=(name,args)=>creationSchemas['board_pet_'+name].parse(args);
function fakeComfy(){
  const state={pending:[],running:[],history:{},requests:[],counter:0,ambiguous:false};
  const info=Object.fromEntries(['UNETLoader','CLIPLoader','VAELoader','TextEncodeQwenImage21','KSampler','VAEDecode','SaveImage','LoadImage','InvertMask','JoinImageWithAlpha','EmptyLatentImage','MiniMaxH3ImageToVideo','BasicGuider','RandomNoise','KSamplerSelect','BasicScheduler','SamplerCustomAdvanced','VAEDecodeTiled','CreateVideo','SaveVideo','ImageScale'].map(k=>[k,{}]));
  info.UNETLoader={input:{required:{unet_name:[[models.qwenModel,models.h3Model]]}}};info.CLIPLoader={input:{required:{clip_name:[[models.qwenClip,models.h3Clip]]}}};info.VAELoader={input:{required:{vae_name:[[models.qwenVae,models.h3Vae]]}}};
  state.info=info;
  const fetcher=async(url,options={})=>{
    const route=new URL(url).pathname,body=typeof options.body==='string'?JSON.parse(options.body):options.body;state.requests.push({route,body,method:options.method});
    const reply=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
    if(route==='/object_info')return reply(info);
    if(route==='/upload/image')return reply({name:'uploaded.png',subfolder:'board-pet'});
    if(route==='/prompt'){const id='prompt-'+(++state.counter);state.pending.push([0,id,body.prompt,{...body.extra_data,client_id:body.client_id}]);if(state.ambiguous){state.ambiguous=false;throw new Error('connection closed after submission');}return reply({prompt_id:id});}
    if(route==='/queue'){if(options.method==='POST'){state.pending=state.pending.filter(q=>!body.delete.includes(q[1]));return reply({});}return reply({queue_running:state.running,queue_pending:state.pending});}
    if(route==='/interrupt'){assert.ok(body.prompt_id);return reply({});}
    if(route==='/history')return reply(state.history);
    if(route.startsWith('/history/')){const id=decodeURIComponent(route.slice(9));return reply(state.history[id]?{[id]:state.history[id]}:{});}
    if(route==='/view')return new Response(png,{headers:{'Content-Type':'image/png'}});
    throw new Error('Unexpected request '+route);
  };return {state,fetcher};
}
async function setup(t){const dir=await mkdtemp(path.join(process.cwd(),'.test-data-creation-'));t.after(async()=>{assert.equal(path.dirname(dir),process.cwd());assert.ok(path.basename(dir).startsWith('.test-data-creation-'));await rm(dir,{recursive:true,force:true});});const fake=fakeComfy(),service=new CreationService(dir,{fetcher:fake.fetcher});return {dir,service,...fake};}

test('MCP exposes creation tools, validates inputs and serves project image bytes',async t=>{
  const {service}=await setup(t),server=createSidebarServer({run:async()=>({running:false})},service),client=new Client({name:'creation-test',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);t.after(async()=>{await client.close();await server.close();});
  const listed=(await client.listTools()).tools;for(const name of Object.keys(creationSchemas))assert.ok(listed.find(tool=>tool.name===name));
  const call=async(name,args)=>client.callTool({name:'board_pet_'+name,arguments:args});
  const project=(await call('project',{action:'create',name:'新形象',constraints:['自然站姿']})).structuredContent;
  const asset=(await call('project',{action:'add_reference',projectId:project.id,base64:png.toString('base64'),purpose:'identity'})).structuredContent;
  const preview=await call('preview',{projectId:project.id,assetId:asset.id});assert.equal(preview.content[0].type,'image');assert.equal(preview.content[0].data,png.toString('base64'));
  const resource=await client.readResource({uri:preview.structuredContent.uri});assert.equal(resource.contents[0].blob,png.toString('base64'));
  assert.match((await client.readResource({uri:'board-pet://creation/tools'})).contents[0].text,/qwenClip/);
  assert.equal((await call('task',{projectId:project.id,action:'get'})).isError,true);
  assert.equal((await call('generate_video',{projectId:project.id,state:'sleep',prompt:'sleep',frames:125})).isError,true);
  assert.equal((await call('project',{action:'get',projectId:'../escape'})).isError,true);
});

test('Qwen creation is asynchronous, retains alpha refs, survives reconnect and recovers ambiguous submissions without duplicates',async t=>{
  const {dir,service,state,fetcher}=await setup(t);assert.equal((await service.environment()).profiles.qwen.ready,false);
  assert.equal((await service.environment({action:'configure',models})).profiles.qwen.ready,true);
  const project=await service.project({action:'create',name:'A'}),ref=await service.project({action:'add_reference',projectId:project.id,base64:png.toString('base64')});
  state.ambiguous=true;
  const args=parse('generate_image',{projectId:project.id,prompt:'chibi full body',referenceIds:[ref.id]}),job=await service.generate('image',args);
  assert.equal(job.status,'submission_unknown');assert.equal(state.counter,1);
  const posted=state.requests.find(r=>r.route==='/prompt').body;assert.equal(posted.prompt['4'].inputs['images.image_1'][0],'22');assert.equal(posted.prompt['4'].inputs.image_1,undefined);assert.equal(posted.prompt['22'].class_type,'JoinImageWithAlpha');assert.equal(posted.prompt['1'].inputs.unet_name,models.qwenModel);
  const reconnected=new CreationService(dir,{fetcher});let refreshed=await reconnected.task({projectId:project.id,taskId:job.id});assert.equal(refreshed.status,'queued');assert.equal(refreshed.promptId,'prompt-1');assert.equal(state.counter,1);
  state.history['prompt-1']={status:{completed:true,status_str:'success'},outputs:{'7':{images:[{filename:'candidate.png',type:'output',subfolder:'board_pet'}]}}};state.pending=[];
  refreshed=await reconnected.task({projectId:project.id,taskId:job.id});assert.equal(refreshed.status,'completed');assert.equal(refreshed.outputs.length,1);assert.deepEqual(await readFile(service.store.assetPath(refreshed.outputs[0].id)),png);
  await reconnected.task({projectId:project.id,taskId:job.id});assert.equal((await service.assets(project.id)).length,2);
  assert.equal((await service.project({action:'get',projectId:project.id})).selectedBase,null);
});

test('task cancellation protects foreign jobs; new base versions stale old clips and cannot be mixed',async t=>{
  const {service,state}=await setup(t);await service.environment({action:'configure',models,targetedInterrupt:true});const project=await service.project({action:'create'}),other=await service.project({action:'create'});
  const first=await service.project({action:'add_reference',projectId:project.id,base64:png.toString('base64')});await service.project({action:'select_base',projectId:project.id,assetId:first.id});
  const job=await service.generate('video',parse('generate_video',{projectId:project.id,state:'idle',prompt:'breathing'}));assert.equal(job.baseId,first.id);assert.equal(job.graph['9'].inputs.last_frame,undefined);
  await assert.rejects(service.task({projectId:other.id,taskId:job.id,action:'cancel'}),/不属于/);
  state.pending.push([1,'foreign',{},{}]);await service.task({projectId:project.id,taskId:job.id,action:'cancel'});assert.deepEqual(state.pending.map(q=>q[1]),['foreign']);assert.ok(!state.requests.some(r=>r.route==='/interrupt'));
  const active=await service.generate('video',parse('generate_video',{projectId:project.id,state:'sleep',prompt:'sleep'}));state.pending=state.pending.filter(q=>q[1]!==active.promptId);state.running=[[0,active.promptId,{},{}]];
  assert.equal((await service.task({projectId:project.id,taskId:active.id,action:'cancel'})).status,'cancelling');assert.equal(state.requests.find(r=>r.route==='/interrupt').body.prompt_id,active.promptId);
  const second=await service.project({action:'add_reference',projectId:project.id,base64:png.toString('base64')});await service.project({action:'select_base',projectId:project.id,assetId:second.id});assert.equal((await service.task({projectId:project.id,taskId:active.id})).stale,true);
  await assert.rejects(service.asset(project.id,(await service.store.asset(other.id,png,'other.png','image/png')).id),/不属于/);
});

test('older ComfyUI without opted-in targeted interruption never receives global interrupt',async t=>{
  const {service,state}=await setup(t);await service.environment({action:'configure',models});const project=await service.project({action:'create'}),job=await service.generate('image',parse('generate_image',{projectId:project.id,prompt:'test'}));state.pending=[];state.running=[[0,job.promptId,{},{}]];
  const result=await service.task({projectId:project.id,taskId:job.id,action:'cancel'});assert.equal(result.status,'running');assert.match(result.error,/定向中断/);assert.ok(!state.requests.some(r=>r.route==='/interrupt'));
});

test('synthetic video -> both atlases -> import -> activate preserves existing pets and follow settings',{skip:!process.env.BOARD_PET_TEST_PYTHON},async t=>{
  const {dir,service}=await setup(t),python=process.env.BOARD_PET_TEST_PYTHON;
  const video=path.join(dir,'fixture.mp4');await promisify(execFile)(python,['-c',`import av,sys,numpy as np\nc=av.open(sys.argv[1],'w');s=c.add_stream('libx264',rate=12);s.width=s.height=64;s.pix_fmt='yuv420p'\nfor i in range(12):\n a=np.zeros((64,64,3),dtype=np.uint8);a[:]=[0,170,0];a[12:52,20+i%3:44+i%3]=[180,100,220]\n for p in s.encode(av.VideoFrame.from_ndarray(a,format='rgb24')):c.mux(p)\nfor p in s.encode():c.mux(p)\nc.close()`,video],{windowsHide:true});
  await service.environment({action:'configure',python});const project=await service.project({action:'create',character:'chatgpt',name:'合成测试形象'}),base=await service.project({action:'add_reference',projectId:project.id,base64:png.toString('base64')});await service.project({action:'select_base',projectId:project.id,assetId:base.id});
  const clips={};for(const state of [...STATES,'click','pet']){const asset=await service.store.asset(project.id,await readFile(video),state+'.mp4','video/mp4',{kind:'video',baseId:base.id,state});clips[state]={assetId:asset.id,loop:!['done','error','click','pet'].includes(state),loopFrom:0,pingPong:state==='sleep'};}
  clips.idle.alternatives=[{...clips.idle}];clips.idle.selection='round-robin';
    const job=await service.process(parse('process_assets',{projectId:project.id,clips,background:'chroma',originalSize:128,pixelSize:64,padding:4,fps:6,colors:16}));let result;
  for(let i=0;i<300;i++){result=await service.task({projectId:project.id,taskId:job.id});if(!['processing','finalizing'].includes(result.status))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(result.status,'completed',result.error);assert.equal(result.validation.valid,true);assert.equal(result.validation.complete,true);assert.equal(result.outputs.length,11);assert.equal(result.validation.manifest.clips.pet.loop,false);assert.equal(result.validation.manifest.clips.click.loop,false);assert.equal(result.validation.manifest.clips.idle.alternatives.length,1);assert.equal(result.validation.manifest.clips.idle.selection,'round-robin');assert.deepEqual(result.validation.variants,['original','pixel']);
  if(process.env.BOARD_PET_CREATION_FIXTURE_OUT){const out=path.resolve(process.env.BOARD_PET_CREATION_FIXTURE_OUT);assert.ok(out.startsWith(path.join(process.cwd(),'artifacts')+path.sep));await mkdir(out,{recursive:true});await cp(result.bundle,path.join(out,'bundle'),{recursive:true});}
  const before=JSON.stringify({pets:[{name:'old GPT',follow:{mode:'source',source:'codex'}}]});await writeFile(path.join(dir,'settings.json'),before);
  let imported=await service.appearance({action:'import',projectId:project.id,taskId:job.id,appearanceId:'fixture',name:'测试形象'});assert.equal(imported.imported,true);assert.equal(imported.activated,false);assert.equal(await readFile(path.join(dir,'settings.json'),'utf8'),before);
  const entries=await loadCustomAppearances(dir);assert.equal(entries.length,1);assert.match(await appearanceSheet(entries,{appearanceId:'fixture',state:'idle',variant:'original'}),/^data:image\/png;base64,/);
  setCustomAppearances(entries);t.after(()=>setCustomAppearances([]));const registry=new PetRegistry({}),first=registry.create({character:'chatgpt',follow:{mode:'source',source:'codex'}}),second=registry.duplicate(first.id),snapshot=structuredClone(second);
  const runtime=await startLocalServer(new StateStore(),dir,{reloadAppearances:async()=>({synced:true}),petManager:{list:()=>({pets:registry.pets}),manage:({id,value})=>{registry.update(id,value);return {ok:true};}}});t.after(()=>runtime.close());
  const activated=await service.appearance({action:'activate',projectId:project.id,taskId:job.id,appearanceId:'fixture',petId:first.id,variant:'original'});assert.equal(activated.activated,true);assert.equal(first.appearance,'fixture');assert.equal(first.variant,'original');assert.deepEqual(first.follow,{mode:'source',source:'codex'});assert.deepEqual(second,snapshot);assert.equal(appearanceInfo(first).asset,'custom:fixture');
  const updated=await service.appearance({action:'import',projectId:project.id,taskId:job.id,appearanceId:'fixture'});assert.equal(updated.updated,true);assert.equal((await service.appearance({action:'list'})).appearances.length,1);
  const manifestPath=path.join(result.bundle,'manifest.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));manifest.clips.idle.file='../spec.json';await save(manifestPath,manifest);assert.equal((await validateAppearance(result.bundle)).valid,false);
});


test('Qwen v2 rejects unsupported options before queueing and reports ineffective negative prompts',async t=>{
 const {service,state}=await setup(t);await service.environment({action:'configure',models});const project=await service.project({action:'create'});
 await assert.rejects(service.generate('image',parse('generate_image',{projectId:project.id,prompt:'portrait',width:512})),/一起指定/);
 await assert.rejects(service.generate('image',parse('generate_image',{projectId:project.id,prompt:'portrait',cache:true})),/QwenImage21Cache/);
 state.info.KSampler={input:{required:{sampler_name:[['euler']],scheduler:[['simple']]}}};
 await assert.rejects(service.generate('image',parse('generate_image',{projectId:project.id,prompt:'portrait',sampler:'unknown'})),/不支持/);
 assert.equal(state.counter,0);
 const job=await service.generate('image',parse('generate_image',{projectId:project.id,prompt:'portrait',negativePrompt:'text'}));assert.equal(job.workflowVersion,2);assert.match(job.warnings[0],/CFG=1/);assert.deepEqual(job.graph['5'].inputs.latent_image,['8',0]);
});


test('custom roles persist, validate names and accept projects after service restart',async t=>{
  const {dir,service}=await setup(t);
  await assert.rejects(service.character({action:'create',name:'  '}),/名称/);
  await assert.rejects(service.character({action:'create',name:'Claude'}),/已存在/);
  const role=await service.character({action:'create',name:'  小狐狸  ',description:'森林伙伴'});
  assert.equal(role.name,'小狐狸');assert.match(role.id,/^custom-/);
  await assert.rejects(service.character({action:'create',name:'小狐狸'}),/已存在/);
  const restarted=new CreationService(dir),roles=(await restarted.character({action:'list'})).characters;
  assert.equal(roles.find(r=>r.id===role.id).description,'森林伙伴');
  const project=await restarted.project(parse('project',{action:'create',character:role.id,name:'狐狸形象'}));
  assert.equal(project.character,role.id);
  await assert.rejects(restarted.project({action:'update',projectId:project.id,character:'unknown'}),/未知/);
  setCustomAppearances([],roles.filter(r=>r.id===role.id));t.after(()=>setCustomAppearances([]));
  const registry=new PetRegistry({});
  assert.throws(()=>registry.create({character:role.id}),/导入完整形象/);
  const appearance={id:'fox-skin',character:role.id,name:'狐狸',variants:['pixel'],pixelSize:128};
  setCustomAppearances([appearance],[role]);
  const pet=registry.create({character:role.id});assert.equal(pet.appearance,'fox-skin');
  assert.equal(migratePetConfig(registry.config).pets.at(-1).character,role.id);
});


test('new role imports complete artwork and reloads from disk without runtime registration',async t=>{
  const {dir,service}=await setup(t),role=await service.character({action:'create',name:'独立角色'});
  const project=await service.project({action:'create',character:role.id});
  const bundle=path.join(dir,'bundle');await mkdir(bundle);
  const {PNG}=await import('pngjs'),image=new PNG({width:1,height:1});image.data.fill(255);
  await writeFile(path.join(bundle,'sheet.png'),PNG.sync.write(image));
  const manifest={columns:1,tileSize:1,variants:['pixel'],clips:Object.fromEntries(STATES.map(state=>[state,{file:'sheet.png',sourceFrames:1,frames:[0],durations:[100],loop:true}]))};
  await writeFile(path.join(bundle,'manifest.json'),JSON.stringify(manifest));
  await service.store.write('tasks',{id:'role-import',projectId:project.id,kind:'process',status:'completed',baseId:null,bundle});
  const result=await service.appearance({action:'import',projectId:project.id,taskId:'role-import',appearanceId:'role-art'});
  assert.equal(result.appearance.character,role.id);
  setCustomAppearances([]);t.after(()=>setCustomAppearances([]));
  const loaded=await loadCustomAppearances(dir);assert.equal(loaded.length,1);
  const roles=await new CreationStore(dir).list('characters');setCustomAppearances(loaded,roles);
  const registry=new PetRegistry({}),pet=registry.create({character:role.id});
  assert.equal(appearanceInfo(pet).asset,'custom:role-art');
  assert.equal(migratePetConfig(registry.config).pets.at(-1).character,role.id);
});



test('action edits reuse the project appearance, preserve other clips and roll back failed publication',async t=>{
 const {dir,service}=await setup(t),project=await service.project({action:'create',name:'唯一形象'});
 const {PNG}=await import('pngjs');
 async function bundle(id,states,color,duration=100){
  const root=path.join(dir,id);await mkdir(root);const image=new PNG({width:1,height:1});image.data.set(color);await writeFile(path.join(root,'sheet.png'),PNG.sync.write(image));
  const clips=Object.fromEntries(states.map(s=>[s,{file:'sheet.png',sourceFrames:1,frames:[0],durations:[duration],loop:!['click','pet','done','error'].includes(s)}]));
  await save(path.join(root,'manifest.json'),{columns:1,tileSize:1,variants:['pixel'],clips});
  await service.store.write('tasks',{id,projectId:project.id,kind:'process',status:'completed',baseId:null,bundle:root});return root;
 }
 await bundle('initial',STATES,[255,0,0,255]);
 const first=await service.appearance({action:'import',projectId:project.id,taskId:'initial'}),id=first.appearance.id;
 const partial=await bundle('edit',['working','pet'],[0,0,255,255],250);
 assert.equal((await validateAppearance(partial)).valid,true);
 const update=await service.appearance({action:'import',projectId:project.id,taskId:'edit'});
 assert.equal(update.updated,true);assert.equal(update.appearance.id,id);assert.equal(update.appearance.name,'唯一形象');
 assert.equal((await service.appearance({action:'list'})).appearances.length,1);
 assert.equal(update.appearance.manifest.clips.working.durations[0],250);assert.ok(update.appearance.manifest.clips.pet);
 const root=update.appearance.root,m=update.appearance.manifest;
 assert.deepEqual(PNG.sync.read(await readFile(path.join(root,m.clips.idle.file))).data,Buffer.from([255,0,0,255]));
 assert.deepEqual(PNG.sync.read(await readFile(path.join(root,m.clips.working.file))).data,Buffer.from([0,0,255,255]));
 assert.equal((await validateAppearance(path.join(update.backup,'bundle'))).complete,true);
 await assert.rejects(service.appearance({action:'import',projectId:project.id,taskId:'edit',appearanceId:'another-id'}),/createNew/);
 const other=await service.project({action:'create'});await service.store.write('tasks',{id:'foreign',projectId:other.id,kind:'process',status:'completed',baseId:null,bundle:partial});
 await assert.rejects(service.appearance({action:'import',projectId:other.id,taskId:'foreign',appearanceId:id}),/不属于/);
 const before=await readFile(path.join(root,'manifest.json'),'utf8'),write=service.store.write.bind(service.store);let fail=true;
 service.store.write=async(group,value)=>{if(group==='appearances'&&fail){fail=false;throw Error('simulated save failure');}return write(group,value);};
 await assert.rejects(service.appearance({action:'import',projectId:project.id,taskId:'edit'}),/simulated/);
 assert.equal(await readFile(path.join(root,'manifest.json'),'utf8'),before);assert.equal((await validateAppearance(root)).valid,true);
 service.store.write=write;
 const fork=await service.appearance({action:'import',projectId:project.id,taskId:'initial',createNew:true,appearanceId:'intentional-new-shape'});assert.equal(fork.updated,false);assert.notEqual(fork.appearance.id,id);
});
