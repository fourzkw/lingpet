import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {CursorObserver,normalizeCursorEvent,CURSOR_HOOKS} from '../src/cursor-observer.js';
import {startCursorService,forwardCursorEvent} from '../src/cursor-service.js';
import {StateStore} from '../src/state-store.js';
import {startLocalServer} from '../src/local-server.js';
import {request,readEndpoint} from '../src/bridge-client.js';
import {validateEvent} from '../src/protocol.js';

const event=(hook,extra={})=>({hook_event_name:hook,conversation_id:'conversation',generation_id:'g1',...extra});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<100;i++){if(check())return;await pause(20);}assert.fail('Timed out waiting for state');}

test('Cursor input normalization drops prompts, tools, email and transcript; validates metadata',()=>{
  const clean=normalizeCursorEvent(event('preToolUse',{tool_use_id:'t1',prompt:'SECRET',tool_input:{secret:'SECRET'},tool_output:'SECRET',user_email:'SECRET',transcript_path:'SECRET'}));
  assert.deepEqual(clean,event('preToolUse',{tool_use_id:'t1'}));assert.ok(!JSON.stringify(clean).includes('SECRET'));
  assert.equal(normalizeCursorEvent(event('preToolUse')),null);
  assert.equal(normalizeCursorEvent(event('stop',{status:'unknown'})),null);
  assert.equal(normalizeCursorEvent({hook_event_name:'beforeSubmitPrompt',conversation_id:'a'}),null);
  assert.equal(validateEvent({version:1,instanceId:'i',sessionId:'s',seq:1,turn:1,state:'idle'}).source,'dsh');
  assert.throws(()=>validateEvent({version:1,source:'unknown',instanceId:'i',sessionId:'s',seq:1,turn:1,state:'idle'}));
});

test('Cursor parallel tools, duplicates and late results preserve the active turn',()=>{
  const events=[],observer=new CursorObserver(e=>events.push(e),{instanceId:'cursor-test'});
  observer.accept(event('beforeSubmitPrompt'));assert.equal(events.at(-1).state,'thinking');
  for(const id of ['a','b'])observer.accept(event('preToolUse',{tool_use_id:id}));
  observer.accept(event('postToolUse',{tool_use_id:'a'}));assert.equal(events.at(-1).state,'working');
  observer.accept(event('postToolUseFailure',{tool_use_id:'b'}));assert.equal(events.at(-1).state,'thinking');
  assert.equal(observer.accept(event('preToolUse',{tool_use_id:'a'})),false);
  observer.accept(event('stop',{status:'completed'}));assert.equal(events.at(-1).state,'done');
  assert.equal(observer.accept(event('postToolUse',{tool_use_id:'b'})),false);
  observer.accept(event('beforeSubmitPrompt',{generation_id:'g2'}));assert.equal(events.at(-1).turn,2);
  assert.equal(observer.accept(event('beforeSubmitPrompt')),false);
  assert.equal(observer.accept(event('stop',{status:'error'})),false);
  observer.accept(event('stop',{generation_id:'g2',status:'aborted'}));assert.equal(events.at(-1).state,'interrupted');
  observer.accept(event('sessionEnd'));assert.equal(events.at(-1).state,'offline');
  assert.ok(events.every((e,i)=>e.seq===i+1&&e.source==='cursor'));
});

test('Cursor result arriving before start is not counted twice, sessions isolate, reconnect does not replay celebration',()=>{
  const events=[],o=new CursorObserver(e=>events.push(e),{instanceId:'cursor-test'});
  o.accept(event('postToolUse',{tool_use_id:'t'}));assert.equal(o.accept(event('preToolUse',{tool_use_id:'t'})),false);
  o.accept(event('stop',{status:'completed'}));
  o.accept(event('beforeSubmitPrompt',{conversation_id:'second',generation_id:'g2'}));
  o.replay();assert.equal(o.sessions.get('conversation').state,'idle');assert.equal(o.sessions.get('second').state,'thinking');
  o.accept(event('stop',{conversation_id:'second',generation_id:'g2',status:'error'}));assert.equal(events.at(-1).state,'error');
});

test('Cursor bridge uses authenticated transport, coexists with DSH, keeps heartbeat and reconnects',async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),'.test-data-cursor-'));
  let server,service;
  try{
    let store=new StateStore();server=await startLocalServer(store,dir);
    store.accept({version:1,instanceId:'dsh-test',sessionId:'dsh',turn:1,state:'thinking',seq:1});
    service=await startCursorService(dir,{autoStart:false,ownerCheck:async()=>true,intervalMs:30});
    assert.equal(await startCursorService(dir,{autoStart:false}),null);
    assert.equal((await fetch(service.endpoint.url+'/event',{method:'POST',body:'{}'})).status,401);
    assert.equal((await fetch(service.endpoint.url+'/health',{headers:{Authorization:'Bearer '+service.endpoint.token,Origin:'https://example.com'}})).status,403);
    await forwardCursorEvent(dir,event('beforeSubmitPrompt'),{start:false});
    await until(()=>[...store.sessions.values()].some(s=>s.source==='cursor'));
    assert.equal(store.instances.size,2);
    const cursorId=service.client.instanceId;store.instances.set(cursorId,0);
    await service.client.flush();store.tick();assert.ok(store.instances.has(cursorId),'heartbeat sustains a long task without new hooks');
    await server.close();store=new StateStore();server=await startLocalServer(store,dir);
    await service.client.flush();await service.client.flush();
    await until(()=>store.sessions.size===1);assert.equal(store.current().state,'thinking');
    await request(service.endpoint,'/quit',{});await until(()=>!store.instances.has(cursorId));
    service=null;assert.equal((await request(server.endpoint,'/health')).version,1);
  }finally{await service?.close();await server?.close();await rm(dir,{recursive:true,force:true});}
});

