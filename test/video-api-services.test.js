import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {GenerationAPISettings} from '../src/creation/generation-api-settings.js';
import {CreationService} from '../src/creation/service.js';
import {creationSchemas} from '../src/creation/tools.js';
import {movePriority} from '../desktop/generation-priority-ui.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
const mp4=Buffer.concat([Buffer.from([0,0,0,20]),Buffer.from('ftypisom000000000000')]);
async function fixture(t,fetcher){const dir=await mkdtemp(path.join(process.cwd(),'.test-video-services-'));t.after(()=>rm(dir,{recursive:true,force:true}));return {settings:new GenerationAPISettings(dir),service:new CreationService(dir,{fetcher}),dir};}
const entry=(vendor,extra={})=>({vendor,url:'https://'+vendor+'.example/v1',model:vendor+'-model',apiKey:'private-'+vendor,...extra});
async function project(service){const value=await service.project({action:'create'});const image=await service.project({action:'add_reference',projectId:value.id,base64:png.toString('base64')});await service.project({action:'select_base',projectId:value.id,assetId:image.id});return value;}
const args=(value,provider,extra={})=>creationSchemas.board_pet_generate_video.parse({projectId:value.id,provider,state:'idle',prompt:'companion breathes naturally',...extra});

test('multiple video accounts automatically join priorities and retain order, flags and secrets',async t=>{
 const {settings}=await fixture(t);assert.deepEqual((await settings.priorities()).video,[{id:'comfyui',enabled:true}]);
 await assert.rejects(settings.saveVideo(null,{vendor:'grok',url:'https://example.com'}),/模型/);assert.equal((await settings.get()).videoApis.length,0);
 const first=await settings.saveVideo(null,entry('grok',{name:'Grok 主账号'})),id=first.savedVideoId;
 assert.equal(first.videoApis.length,1);assert.ok(!JSON.stringify(first).includes('private-'));assert.equal(first.videoApis[0].hasApiKey,true);
 const order=await settings.priorities();order.video.reverse();order.video[0].enabled=false;await settings.setPriorities(order);
 const second=await settings.saveVideo(null,entry('grok',{name:'备用',model:'another'}));assert.notEqual(second.savedVideoId,id);
 const rows=(await settings.priorities()).video;assert.deepEqual(rows.slice(0,2),order.video);assert.equal(rows.at(-1).id,second.savedVideoId);
 await settings.saveVideo(id,{model:'renamed',apiKey:''});assert.equal((await settings.read()).videoApis[0].apiKey,'private-grok');
 await settings.removeVideo(id);assert.equal((await settings.priorities()).video.some(row=>row.id===id),false);
 await assert.rejects(settings.setPriorities(order),/配置可能已变更/);
});

test('legacy migration keeps provider IDs, secret ownership and order without writing on inspection',async t=>{
 const {settings}=await fixture(t);const legacy={seedance:{url:'https://seed.example/api/v3',model:'seed',apiKey:'seed-key'},minimax:{url:'https://mini.example',model:'mini',apiKey:'mini-key',protocol:'minimax-hailuo'},priorities:{image:[{id:'comfyui',enabled:false},{id:'api',enabled:true}],video:[{id:'minimax',enabled:false},{id:'comfyui',enabled:true},{id:'seedance',enabled:true}]}};
 await writeFile(settings.file,JSON.stringify(legacy)).catch(async error=>{if(error.code!=='ENOENT')throw error;await settings.store.write('projects',{id:'placeholder'});await writeFile(settings.file,JSON.stringify(legacy));});
 const before=await readFile(settings.file,'utf8'),config=await settings.get();assert.deepEqual(config.videoApis.map(v=>v.id),['seedance','minimax']);assert.equal(await readFile(settings.file,'utf8'),before);assert.deepEqual(await settings.priorities(),{...legacy.priorities,image:[...legacy.priorities.image,{id:"imagegen",enabled:true}]});
 await settings.saveVideo('seedance',{name:'旧配置新名称',model:'updated'});assert.equal((await settings.read()).seedance.apiKey,'seed-key');assert.equal((await settings.read()).videoApis.find(v=>v.id==='seedance').apiKey,'seed-key');
 await settings.removeVideo('minimax');assert.equal((await settings.get()).minimax.url,'');assert.equal((await settings.read()).videoApis.length,1);
});

