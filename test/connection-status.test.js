import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {StateStore} from '../src/state-store.js';
import {BridgeClient,request} from '../src/bridge-client.js';
import {startLocalServer} from '../src/local-server.js';
import {connectionStatus} from '../src/connection-status.js';
import {resolveFollow} from '../src/follow-resolver.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

test('management connectivity never creates an Agent session or verifies Hooks',async()=>{
 const dir=await mkdtemp(path.resolve('.test-data-connections-'));
 const store=new StateStore(),server=await startLocalServer(store,dir);
 const panel=new BridgeClient({dir,instanceId:'panel',source:'codex',channel:'management'});
 const events=new BridgeClient({dir,instanceId:'hooks',source:'codex'});
 try{
  await panel.flush();
  let state=await request(server.endpoint,'/connections');
  assert.equal(connectionStatus(state,'codex').state,'management');
  assert.equal(connectionStatus(state,'cursor').state,'disconnected');
  assert.equal(store.sessions.size,0);
  assert.match(resolveFollow(store,{mode:'source',source:'codex'}).label,/管理通道已连接/);
  await events.flush();
  assert.equal(connectionStatus(store.snapshot(),'codex').state,'waiting');
  events.enqueue({version:1,source:'codex',instanceId:'hooks',sessionId:'real',seq:1,turn:1,state:'working'});
  await events.flush();
  assert.equal(connectionStatus(await request(server.endpoint,'/connections'),'codex').state,'active');
  await events.close();
  assert.equal(connectionStatus(store.snapshot(),'codex').state,'management');
  await panel.close();
  assert.equal(connectionStatus(store.snapshot(),'codex').state,'disconnected');
 }finally{await events.close();await panel.close();await server.close();await rm(dir,{recursive:true,force:true});}
});

test('connection leases expire per source and invalid registration is rejected',()=>{
 let now=0;const store=new StateStore({now:()=>now,staleMs:10});
 store.register('c','codex','management');store.register('d','dsh');store.register('u','cursor');
 assert.throws(()=>store.register('bad','other'));
 assert.throws(()=>store.register('bad','codex','other'));
 now=8;store.heartbeat('d');now=12;store.tick();
 assert.equal(connectionStatus(store.snapshot(),'codex').connected,false);
 assert.equal(connectionStatus(store.snapshot(),'cursor').connected,false);
 assert.equal(connectionStatus(store.snapshot(),'dsh').connected,true);
 assert.equal(store.instances.size,1);
});

test('MCP plugins register their own host before any Hooks or panel actions',async()=>{
 const dir=await mkdtemp(path.resolve('.test-data-connections-mcp-'));
 const store=new StateStore(),server=await startLocalServer(store,dir);
 try{
  for(const source of ['codex','cursor']){
   const client=new Client({name:'connection-regression',version:'1'});
   const transport=new StdioClientTransport({command:process.execPath,args:['bin/sidebar-mcp.js',...(source==='cursor'?['--host=cursor']:[])],env:{...process.env,BOARD_PET_DATA_DIR:dir},stderr:'pipe'});
   try{
    await client.connect(transport);
    for(let i=0;i<100&&!connectionStatus(store.snapshot(),source).connected;i++)await new Promise(r=>setTimeout(r,20));
    assert.equal(connectionStatus(store.snapshot(),source).state,'management');
    assert.equal(store.sessions.size,0);
   }finally{await client.close();}
   for(let i=0;i<100&&connectionStatus(store.snapshot(),source).connected;i++)await new Promise(r=>setTimeout(r,20));
   assert.equal(connectionStatus(store.snapshot(),source).connected,false);
  }
 }finally{await server.close();await rm(dir,{recursive:true,force:true});}
});
