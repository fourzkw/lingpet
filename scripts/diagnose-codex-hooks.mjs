import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {StateStore} from '../src/state-store.js';
import {startLocalServer} from '../src/local-server.js';
import {readEndpoint,request} from '../src/bridge-client.js';
import {startCodexService} from '../src/codex-service.js';
import {dataDirectory} from '../src/paths.js';
if(process.argv.includes('--live')){
 const data=dataDirectory(),result={};
 for(const [name,root] of [['desktop',data],['codex',path.join(data,'codex')]]){
  try{const h=await request(await readEndpoint(root),'/health');result[name]={connected:true,instances:h.instances,sessions:h.sessions,version:h.release?.version};}
  catch{result[name]={connected:false};}
 }
 await mkdir('artifacts/codex-real-hook-test',{recursive:true});await writeFile('artifacts/codex-real-hook-test/live.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));process.exit(result.codex.connected?0:1);
}
const dir=await mkdtemp(path.join(process.cwd(),'.test-data-codex-real-'));
const store=new StateStore(),server=await startLocalServer(store,dir);
const warm=process.argv.includes('--warm')?await startCodexService(dir,{autoStart:false,ownerCheck:async()=>true}):null;
const child=spawn(process.argv[2],['app-server'],{windowsHide:true,env:{...process.env,BOARD_PET_DATA_DIR:dir},stdio:['pipe','pipe','pipe']});
let seq=0;const pending=new Map(),events=[];child.stderr.resume();
createInterface({input:child.stdout}).on('line',line=>{try{const m=JSON.parse(line),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='hook/completed'){const r=m.params.run;events.push({event:r.eventName,status:r.status,durationMs:r.durationMs,entries:r.entries});}}catch{}});
const send=(method,params)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(new Error('timeout: '+method)),25000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,method,params})+'\n');});
try{
 await send('initialize',{clientInfo:{name:'lingpet_hook_diagnostics',version:'0.4.4'},capabilities:{experimentalApi:true}});child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
 const configured=await send('hooks/list',{cwds:[process.cwd()]});
 if(configured.data.flatMap(e=>e.hooks).some(h=>h.enabled&&/user-hook\.cjs/.test(h.command||'')))throw new Error('用户级 Hook 已接入；请发送真实消息后使用 --live，只读检查实际连接。');
 const thread=await send('thread/start',{cwd:process.cwd(),ephemeral:true,model:'diagnostic',modelProvider:'lingpet_diagnostic',config:{'shell_environment_policy.set':{BOARD_PET_DATA_DIR:dir},'model_providers.lingpet_diagnostic':{name:'Local hook diagnostic',base_url:'http://127.0.0.1:1/v1',wire_api:'responses',requires_openai_auth:false,request_max_retries:0,stream_max_retries:0}}});
 await send('turn/start',{threadId:thread.thread.id,input:[{type:'text',text:'Local hook transport diagnostic; no model is available at this local endpoint.'}]});
 for(let i=0;i<100&&!(events.some(e=>e.event==='userPromptSubmit'));i++)await new Promise(r=>setTimeout(r,100));
 const result={connected:store.sessions.size>0,sessions:store.sessions.size,instances:store.instances.size,events};
 await mkdir('artifacts/codex-real-hook-test',{recursive:true});await writeFile('artifacts/codex-real-hook-test/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 if(!result.connected)process.exitCode=1;
}finally{
 child.kill();for(const p of pending.values())clearTimeout(p.timer);
 await warm?.close();const endpoint=await readEndpoint(path.join(dir,'codex'));if(endpoint)await request(endpoint,'/quit',{}).catch(()=>{});
 await server.close();await new Promise(r=>setTimeout(r,300));
 if(path.dirname(path.resolve(dir))===process.cwd()&&path.basename(dir).startsWith('.test-data-codex-real-'))await rm(dir,{recursive:true,force:true});
}
