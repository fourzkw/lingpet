import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve('output/video/chatgpt-idle-h3'),base='http://127.0.0.1:8188';
const {prompt_id:job}=JSON.parse(await readFile(path.join(out,'api-workflow-submission.json'),'utf8'));
const {client_id:client}=JSON.parse(await readFile(path.join(out,'client-id.json'),'utf8'));
let state={prompt_id:job,startedMonitoringAt:new Date().toISOString()},finished=false,busy=false;
async function save(){await writeFile(path.join(out,'status.json'),JSON.stringify(state,null,2));}
async function poll(){
 if(busy||finished)return;busy=true;
 try{
 const response=await fetch(base+'/history/'+job,{signal:AbortSignal.timeout(10000)});const history=await response.json();const entry=history[job];
 if(entry){
  await writeFile(path.join(out,'history.json'),JSON.stringify(history,null,2));state.status=entry.status?.status_str;state.completed=entry.status?.completed;state.outputs=entry.outputs;
  if(state.status==='error'){const error=entry.status.messages.find(x=>x[0]==='execution_error')?.[1];state.error=error?{node:error.node_id,type:error.exception_type,message:error.exception_message}:entry.status.messages;console.log(JSON.stringify({status:'error',error:state.error}));await save();finished=true;socket.close();clearInterval(timer);process.exitCode=1;return;}
  if(state.completed){for(const output of Object.values(entry.outputs||{}))for(const asset of output.images||output.videos||[]){const params=new URLSearchParams({filename:asset.filename,subfolder:asset.subfolder||'',type:asset.type||'output'});const r=await fetch(base+'/view?'+params);if(!r.ok)throw new Error('Cannot read output '+r.status);const file=path.join(out,path.basename(asset.filename));await writeFile(file,Buffer.from(await r.arrayBuffer()));state.file=file;console.log(JSON.stringify({status:'success',file}));}await save();finished=true;socket.close();clearInterval(timer);return;}
 }
 }catch(error){state.monitorError=error.message;console.log(JSON.stringify({monitorError:error.message}));await save();}finally{busy=false;}
}
const socket=new WebSocket('ws://127.0.0.1:8188/ws?clientId='+encodeURIComponent(client));
socket.addEventListener('message',async event=>{if(typeof event.data!=='string')return;try{const message=JSON.parse(event.data);if(!['executing','progress','execution_error','execution_success'].includes(message.type))return;state.event=message.type;state.progress=message.data;state.updatedAt=new Date().toISOString();console.log(JSON.stringify({event:message.type,node:message.data.node,value:message.data.value,max:message.data.max}));await save();if(message.type==='execution_success'||message.type==='execution_error')void poll();}catch{}});
socket.addEventListener('error',()=>{console.log('WebSocket unavailable; history monitoring continues.');});
const timer=setInterval(()=>void poll(),3000);await save();await poll();