test('video settings reject vendor/protocol mismatches and block deletion of an active service',async t=>{
 const {settings}=await fixture(t);await assert.rejects(settings.saveVideo(null,entry('grok',{protocol:'seedance'})),/不匹配/);await assert.rejects(settings.saveVideo(null,entry('unknown')),/厂家/);
 await assert.rejects(settings.saveVideo(null,entry('grok',{url:'https://user:password@example.com'})),/凭证/);
 const saved=await settings.saveVideo(null,entry('gemini')),id=saved.savedVideoId;
 await settings.store.write('tasks',{id:'active',provider:id,status:'running'});await assert.rejects(settings.removeVideo(id),/未完成/);
 await settings.store.write('tasks',{id:'active',provider:id,status:'completed'});await settings.removeVideo(id);assert.deepEqual((await settings.priorities()).video,[{id:'comfyui',enabled:true}]);
});

test('Gemini model lists use Google authentication and strip models/ names',async t=>{
 const {settings}=await fixture(t);const saved=await settings.saveVideo(null,entry('gemini'));let options;
 const rows=await settings.models(saved.savedVideoId,{},async(_url,input)=>{options=input;return Response.json({models:[{name:'models/gemini-omni-1.1-flash'}]});});
 assert.deepEqual(rows,['gemini-omni-1.1-flash']);assert.equal(options.headers['x-goog-api-key'],'private-gemini');assert.equal(options.headers.Authorization,undefined);
 const urls=[];const paged=await settings.models(saved.savedVideoId,{},async(url,input)=>{urls.push(url);assert.equal(input.headers['x-goog-api-key'],'private-gemini');return Response.json(url.includes('pageToken=')?{models:[{name:'models/omni-next'}]}:{models:[{name:'models/first-model'}],nextPageToken:'next-page'});});
 assert.deepEqual(paged,['first-model','omni-next']);assert.equal(urls.length,2);assert.equal(new URL(urls[1]).searchParams.get('pageToken'),'next-page');
});

test('Grok submits its configured service, resumes and downloads without sending credentials to the CDN',async t=>{
 const calls=[];const {settings,service,dir}=await fixture(t,async(url,options)=>{calls.push({url,options});
  if(options.method==='POST'){const body=JSON.parse(options.body);assert.match(body.image.url,/^data:image\/png;base64,/);assert.equal(body.duration,8);assert.equal(body.aspect_ratio,'1:1');return Response.json({request_id:'grok-job'});}
  if(url.endsWith('/videos/grok-job'))return Response.json({status:'done',video:{url:'https://cdn.example/video.mp4'}});
  assert.equal(options.headers.Authorization,undefined);return new Response(mp4);
 });
 const saved=await settings.saveVideo(null,entry('grok')),value=await project(service),job=await service.generate('video',args(value,saved.savedVideoId,{durationSeconds:8}));
 assert.equal(job.provider,saved.savedVideoId);assert.equal(job.status,'queued');assert.equal(calls[0].url,'https://grok.example/v1/videos/generations');
 const done=await new CreationService(dir,{fetcher:service.fetcher}).task({projectId:value.id,taskId:job.id});assert.equal(done.status,'completed');assert.deepEqual(await readFile(service.store.assetPath(done.outputs[0].id)),mp4);assert.ok(!JSON.stringify(done).includes('private-grok'));
});

