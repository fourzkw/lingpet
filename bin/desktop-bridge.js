import {dataDirectory} from '../src/paths.js';
import {integrationRequest,creationProxy} from '../src/integrations/client.js';
import {normalizeCodexEvent} from '../src/codex-observer.js';
import {normalizeCursorEvent} from '../src/cursor-observer.js';
import {json} from '../src/integrations/files.js';
import path from 'node:path';

const [command,id,event]=process.argv.slice(2),dir=dataDirectory();
if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('无效接入标识');
if(command==='hook'){
  let source;
  try{
    const config=await json(path.join(dir,'integrations/clients',id+'.json'),null);source=config?.source;
    const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;if(size>8*1024*1024)throw Error('输入过大');chunks.push(chunk);}
    const input=JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/,''));
    const value=(source==='cursor'?normalizeCursorEvent:normalizeCodexEvent)({...input,hook_event_name:event});
    if(value)await integrationRequest(dir,id,'/hook',value);
  }catch{/* Observers never change the Agent's approval/continuation policy. */}
  if(source==='cursor'&&event==='beforeSubmitPrompt')process.stdout.write('{"continue":true}\n');
  else if(!(source==='cursor'&&event==='preToolUse'))process.stdout.write('{}\n');
}else if(command==='mcp'){
  const {StdioServerTransport}=await import('@modelcontextprotocol/sdk/server/stdio.js');
  const {createSidebarServer}=await import('../src/sidebar-server.js');
  const {CreationStore}=await import('../src/creation/store.js');
  const creation=creationProxy(dir,id);creation.store=new CreationStore(dir);
  const control={run:action=>integrationRequest(dir,id,'/control',{action},{control:true,timeout:15000})};
  const server=createSidebarServer(control,creation);await server.connect(new StdioServerTransport());
  process.stdin.once('end',()=>void server.close());
}else throw Error('不支持的 Bridge 命令');