test('Cursor bridge shuts down after its owner exits, disconnecting only its own source',async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),'.test-data-cursor-'));let service;
  const store=new StateStore(),server=await startLocalServer(store,dir);
  try{
    store.register('dsh-test');
    service=await startCursorService(dir,{autoStart:false,ownerCheck:async()=>false,intervalMs:30});
    await forwardCursorEvent(dir,event('beforeSubmitPrompt'),{start:false});
    await until(()=>store.sessions.size===1);await until(()=>store.instances.size===1);
    assert.ok(store.instances.has('dsh-test'));assert.equal(store.current().state,'offline');
  }finally{await service?.close();await server.close();await rm(dir,{recursive:true,force:true});}
});

test('real hook subprocess sends whitelisted metadata and emits valid non-blocking responses',async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),'.test-data-cursor-')),store=new StateStore();
  const server=await startLocalServer(store,dir);let service;
  try{
    service=await startCursorService(dir,{autoStart:false,ownerCheck:async()=>true});
    const run=(hook,input)=>new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,['bin/cursor-hook.js',hook],{env:{...process.env,BOARD_PET_DATA_DIR:dir},windowsHide:true,stdio:['pipe','pipe','pipe']});
      let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);child.on('exit',code=>resolve({code,out,err}));child.stdin.end(JSON.stringify(input));
    });
    assert.deepEqual(JSON.parse((await run('beforeSubmitPrompt',event('beforeSubmitPrompt',{prompt:'SECRET'}))).out),{continue:true});
    assert.equal((await run('preToolUse',event('preToolUse',{tool_use_id:'a',tool_input:'SECRET'}))).out,'');
    await until(()=>store.current().state==='working');assert.ok(!JSON.stringify([...store.sessions.values()]).includes('SECRET'));
    const manifest=JSON.parse(await readFile(new URL('../cursor-plugin/.cursor-plugin/plugin.json',import.meta.url)));
    assert.equal(manifest.name,'board-pet');
    const hooks=JSON.parse(await readFile(new URL('../cursor-plugin/hooks/hooks.json',import.meta.url)));
    assert.deepEqual(Object.keys(hooks.hooks),CURSOR_HOOKS);
  }finally{await service?.close();await server.close();await rm(dir,{recursive:true,force:true});}
});

test('Windows Cursor PowerShell UTF-8 pipeline BOM is accepted by the actual hook', {skip:process.platform!=='win32'},async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),'.test-data-cursor-powershell-')),store=new StateStore(),server=await startLocalServer(store,dir);let service;
  try{
    service=await startCursorService(dir,{autoStart:false,ownerCheck:async()=>true});
    const {writeFile}=await import('node:fs/promises');
    const file=path.join(dir,'input.json');await writeFile(file,JSON.stringify(event('beforeSubmitPrompt',{prompt:'PRIVATE'})));
    const quote=value=>"'"+value.replaceAll("'","''")+"'";
    const script='$OutputEncoding = [System.Text.Encoding]::UTF8; Get-Content -LiteralPath '+quote(file)+' -Raw | & { $input | & '+quote(process.execPath)+' '+quote(path.resolve('bin/cursor-hook.js'))+' beforeSubmitPrompt }';
    const result=await new Promise((resolve,reject)=>{
      const child=spawn('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,BOARD_PET_DATA_DIR:dir},windowsHide:true,stdio:['ignore','pipe','pipe']});
      let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);child.on('exit',code=>resolve({code,out,err}));
    });
    assert.equal(result.code,0);assert.equal(result.err,'');assert.equal(JSON.parse(result.out).continue,true);
    await until(()=>store.current().state==='thinking');assert.ok(!JSON.stringify(store.snapshot()).includes('PRIVATE'));
  }finally{await service?.close();await server.close();await rm(dir,{recursive:true,force:true});}
});

test('concurrent cold hooks start one detached bridge and stop without touching the pet',async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),'.test-data-cursor-')),store=new StateStore(),server=await startLocalServer(store,dir);
  let bridge;
  try{
    const run=()=>new Promise((resolve,reject)=>{
      const env={...process.env,BOARD_PET_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
      const child=spawn(process.execPath,['bin/cursor-hook.js','beforeSubmitPrompt'],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
      let out='';child.stdout.on('data',v=>out+=v);child.on('error',reject);child.on('exit',code=>code?reject(new Error('Hook failed')):resolve(out));
      child.stdin.end(JSON.stringify(event('beforeSubmitPrompt')));
    });
    const outputs=await Promise.all([run(),run(),run()]);assert.ok(outputs.every(out=>JSON.parse(out).continue));
    await until(()=>store.current().state==='thinking');assert.equal(store.instances.size,1);assert.equal(store.sessions.size,1);
    bridge=await readEndpoint(path.join(dir,'cursor'));assert.ok(bridge&&bridge.pid!==process.pid);
    await request(bridge,'/quit',{});
    for(let i=0;i<100;i++){if(!await readEndpoint(path.join(dir,'cursor')))break;await pause(20);}
    assert.equal(await readEndpoint(path.join(dir,'cursor')),null);
    assert.equal((await request(server.endpoint,'/health')).version,1);
  }finally{
    if(bridge)await request(bridge,'/quit',{}).catch(()=>{});
    await server.close();await rm(dir,{recursive:true,force:true});
  }
});