test('Gemini native submission reads REST model_output video data and preserves first/last frame instructions',async t=>{
 const {settings,service}=await fixture(t,async(url,options)=>{assert.equal(url,'https://gemini.example/v1/interactions');assert.equal(options.headers['x-goog-api-key'],'private-gemini');assert.equal(options.headers.Authorization,undefined);
  const body=JSON.parse(options.body);assert.equal(body.input[0].mime_type,'image/png');assert.match(body.input[1].text,/<LAST_FRAME>@Image1/);assert.equal(body.response_format.delivery,'uri');
  return Response.json({id:'interaction-1',status:'completed',steps:[{type:'model_output',content:[{type:'video',data:mp4.toString('base64'),mime_type:'video/mp4'}]}]});
 });
 const saved=await settings.saveVideo(null,entry('gemini')),value=await project(service),job=await service.generate('video',args(value,saved.savedVideoId,{returnToStart:true,durationSeconds:10}));
 assert.equal(job.status,'completed');assert.equal(job.effectiveParameters.durationSeconds,null);assert.ok(job.warnings.some(w=>w.includes('实际时长')));assert.deepEqual(await readFile(service.store.assetPath(job.outputs[0].id)),mp4);
});

test('Gemini URI responses poll files, resume after restart and authenticate only on the configured origin',async t=>{
 let ready=false,posts=0;const {settings,service,dir}=await fixture(t,async(url,options)=>{
  if(options.method==='POST'){posts++;return Response.json({id:'interaction-2',status:'completed',steps:[{type:'model_output',content:[{type:'video',uri:'https://gemini.example/v1/files/file-2:download?alt=media'}]}]});}
  assert.equal(options.headers['x-goog-api-key'],'private-gemini');
  if(url.endsWith('/files/file-2'))return Response.json({state:ready?'ACTIVE':'PROCESSING'});
  assert.equal(url,'https://gemini.example/v1/files/file-2:download?alt=media');return new Response(mp4);
 });
 const saved=await settings.saveVideo(null,entry('gemini')),value=await project(service),job=await service.generate('video',args(value,saved.savedVideoId));assert.equal(job.status,'finalizing');
 ready=true;const done=await new CreationService(dir,{fetcher:service.fetcher}).task({projectId:value.id,taskId:job.id});assert.equal(done.status,'completed');assert.equal(posts,1);
});

test('dynamic services remain fixed after submission and do not fall back on timeout or configuration changes',async t=>{
 let mode='submit';const calls=[];const {settings,service}=await fixture(t,async(url,options)=>{calls.push(url);if(mode==='timeout')throw Error('offline');return Response.json(options.method==='POST'?{request_id:'task-1'}:{status:'pending'});});
 const first=await settings.saveVideo(null,entry('grok')),second=await settings.saveVideo(null,entry('grok',{name:'备用'})),value=await project(service);
 const order=await settings.priorities();order.video=[{id:first.savedVideoId,enabled:true},{id:second.savedVideoId,enabled:true},{id:'comfyui',enabled:true}];await settings.setPriorities(order);
 mode='timeout';const unknown=await service.generate('video',args(value,'auto'));assert.equal(unknown.status,'submission_unknown');assert.equal(calls.length,1);
 mode='submit';const job=await service.generate('video',args(value,first.savedVideoId));await settings.saveVideo(first.savedVideoId,{url:'https://changed.example/v1',apiKey:'new-private-key'});const count=calls.length;
 const result=await service.task({projectId:value.id,taskId:job.id});assert.match(result.error,/已变更/);assert.equal(calls.length,count);
});

test('drag moves to either side, remains immutable and cannot remove an entry on invalid targets',()=>{
 const rows=[{id:'a',enabled:false},{id:'b',enabled:true},{id:'c',enabled:true}];
 assert.deepEqual(movePriority(rows,'a','c',true).map(r=>r.id),['b','c','a']);assert.deepEqual(movePriority(rows,'c','a').map(r=>r.id),['c','a','b']);assert.deepEqual(movePriority(rows,'a','missing'),rows);assert.deepEqual(rows.map(r=>r.id),['a','b','c']);
});
