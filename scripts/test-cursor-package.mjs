import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {StateStore} from '../src/state-store.js';
import {startLocalServer} from '../src/local-server.js';
import {startCursorService} from '../src/cursor-service.js';

const plugin=path.resolve(process.argv[2]||'artifacts/cursor-board-pet-0.1.0-win-x64');
const dir=await mkdtemp(path.join(process.cwd(),'.test-data-cursor-package-'));
const store=new StateStore(),server=await startLocalServer(store,dir);let service;
try{
  const manifest=JSON.parse(await readFile(path.join(plugin,'.cursor-plugin/plugin.json'),'utf8'));assert.equal(manifest.name,'board-pet');
  const {runtimeExecutable}=await import(pathToFileURL(path.join(plugin,'runtime/src/bootstrap.js')));
  await assert.rejects(stat(path.join(plugin,'runtime/node_modules/electron/dist')),{code:'ENOENT'});
  const {version}=JSON.parse(await readFile(path.join(plugin,'runtime/node_modules/electron/package.json'),'utf8'));
  const cached=path.join(dir,'runtime',`electron-${version}-${process.platform}-${process.arch}`,'electron.exe');
  await mkdir(path.dirname(cached),{recursive:true});await writeFile(cached,'cached runtime fixture');
  const executable=await runtimeExecutable(dir);assert.equal(executable,cached,'runtime reuses user cache without downloading');
  service=await startCursorService(dir,{autoStart:false,ownerCheck:async()=>true});
  await new Promise((resolve,reject)=>{
    const env={...process.env,BOARD_PET_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
    const child=spawn(process.execPath,[path.join(plugin,'scripts/hook.cjs'),'beforeSubmitPrompt'],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);child.on('exit',code=>{
      if(code)return reject(new Error(err));try{assert.deepEqual(JSON.parse(out),{continue:true});resolve();}catch(error){reject(error);}
    });child.stdin.end(JSON.stringify({conversation_id:'package-test',generation_id:'one',prompt:'not forwarded'}));
  });
  for(let i=0;i<100&&store.current().state!=='thinking';i++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(store.current().source,'cursor');assert.equal(store.current().state,'thinking');
  console.log(JSON.stringify({standalonePlugin:true,hookToPet:true,bundledElectron:false,userCacheReused:true}));
}finally{await service?.close();await server.close();await rm(dir,{recursive:true,force:true});}
