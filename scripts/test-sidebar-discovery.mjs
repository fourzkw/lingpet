import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const exe=process.argv[2];if(!exe)throw new Error('请传入桌面版 codex.exe 路径');
const child=spawn(exe,['app-server'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
const pending=new Map();let seq=0;child.stderr.resume();
child.on('error',error=>{for(const p of pending.values())p.reject(error);});
createInterface({input:child.stdout}).on('line',line=>{try{const message=JSON.parse(line),p=pending.get(message.id);if(p){pending.delete(message.id);clearTimeout(p.timer);message.error?p.reject(new Error(JSON.stringify(message.error))):p.resolve(message.result);}}catch{}});
const send=(method,params)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('RPC timeout: '+method));},45000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,method,params})+'\n');});
try{
  await send('initialize',{clientInfo:{name:'board_pet_sidebar_diagnostics',version:'0.3.1'},capabilities:{experimentalApi:true}});
  child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
  const result=await send('mcpServerStatus/list',{});
  const servers=result.data.filter(s=>/board.pet/.test(s.name));
  const summary=servers.map(s=>({name:s.name,tools:Object.values(s.tools||{}).map(t=>({name:t.name,meta:t._meta})),resources:(s.resources||[]).map(r=>({name:r.name,uri:r.uri}))}));
  await mkdir('artifacts/sidebar-discovery',{recursive:true});await writeFile('artifacts/sidebar-discovery/results.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
  assert.ok(summary.some(s=>s.tools.some(t=>t.meta?.['openai/ui']?.entrypoints?.some(e=>e.type==='global'))),'桌面 app-server 必须发现 global 入口');
}finally{for(const p of pending.values())clearTimeout(p.timer);child.kill();}
