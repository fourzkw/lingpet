import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {readEndpoint,request} from '../src/bridge-client.js';
import {ensureRuntime} from '../src/bootstrap.js';

const dir=path.resolve('.test-data/shared-live-'+Date.now());await mkdir(dir,{recursive:true});
const checks=[];let endpoint;
try{
  const run=()=>new Promise((resolve,reject)=>{
    const env={...process.env,BOARD_PET_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;delete env.BOARD_PET_SMOKE;delete env.BOARD_PET_MULTI_SMOKE;
    const child=spawn(process.execPath,['bin/board-pet.js','start'],{env,windowsHide:true,stdio:'pipe'});let error='';child.stderr.on('data',v=>error+=v);child.on('error',reject);child.on('exit',code=>code?reject(new Error(error)):resolve());
  });
  await Promise.all([run(),run()]);endpoint=await readEndpoint(dir);assert.ok(endpoint);
  const health=await request(endpoint,'/health');assert.ok(health.release.root.startsWith(path.join(dir,'shared/releases')));checks.push('two independent installers start one desktop from the shared directory');
  const initial=await request(endpoint,'/pets');assert.equal(initial.pets.length,1);
  const created=await request(endpoint,'/pets/manage',{action:'create',value:{name:'第二只',character:'deepseek',follow:{mode:'source',source:'cursor'}}});assert.equal(created.pets.length,2);checks.push('authenticated shared runtime manages multiple pets');
  await request(endpoint,'/quit',{});
  for(let i=0;i<50&&await readEndpoint(dir);i++)await new Promise(resolve=>setTimeout(resolve,100));
  await ensureRuntime(dir);assert.equal(await readEndpoint(dir),null);checks.push('global stop prevents either adapter from waking the service');
  await ensureRuntime(dir,{explicit:true});endpoint=await readEndpoint(dir);const restored=await request(endpoint,'/pets');assert.equal(restored.pets.length,2);checks.push('explicit start restores both pet configurations');
  console.log(JSON.stringify({checks,failures:[]}));await mkdir('artifacts/shared-runtime-live',{recursive:true});await writeFile('artifacts/shared-runtime-live/results.json',JSON.stringify({checks,failures:[]},null,2));
}finally{endpoint=await readEndpoint(dir);if(endpoint)await request(endpoint,'/quit',{}).catch(()=>{});}
