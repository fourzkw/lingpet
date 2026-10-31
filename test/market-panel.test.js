import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import pngjs from 'pngjs';
import {MarketService} from '../src/market/service.js';
const states=['idle','thinking','working','input','approval','done','error','sleep'],id='a'.repeat(48),token='b'.repeat(48);
function fixture(){
 const image=new pngjs.PNG({width:512,height:512});image.data.fill(180);for(let i=3;i<image.data.length;i+=4)image.data[i]=255;
 const png=pngjs.PNG.sync.write(image,{colorType:6}),manifest={schemaVersion:1,tileSize:96,columns:2,variants:['pixel'],clips:Object.fromEntries(states.map(state=>[state,{file:'sprites/'+state+'.png',sourceFrames:2,frames:[0,1],durations:[90,90],loop:!['done','error'].includes(state)}]))};
 return {png,record:{id,status:'approved',pet:{formatVersion:1,id:'fixture-pet',name:'市场测试桌宠',author:'alice',license:'CC0',description:'native market preview',version:'1.0.0',minAppVersion:'0.4.0'},preview:manifest,sha256:'c'.repeat(64),size:1234,repository:'alice/pet',tag:'v1.0.0',assetName:'fixture.petpack'}};
}
test('market list forwards only supported browse filters with safely encoded search',async t=>{
 const dir=await data(t);let requested;
 const service=new MarketService(dir,{fetcher:async url=>{requested=new URL(url);return new Response('[]');}});
 await service.list('fox & role',{sort:'downloads',style:'both',interaction:'pet',recent:'30',injected:'ignored'});
 assert.equal(requested.searchParams.get('q'),'fox & role');
 for(const [key,value]of Object.entries({sort:'downloads',style:'both',interaction:'pet',recent:'30'}))assert.equal(requested.searchParams.get(key),value);
 assert.equal(requested.searchParams.has('injected'),false);
});
async function data(t){const dir=await mkdtemp(path.join(process.cwd(),'.test-data-panel-'));t.after(async()=>{assert.equal(path.dirname(dir),process.cwd());assert.ok(path.basename(dir).startsWith('.test-data-panel-'));await rm(dir,{recursive:true,force:true});});return dir;}
test('native market validates public preview metadata and bounds image paths, dimensions and cache',async t=>{
 const dir=await data(t),{record,png}=fixture();let calls=0,evil=false;
 const service=new MarketService(dir,{fetcher:async url=>{calls++;if(String(url).includes('/preview/')){const bytes=Buffer.from(png);if(evil){bytes.writeUInt32BE(999999,16);bytes.writeUInt32BE(999999,20);}return new Response(bytes);}return new Response(JSON.stringify(record));}});
 assert.equal((await service.detail(id)).pet.name,'市场测试桌宠');const before=calls;
 await assert.rejects(service.detail('../bad'),/编号/);await assert.rejects(service.image({versionId:id,state:'../secret'}),/动作/);assert.equal(calls,before);
 const uri=await service.image({versionId:id,cover:true}),cover=pngjs.PNG.sync.read(Buffer.from(uri.split(',')[1],'base64'));assert.equal(cover.width,192);assert.equal(cover.height,192);
 const after=calls;assert.equal(await service.image({versionId:id,cover:true}),uri);assert.equal(calls,after);
 evil=true;await assert.rejects(service.image({versionId:id,state:'thinking'}),/尺寸/);
 record.status='pending';await assert.rejects(service.detail(id),/上架/);
 record.status='approved';record.preview.clips.idle.frames=[999];record.preview.clips.idle.durations=[100];await assert.rejects(service.detail(id),/动作/);
});
test('batch repository submissions persist each independent receipt',async t=>{
 const dir=await data(t),rows=['a','c'].map((char,index)=>({id:char.repeat(48),token:'b'.repeat(48),record:{repository:'alice/pets',tag:'v'+(index+1),assetName:char+'.petpack'}}));
 const service=new MarketService(dir,{fetcher:async()=>new Response(JSON.stringify({...rows[0],records:rows,total:2,created:2}))});
 const value=await service.submit({repository:'alice/pets'});assert.equal(value.receipts.length,2);assert.equal(value.receipt.id,rows[0].id);
 const saved=await new MarketService(dir).receipts();assert.equal(saved.length,2);assert.deepEqual(saved.map(r=>r.id).sort(),rows.map(r=>r.id).sort());
});

