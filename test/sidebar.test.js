import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createSidebarServer,SIDEBAR_URI} from '../src/sidebar-server.js';
import {createPetControl} from '../src/sidebar-control.js';
import {startLocalServer} from '../src/local-server.js';
import {StateStore} from '../src/state-store.js';
import {PetRegistry} from '../src/pet-registry.js';
import {mkdtemp,rm,unlink,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

test('Codex start returns before download completes, status exposes progress and asynchronous failures',async()=>{
 const dir=await mkdtemp(path.resolve('.test-data-sidebar-progress-'));
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const control=createPetControl(dir,{backgroundStart:true,start:async()=>{entered();await gate;throw Error('模拟下载失败');}});
 const server=createSidebarServer(control),client=new Client({name:'progress-regression',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 try{
   await server.connect(a);await client.connect(b);
   const initial=await client.callTool({name:'board_pet_open',arguments:{}});assert.match(initial.content[0].text,/首次启动需要联网下载 Electron/);
   const response=await client.callTool({name:'board_pet_control',arguments:{action:'start'}});
   assert.equal(response.structuredContent.pending,true);await started;
   await writeFile(path.join(dir,'runtime-status.json'),JSON.stringify({phase:'downloading',percent:42,message:'Electron 下载 42%'}));
   const polling=await client.callTool({name:'board_pet_control',arguments:{action:'status'}});
   assert.equal(polling.structuredContent.runtime.percent,42);assert.match(polling.content[0].text,/42%/);
   release();let result;for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,5));result=await control.status();if(!result.pending)break;}
   assert.equal(result.pending,false);assert.equal(result.error,'模拟下载失败');
 }finally{release();await client.close();await server.close();await rm(dir,{recursive:true,force:true});}
});

test('sidebar advertises global entrypoint, embeds offline UI, and executes control through MCP',async()=>{
  const actions=[];const server=createSidebarServer({run:async action=>{actions.push(action);if(action==='settings')throw new Error('工作台不可用');return {running:action==='start',pets:[]};}});
  const client=new Client({name:'sidebar-test',version:'1'});
  const [a,b]=InMemoryTransport.createLinkedPair();
  try{
    await server.connect(a);await client.connect(b);
    const {tools}=await client.listTools();const entry=tools.find(t=>t.name==='board_pet_open');
    assert.equal(entry.title,'灵伴桌宠');assert.ok(entry._meta['openai/ui'].entrypoints.some(e=>e.type==='global'));
    assert.deepEqual(tools.find(t=>t.name==='board_pet_control')._meta.ui.visibility,['app']);
    const resource=await client.readResource({uri:SIDEBAR_URI});assert.equal(resource.contents[0].mimeType,'text/html;profile=mcp-app');
    assert.match(resource.contents[0].text,/关闭全部桌宠/);assert.ok(!resource.contents[0].text.includes('src="https:'));
    await client.callTool({name:'board_pet_open',arguments:{}});assert.deepEqual(actions,['status']);
    assert.equal((await client.callTool({name:'board_pet_control',arguments:{action:'start'}})).structuredContent.running,true);
    assert.equal((await client.callTool({name:'board_pet_control',arguments:{action:'settings'}})).isError,true);
    const count=actions.length;assert.equal((await client.callTool({name:'board_pet_control',arguments:{action:'invalid'}})).isError,true);assert.equal(actions.length,count);
  }finally{await client.close();await server.close();}
});

test('sidebar starts hidden or empty pets and stop persists across future status calls',async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),'.test-data-sidebar-'));let runtime;
  const registry=new PetRegistry({schemaVersion:2,pets:[]});const calls=[];
  const control=createPetControl(dir,{start:async(_dir,opts)=>{calls.push(opts);await unlink(path.join(dir,'runtime.paused')).catch(()=>{});runtime??=await startLocalServer(new StateStore(),dir,{petManager:{list:()=>({pets:registry.pets}),manage:({action,id,value})=>{if(action==='create')registry.create(value);else registry.update(id,value);return {ok:true};}},quitPet:()=>{const old=runtime;runtime=null;void old.close();}});}});
  try{
    assert.equal((await control.status()).running,false);
    let state=await control.run('start');assert.equal(state.pets.length,1);assert.equal(calls[0].explicit,true);
    registry.update(registry.pets[0].id,{enabled:false,petVisible:false});state=await control.run('start');assert.equal(state.pets[0].enabled,true);assert.equal(state.pets[0].visible,true);
    assert.equal((await control.run('stop')).running,false);assert.match(await readFile(path.join(dir,'runtime.paused'),'utf8'),/关闭/);
    assert.equal((await control.status()).running,false);assert.equal((await control.run('settings')).running,true);assert.equal(calls.at(-1).dashboard,true);
  }finally{await runtime?.close();assert.equal(path.dirname(dir),process.cwd());assert.ok(path.basename(dir).startsWith('.test-data-sidebar-'));await rm(dir,{recursive:true,force:true});}
});
