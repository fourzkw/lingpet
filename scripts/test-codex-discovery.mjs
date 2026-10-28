import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const exe=process.argv[2]||path.join(process.env.APPDATA,'npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe');
const child=spawn(exe,['app-server'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
const pending=new Map();let seq=0;
child.on('error',error=>{for(const p of pending.values())p.reject(error);});child.stderr.resume();
createInterface({input:child.stdout}).on('line',line=>{try{const message=JSON.parse(line),p=pending.get(message.id);if(p){pending.delete(message.id);clearTimeout(p.timer);message.error?p.reject(new Error(JSON.stringify(message.error))):p.resolve(message.result);}}catch{}});
const send=(method,params)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Codex RPC timeout: '+method));},30000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,method,params})+'\n');});
try{
  await send('initialize',{clientInfo:{name:'board_pet_diagnostics',version:'0.3.0'},capabilities:{experimentalApi:true}});
  child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
  const result=await send('hooks/list',{cwds:[process.cwd()]});
  const hooks=result.data.flatMap(e=>e.hooks).filter(h=>/board-pet-local/.test(h.sourcePath||'')||/user-hook\.cjs/.test(h.command||''));
  const summary=hooks.map(h=>({event:h.eventName,source:h.source,enabled:h.enabled,trust:h.trustStatus,command:h.command}));
  await mkdir('artifacts/codex-discovery',{recursive:true});await writeFile('artifacts/codex-discovery/results.json',JSON.stringify({hooks:summary},null,2));
  console.log(JSON.stringify({hooks:summary}));assert.equal(hooks.filter(h=>h.enabled).length,8,'Codex must enable exactly eight LingPet hooks');
}finally{for(const p of pending.values())clearTimeout(p.timer);child.kill();}
