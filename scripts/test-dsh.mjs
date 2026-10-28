import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import * as plugin from '../src/plugin.js';
import {StateStore} from '../src/state-store.js';
import {startLocalServer} from '../src/local-server.js';

const globalDsh=process.env.DSH_PACKAGE_PATH||path.join(process.env.APPDATA||path.join(os.homedir(),'.npm-global'),'npm','node_modules','@deepseek-ai','dsh','package.json');
if(!existsSync(globalDsh))throw new Error('未找到 DSH。设置 DSH_PACKAGE_PATH 指向已安装 DSH 的 package.json。');
const require=createRequire(globalDsh),load=specifier=>import(pathToFileURL(require.resolve(specifier)).href);
const {Context}=await load('@deepseek-ai/cordis');
const {SessionStore}=await load('@deepseek-ai/dsh-session');
const {AgentRegistry}=await load('@deepseek-ai/dsh-agent');
const temp=await mkdtemp(path.join(process.cwd(),'.test-data-dsh-'));
const store=new StateStore(),server=await startLocalServer(store,temp),ctx=new Context();
const fibers=[];
try{
  fibers.push(ctx.plugin(SessionStore));await fibers.at(-1).await();
  fibers.push(ctx.plugin(AgentRegistry));await fibers.at(-1).await();
  fibers.push(ctx.plugin(plugin,{autoStart:false,dataDir:temp}));await fibers.at(-1).await();
  const session=ctx.sessions.create('integration-real-dsh');
  const until=async state=>{for(let i=0;i<80;i++){if(store.current().state===state)return;await new Promise(r=>setTimeout(r,50));}throw new Error(`等待 ${state} 超时，实际 ${store.current().state}`);};
  session.append('turn/start',{turn:1});await until('thinking');
  session.append('tool/call',{turn:1,step:1,callId:'call-1',name:'ask_user_question',arguments:'{}'});await until('input');
  session.append('approval/asked',{id:'approval-1',toolName:'bash'});await until('approval');
  session.append('approval/decided',{id:'approval-1',outcome:'allowed-once'});await until('input');
  session.append('tool/result',{turn:1,step:1,message:{role:'tool',toolCallId:'call-1',content:[{type:'text',text:'private answer'}]}},{surfaceOp:'append'});await until('thinking');
  session.append('turn/end',{turn:1,reason:{kind:'completed'}});await until('done');
  const serialized=JSON.stringify(store.snapshot());assert.ok(!serialized.includes('private answer'));
  const oldInstance=store.current().instanceId,oldSeq=store.current().seq;
  await fibers.pop().dispose();
  const refreshed=await import('../src/plugin.js?reload='+Date.now());
  fibers.push(ctx.plugin(refreshed,{autoStart:false,dataDir:temp}));await fibers.at(-1).await();
  session.append('turn/start',{turn:2});await until('thinking');
  assert.equal(store.current().instanceId,oldInstance);assert.ok(store.current().seq>oldSeq);assert.equal(store.instances.size,1);
  session.append('turn/end',{turn:2,reason:{kind:'completed'}});await until('done');
  await fibers.pop().dispose();await until('offline');
  session.append('turn/start',{turn:3});await new Promise(r=>setTimeout(r,100));assert.equal(store.current().state,'offline');
  console.log('PASS: real DSH Cordis/SessionStore → plugin → authenticated desktop transport; questions, approvals, completion, privacy, unload.');
}finally{
  for(const fiber of fibers.reverse())await fiber.dispose();
  await ctx.fiber.dispose();await server.close();
  assert.ok(path.resolve(temp).startsWith(path.resolve(process.cwd())+path.sep));await rm(temp,{recursive:true,force:true});
}
