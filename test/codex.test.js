import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {CodexObserver,normalizeCodexEvent} from '../src/codex-observer.js';
import {startCodexService,forwardCodexEvent} from '../src/codex-service.js';
import {startLocalServer} from '../src/local-server.js';
import {StateStore} from '../src/state-store.js';
import {PetRegistry} from '../src/pet-registry.js';
import {resolveFollow,bindingFor} from '../src/follow-resolver.js';
import {request,readEndpoint} from '../src/bridge-client.js';
const event=(hook,extra={})=>({hook_event_name:hook,session_id:'codex-thread',turn_id:'turn-1',...extra});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<100;i++){if(check())return;await pause(20);}assert.fail('Timed out');}
async function cleanup(dir){assert.equal(path.dirname(path.resolve(dir)),process.cwd());assert.ok(path.basename(dir).startsWith('.test-data-codex-'));await rm(dir,{recursive:true,force:true});}
test('Codex normalization drops conversation bodies, paths, tool arguments and results',()=>{
  const clean=normalizeCodexEvent(event('PreToolUse',{tool_use_id:'a',prompt:'SECRET',cwd:'SECRET',transcript_path:'SECRET',tool_input:'SECRET',tool_response:'SECRET',last_assistant_message:'SECRET'}));
  assert.ok(!JSON.stringify(clean).includes('SECRET'));assert.deepEqual(normalizeCodexEvent(clean),clean);
  assert.equal(normalizeCodexEvent(event('PreToolUse')),null);assert.equal(normalizeCodexEvent(event('Stop',{turn_id:null})),null);assert.equal(normalizeCodexEvent(event('unknown')),null);
});
test('Codex handles parallel tools, approval, input, duplicate and late results independently',()=>{
  const events=[],o=new CodexObserver(e=>events.push(e),{instanceId:'codex-test'});
  o.accept(event('UserPromptSubmit'));assert.equal(events.at(-1).state,'thinking');
  o.accept(event('PreToolUse',{tool_use_id:'a'}));o.accept(event('PreToolUse',{tool_use_id:'b'}));
  o.accept(event('PermissionRequest'));assert.equal(events.at(-1).state,'approval');
  o.accept(event('PostToolUse',{tool_use_id:'a',tool_response:{exit_code:1}}));assert.equal(events.at(-1).state,'working');
  o.accept(event('PostToolUse',{tool_use_id:'b'}));assert.equal(events.at(-1).state,'thinking');
  assert.equal(o.accept(event('PreToolUse',{tool_use_id:'b'})),false);
  const input=normalizeCodexEvent(event('PreToolUse',{tool_use_id:'input',tool_name:'request_user_input'}));o.accept(input);assert.equal(events.at(-1).state,'input');
  o.accept(event('PostToolUse',{tool_use_id:'input'}));o.accept(event('Stop'));assert.equal(events.at(-1).state,'done');
  assert.equal(o.accept(event('PostToolUse',{tool_use_id:'late'})),false);
  o.accept(event('UserPromptSubmit',{turn_id:'turn-2'}));assert.equal(events.at(-1).turn,2);
  assert.equal(o.accept(event('Stop')),false);o.accept(event('Interrupt',{turn_id:'turn-2'}));assert.equal(events.at(-1).state,'interrupted');
  o.accept(event('SessionEnd'));assert.equal(events.at(-1).state,'offline');
  assert.ok(events.every((e,i)=>e.source==='codex'&&e.seq===i+1));
});
test('Codex result before start, session isolation and reconnect preserve state without celebrations',()=>{
  const events=[],o=new CodexObserver(e=>events.push(e),{instanceId:'c'});
  o.accept(event('PostToolUse',{tool_use_id:'a'}));assert.equal(o.accept(event('PreToolUse',{tool_use_id:'a'})),false);
  o.accept(event('Stop'));o.accept(event('UserPromptSubmit',{session_id:'another'}));o.replay();
  assert.equal(o.sessions.get('codex-thread').state,'idle');assert.equal(o.sessions.get('another').state,'thinking');
});
test('Codex-only and fixed follow rules never select DSH or Cursor and reconnect stably',()=>{
  const store=new StateStore(),registry=new PetRegistry({});const pet=registry.create({follow:{mode:'source',source:'codex'}});
  assert.match(resolveFollow(store,pet.follow).label,/Codex/);
  store.accept({version:1,source:'dsh',instanceId:'d',sessionId:'other',turn:1,seq:1,state:'approval'});
  store.accept({version:1,source:'codex',scopeId:'codex-local',instanceId:'c1',sessionId:'task',turn:1,seq:1,state:'working'});
  assert.equal(resolveFollow(store,pet.follow).sessionId,'task');
  const bound=bindingFor(resolveFollow(store,pet.follow));registry.update(pet.id,{follow:bound});store.disconnect('c1');
  store.accept({version:1,source:'codex',scopeId:'codex-local',instanceId:'c2',sessionId:'task',turn:2,seq:1,state:'thinking'});
  assert.equal(resolveFollow(store,bound).instanceId,'c2');assert.equal(resolveFollow(store,{mode:'source',source:'dsh'}).sessionId,'other');
});
test('Codex authenticated bridge coexists with other sources and disconnects only its own source',async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),'.test-data-codex-'));const store=new StateStore();let server,service;
  try{
    server=await startLocalServer(store,dir);store.register('dsh');store.register('cursor');
    service=await startCodexService(dir,{autoStart:false,ownerCheck:async()=>true,intervalMs:30});
    assert.equal(await startCodexService(dir,{autoStart:false}),null);
    assert.equal((await fetch(service.endpoint.url+'/health')).status,401);
    assert.equal((await fetch(service.endpoint.url+'/health',{headers:{Authorization:'Bearer '+service.endpoint.token,Origin:'https://example.com'}})).status,403);
    await forwardCodexEvent(dir,event('UserPromptSubmit'),{start:false});await until(()=>store.sessions.size===1);
    assert.equal(store.current().source,'codex');assert.equal(store.instances.size,3);
    await service.close();service=null;assert.ok(store.instances.has('dsh'));assert.ok(store.instances.has('cursor'));assert.equal(store.current().state,'offline');
  }finally{await service?.close();await server?.close();await cleanup(dir);}
});
test('actual Codex hook subprocess handles BOM, strips secrets, and returns no policy decisions',async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),'.test-data-codex-'));const store=new StateStore();let server,service;
  try{
    server=await startLocalServer(store,dir);service=await startCodexService(dir,{autoStart:false,ownerCheck:async()=>true});
    for(const hook of ['UserPromptSubmit','PermissionRequest','Stop']){
      const result=await new Promise((resolve,reject)=>{
        const child=spawn(process.execPath,['bin/codex-hook.js',hook],{env:{...process.env,BOARD_PET_DATA_DIR:dir},windowsHide:true,stdio:['pipe','pipe','pipe']});
        let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));
        child.stdin.end('\uFEFF'+JSON.stringify(event(hook,{prompt:'SECRET',last_assistant_message:'SECRET',tool_input:'SECRET'})));
      });
      assert.equal(result.code,0);assert.deepEqual(JSON.parse(result.stdout),{});assert.ok(!JSON.stringify(result).includes('SECRET'));
    }
    await until(()=>store.current().state==='done');assert.ok(!JSON.stringify(store.snapshot()).includes('SECRET'));
  }finally{await service?.close();await server?.close();await cleanup(dir);}
});
test('concurrent cold Codex events start one bridge and it can exit without stopping desktop',async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),'.test-data-codex-'));const store=new StateStore();let server,endpoint;
  try{
    server=await startLocalServer(store,dir);
    await Promise.all(Array.from({length:4},()=>forwardCodexEvent(dir,event('UserPromptSubmit'))));
    endpoint=await readEndpoint(path.join(dir,'codex'));assert.ok(endpoint);await until(()=>store.sessions.size===1);
    assert.equal(store.instances.size,1);assert.equal(store.current().state,'thinking');
    await request(endpoint,'/quit',{});await until(()=>store.instances.size===0);endpoint=null;
    assert.equal((await request(server.endpoint,'/health')).version,1);
  }finally{if(endpoint)await request(endpoint,'/quit',{}).catch(()=>{});await pause(100);await server?.close();await cleanup(dir);}
});
