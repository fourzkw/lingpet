import {readFile,mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {startLocalServer} from '../src/local-server.js';
import {StateStore} from '../src/state-store.js';
import {startCodexService} from '../src/codex-service.js';
const plugin=process.argv[2]||path.join(os.homedir(),'.codex/plugins/cache/board-pet-local/board-pet/local');
const hooks=JSON.parse(await readFile(path.join(plugin,'hooks/hooks.json'),'utf8')).hooks;
const dir=await mkdtemp(path.join(process.cwd(),'.test-data-codex-package-'));const store=new StateStore();let server,bridge;
const steps=[['SessionStart','idle'],['UserPromptSubmit','thinking'],['PreToolUse','working'],['PermissionRequest','approval'],['PostToolUse','thinking'],['Stop','done'],['UserPromptSubmit','thinking','t2'],['Interrupt','interrupted','t2'],['SessionEnd','offline','t2']];
try{
  server=await startLocalServer(store,dir);bridge=await startCodexService(dir,{autoStart:false,ownerCheck:async()=>true});
  for(const [hook,state,turn] of steps){
    const command=hooks[hook][0].hooks[0].commandWindows;
    const payload=JSON.stringify({hook_event_name:hook,session_id:'packaged-test',turn_id:turn||'t1',tool_use_id:'tool-1',prompt:'PRIVATE-MARKER',tool_input:'PRIVATE-MARKER'});
    const result=await new Promise((resolve,reject)=>{
      const child=spawn(process.env.COMSPEC||'cmd.exe',['/d','/s','/c',`"${command}"`],{env:{...process.env,PLUGIN_ROOT:plugin,BOARD_PET_DATA_DIR:dir},windowsHide:true,windowsVerbatimArguments:true,stdio:['pipe','pipe','pipe'],signal:AbortSignal.timeout(15000)});
      let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>resolve({code,out,err}));
      child.stdin.end(payload);
    });
    assert.equal(result.code,0,result.err);assert.deepEqual(JSON.parse(result.out),{});assert.ok(!result.err,result.err);
    for(let i=0;i<60&&store.current().state!==state;i++)await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal(store.current().state,state,hook);assert.ok(!JSON.stringify(store.snapshot()).includes('PRIVATE-MARKER'));
  }
  const result={commands:8,checks:steps.map(([hook,state])=>hook+' → '+state),failures:[]};
  await mkdir('artifacts/codex-package-smoke',{recursive:true});await writeFile('artifacts/codex-package-smoke/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await bridge?.close();await server?.close();assert.equal(path.dirname(dir),process.cwd());assert.ok(path.basename(dir).startsWith('.test-data-codex-package-'));await rm(dir,{recursive:true,force:true});}
