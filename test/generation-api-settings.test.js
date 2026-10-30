import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {GenerationAPISettings,modelsEndpoint} from '../src/creation/generation-api-settings.js';
async function fixture(t){const dir=await mkdtemp(path.join(process.cwd(),'.test-generation-api-'));t.after(()=>rm(dir,{recursive:true,force:true}));return new GenerationAPISettings(dir);}
test('generation API configurations persist independently and never return stored keys',async t=>{
 const settings=await fixture(t);assert.equal((await settings.get()).image.protocol,'openai-images');assert.equal((await settings.get()).seedance.hasApiKey,false);
 await settings.configure('image',{url:'https://images.example/v1/generate',model:'image-model',apiKey:'image-secret'});
 const result=await settings.configure('video',{url:'http://localhost:8000/video',model:'video-model',apiKey:'video-secret'});
 assert.equal(result.image.hasApiKey,true);assert.equal(result.video.model,'video-model');assert.ok(!JSON.stringify(result).includes('secret'));
 assert.deepEqual(await new GenerationAPISettings(path.dirname(settings.store.root)).get(),result);
 await settings.configure('image',{apiKey:'',model:'new-image-model'});assert.equal((await settings.read()).image.apiKey,'image-secret');
 await settings.configure('image',{clearApiKey:true});assert.equal((await settings.get()).image.hasApiKey,false);assert.equal((await settings.read()).video.apiKey,'video-secret');
 await settings.configure('image',{url:'',model:'',clearApiKey:true});assert.equal((await settings.get()).image.url,'');
});
test('invalid generation API settings leave saved configuration intact',async t=>{
 const settings=await fixture(t);await settings.configure('image',{url:'https://image.example',model:'model'});const before=await readFile(settings.file,'utf8');
 for(const values of [{url:'file:///tmp/key'},{url:'https://user:pass@example.com'},{url:'invalid'},{url:''},{apiKey:'bad\nheader'},{model:42}])await assert.rejects(settings.configure('image',values));
 await assert.rejects(settings.configure('other',{}));assert.equal(await readFile(settings.file,'utf8'),before);
});

test('model endpoints preserve proxy paths and normalize generation routes',()=>{
 for(const [url,kind,expected] of [
  ['https://proxy.example/custom/v1/','image','https://proxy.example/custom/v1/models'],
  ['https://proxy.example/v1/images/generations','image','https://proxy.example/v1/models'],
  ['https://ark.example/api/v3/contents/generations/tasks','seedance','https://ark.example/api/v3/models'],
  ['https://mini.example','minimax','https://mini.example/v1/models'],
  ['https://mini.example/proxy/v2/video_generation/','minimax','https://mini.example/proxy/v1/models'],
  ['https://mini.example/v1/models','minimax','https://mini.example/v1/models'],
 ])assert.equal(modelsEndpoint(url,kind),expected);
});

test('model discovery uses draft settings without saving and keeps secrets private',async t=>{
 const settings=await fixture(t);await settings.configure('image',{url:'https://images.example/v1',model:'original',apiKey:'stored-secret'});
 const before=await readFile(settings.file,'utf8'),requests=[];
 const fetcher=async(url,options)=>{requests.push({url,...options});return Response.json({data:[{id:'z-image'},{id:'a-image'},{id:'z-image'},null,{id:12},{id:'bad\nmodel'}]});};
 assert.deepEqual(await settings.models('image',{},fetcher),['a-image','z-image']);
 assert.equal(requests[0].headers.Authorization,'Bearer stored-secret');assert.equal(requests[0].redirect,'error');assert.equal(requests[0].method,'GET');
 await settings.models('image',{url:'https://draft.example/v1',apiKey:'draft-secret'},fetcher);assert.equal(requests[1].url,'https://draft.example/v1/models');assert.equal(requests[1].headers.Authorization,'Bearer draft-secret');
 await settings.models('image',{url:'https://different.example/v1'},fetcher);assert.equal(requests[2].headers.Authorization,undefined);
 await settings.models('image',{clearApiKey:true},fetcher);assert.equal(requests[3].headers.Authorization,undefined);
 await settings.models('image',{apiKey:''},fetcher);assert.equal(requests[4].headers.Authorization,'Bearer stored-secret');
 assert.equal(await readFile(settings.file,'utf8'),before);
 for(const kind of ['seedance','minimax','video'])assert.deepEqual(await settings.models(kind,{url:'https://video.example/api/v3',apiKey:'key'},async()=>Response.json({models:['video-a','video-b']})),['video-a','video-b']);
});

test('model discovery validates inputs and reports provider failures without leaking response text',async t=>{
 const settings=await fixture(t),values={url:'https://models.example/v1'};let calls=0;
 const unexpected=async()=>{calls++;throw new Error('must not fetch');};
 await assert.rejects(settings.models('other',values,unexpected));await assert.rejects(settings.models('image',{},unexpected));
 for(const url of ['file:///tmp','https://user:pass@example.com','https://example.com/?key=secret','invalid'])await assert.rejects(settings.models('image',{url},unexpected));
 await assert.rejects(settings.models('image',{...values,apiKey:'bad\nkey'},unexpected));assert.equal(calls,0);
 for(const [fetcher,pattern] of [
  [async()=>{throw new Error('secret');},/连接中断或超时/],
  [async()=>new Response('secret',{status:401}),/HTTP 401/],
  [async()=>new Response('secret',{status:404}),/手动填写/],
  [async()=>new Response('not json'),/响应无效/],
  [async()=>new Response('x'.repeat(2*1024*1024+1)),/响应无效或过大/],
  [async()=>Response.json({error:{message:'secret'}}),/服务拒绝/],
  [async()=>Response.json({base_resp:{status_code:1004}}),/服务拒绝/],
  [async()=>Response.json({unexpected:[]}),/有效模型列表/],
 ])await assert.rejects(settings.models('image',values,fetcher),error=>pattern.test(error.message)&&!error.message.includes('secret'));
 assert.deepEqual(await settings.models('image',values,async()=>Response.json({data:[]})),[]);
});
