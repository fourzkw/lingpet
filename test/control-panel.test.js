import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,unlink,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {startControlPanel} from '../src/control-panel.js';
import {startLocalServer} from '../src/local-server.js';
import {StateStore} from '../src/state-store.js';
import {createPetControl} from '../src/sidebar-control.js';

test('browser and MCP panels can poll Electron download progress while their start command is pending',async()=>{
 const dir=await mkdtemp(path.resolve('.test-data-control-progress-'));
 let release,entered;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const start=async()=>{entered();await gate;throw Error('fixture download failure');};
 const panel=await startControlPanel(dir,{start}),control=createPetControl(dir,{start});
 let pending;
 try{
   await writeFile(path.join(dir,'runtime-status.json'),JSON.stringify({phase:'downloading',percent:42,message:'正在下载 Electron：42%'}));
   const origin=new URL(panel.url).origin,bootstrap=await fetch(panel.url,{redirect:'manual'}),cookie=bootstrap.headers.get('set-cookie').split(';')[0];
   pending=fetch(origin+'/start',{method:'POST',headers:{cookie,origin,'X-Board-Pet-Control':'1'}});
   await ready;
   const status=await (await fetch(origin+'/status',{headers:{cookie}})).json();assert.equal(status.runtime.percent,42);assert.equal(status.running,false);
   const mcpStart=assert.rejects(control.run('start'),/fixture download failure/);
   assert.equal((await control.run('status')).runtime.percent,42);
   release();assert.equal((await pending).status,500);await mcpStart;
 }finally{release();await pending?.catch(()=>{});await panel.close();await rm(dir,{recursive:true,force:true});}
});

test('control panel authenticates browser actions, survives pet stop, and explicitly restarts',async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),'.test-data-control-'));let runtime,panel;const options=[];
  try{
    panel=await startControlPanel(dir,{start:async(_dir,opts)=>{options.push(opts);await unlink(path.join(dir,'runtime.paused')).catch(()=>{});runtime??=await startLocalServer(new StateStore(),dir,{quitPet:()=>{const closing=runtime;runtime=null;void closing.close();}});}});
    const origin=new URL(panel.url).origin;
    assert.equal((await fetch(origin+'/status')).status,401);
    const bootstrap=await fetch(panel.url,{redirect:'manual'});assert.equal(bootstrap.status,303);const cookie=bootstrap.headers.get('set-cookie').split(';')[0];
    const headers={cookie,origin,'X-Board-Pet-Control':'1'};
    const call=async action=>{const response=await fetch(origin+'/'+action,{method:'POST',headers});assert.equal(response.status,200);return response.json();};
    assert.match(await (await fetch(origin,{headers:{cookie}})).text(),/关闭全部桌宠/);
    const theme=await fetch(origin+'/ui-theme.css',{headers:{cookie}});assert.equal(theme.status,200);assert.match(await theme.text(),/theme-tokens.css/);
    for(const asset of ['theme-tokens.css','ui-base.css']){const response=await fetch(origin+'/'+asset,{headers:{cookie}});assert.equal(response.status,200);assert.ok((await response.text()).length>100);}
    assert.equal((await (await fetch(origin+'/status',{headers:{cookie}})).json()).theme,'paper-journal');
    assert.equal((await fetch(origin+'/start',{method:'POST',headers:{...headers,origin:'https://evil.example'}})).status,403);
    assert.equal((await call('start')).running,true);assert.equal(options[0].explicit,true);
    assert.equal((await call('stop')).running,false);assert.match(await readFile(path.join(dir,'runtime.paused'),'utf8'),/关闭/);
    assert.equal((await (await fetch(origin+'/status',{headers:{cookie}})).json()).running,false);
    assert.equal((await call('stop')).running,false);
    assert.equal((await call('settings')).running,true);assert.equal(options.at(-1).dashboard,true);
    assert.equal((await call('stop')).running,false);
  }finally{await runtime?.close();await panel?.close();assert.equal(path.dirname(dir),process.cwd());assert.ok(path.basename(dir).startsWith('.test-data-control-'));await rm(dir,{recursive:true,force:true});}
});