test('panel submissions pin the original market and persist receipts across app restarts',async t=>{
 const dir=await data(t),{record}=fixture(),first='http://127.0.0.1:9633',second='http://127.0.0.1:9634';const requests=[];let service;
 service=new MarketService(dir,{fetcher:async(url,options)=>{
  requests.push({url:String(url),method:options.method,body:options.body});assert.equal(options.headers['Content-Type'],'application/json');
  if(String(url).endsWith('/api/submissions')){await service.configure(second);return new Response(JSON.stringify({id,token,record:{...record,status:'queued'}}));}
  return new Response(JSON.stringify({...record,status:'pending'}));
 }});
 await service.configure(first);const result=await service.submit({repository:'alice/pet',tag:'v1.0.0',assetName:'fixture.petpack'});
 assert.equal(result.receipt.url,first);assert.equal(requests[0].url,first+'/api/submissions');assert.equal(requests[0].method,'POST');assert.ok(!requests[0].url.includes(token));
 const restored=new MarketService(dir);assert.equal((await restored.receipts())[0].token,token);assert.equal((await restored.receipts())[0].url,first);
 assert.ok((await readFile(path.join(dir,'market-receipts.json'),'utf8')).includes(id));
 await service.configure(first);const queried=await service.lookup({id,token});assert.equal(queried.record.status,'pending');assert.equal(queried.receipt.url,first);
 assert.equal((await restored.receipts()).length,1);assert.equal((await restored.receiptForExport(queried.receipt)).token,token);
 await assert.rejects(service.lookup({id,token:'wrong'}),/凭证/);await assert.rejects(service.receiptForExport({id,token,url:'https://evil.example/path'}),/地址/);
 service.rememberReceipt=async()=>{throw Error('disk unavailable');};const warning=await service.submit({repository:'alice/pet',tag:'v2',assetName:'fixture.petpack'});assert.ok(warning.warning);assert.equal(warning.receipt.token,token);assert.equal((await service.receiptForExport(warning.receipt)).url,first);
});

test('repository-only submissions and lookups need no private token',async t=>{
 const dir=await data(t),{record}=fixture(),requests=[];
 const service=new MarketService(dir,{fetcher:async(url,options)=>{requests.push(JSON.parse(options.body));return new Response(JSON.stringify(String(url).endsWith('/lookup')?{repository:record.repository,records:[record]}:{id,existing:true,record}));}});
 const submitted=await service.submit({repository:' https://github.com/alice/pet '});
 assert.deepEqual(requests[0],{repository:'https://github.com/alice/pet'});assert.equal(submitted.existing,true);
 assert.equal((await new MarketService(dir).receipts())[0].repository,'alice/pet');
 assert.equal((await service.lookup({repository:'https://github.com/alice/pet'})).records[0].id,id);
 assert.deepEqual(requests[1],{repository:'https://github.com/alice/pet'});
 await assert.rejects(service.lookup({repository:''}),/仓库/);
});

test('native market accepts cover-only submissions without animation manifests',async t=>{
 const dir=await data(t),{record}=fixture();record.preview=null;const service=new MarketService(dir,{fetcher:async()=>new Response(JSON.stringify(record))});assert.equal((await service.detail(record.id)).preview,null);
});

test('same version presentation revision invalidates cached market covers',async t=>{
 const dir=await data(t),{record,png}=fixture();let images=0;
 const service=new MarketService(dir,{fetcher:async url=>{if(String(url).includes('/preview/')){images++;return new Response(png);}return new Response(JSON.stringify(record));}});
 await service.detail(id);await service.image({versionId:id,cover:true});await service.image({versionId:id,cover:true});assert.equal(images,1);
 record.previewRevision='new-snapshot';await service.detail(id);await service.image({versionId:id,cover:true});assert.equal(images,2);
});
