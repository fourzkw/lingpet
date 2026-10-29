import {mkdir,cp,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {CODEX_HOOKS} from '../codex-observer.js';
import {CURSOR_HOOKS} from '../cursor-observer.js';

// Cursor hook commands use CMD; Codex may use the configured PowerShell.
export function quoteCommand(value){if(/["%\r\n]/.test(value))throw Error('接入路径包含不支持的命令字符');return '"'+value+'"';}
export function hookCommand(bridge,id,event){return `${quoteCommand(bridge)} hook ${id} ${event}`;}
// Use an explicit shell and its invocation operator, from either CMD or PowerShell.
export function codexWindowsHookCommand(bridge,id,event){
  quoteCommand(bridge);
  if(/[$`]/.test(bridge))throw Error('接入路径包含不支持的命令字符');
  return `powershell.exe -NoProfile -NonInteractive -Command "& '${bridge.replaceAll("'","''")}' hook ${id} ${event}"`;
}
export async function createAdapterPackage({source,id,destination,bridge,version,templateRoot,dir}){
  await mkdir(destination,{recursive:true});
  const write=(file,value)=>writeFile(path.join(destination,file),JSON.stringify(value,null,2)+'\n');
  await write('lingpet-adapter.json',{format:1,source,installationId:id,version,bridgeProtocol:1});
  if(source==='codex'){
    const plugin=path.join(destination,'plugins/board-pet');await mkdir(path.join(plugin,'hooks'),{recursive:true});
    await writeFile(path.join(plugin,'plugin.json'),JSON.stringify({name:'board-pet',version,description:'连接已安装的灵伴本体',mcpServers:'./.mcp.json',interface:{displayName:'灵伴桌宠',shortDescription:'管理桌宠与跟随会话'},extensions:{'com.openai':{hooks:'./hooks/hooks.json'}}},null,2));
    await writeFile(path.join(plugin,'hooks/hooks.json'),JSON.stringify({hooks:Object.fromEntries(CODEX_HOOKS.map(event=>[event,[{hooks:[{type:'command',command:hookCommand(bridge,id,event),commandWindows:codexWindowsHookCommand(bridge,id,event),timeout:3}]}]]))},null,2));
    await writeFile(path.join(plugin,'.mcp.json'),JSON.stringify({mcpServers:{'board-pet':{command:bridge,args:['mcp',id]}}},null,2));
    await mkdir(path.join(destination,'.agents/plugins'),{recursive:true});
    await writeFile(path.join(destination,'.agents/plugins/marketplace.json'),JSON.stringify({name:'lingpet-'+id,interface:{displayName:'灵伴本体接入'},plugins:[{name:'board-pet',source:{source:'local',path:'./plugins/board-pet'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Productivity'}]},null,2));
    if(templateRoot)await cp(path.join(templateRoot,'skills'),path.join(plugin,'skills'),{recursive:true});
  }else if(source==='cursor'){
    await mkdir(path.join(destination,'.cursor-plugin'),{recursive:true});
    await write('.cursor-plugin/plugin.json',{name:'board-pet',version,description:'连接灵伴本体'});
    await write('hooks.json',{version:1,hooks:Object.fromEntries(CURSOR_HOOKS.map(event=>[event,[{command:hookCommand(bridge,id,event)}]]))});
    await write('mcp.json',{mcpServers:{'board-pet':{command:bridge,args:['mcp',id]}}});
    if(templateRoot)await cp(path.join(templateRoot,'skills'),path.join(destination,'skills'),{recursive:true});
  }else if(source==='dsh'){
    if(!templateRoot)throw Error('安装包缺少 DSH 适配器');
    await cp(path.join(templateRoot,'adapters/dsh'),destination,{recursive:true});
    await write('connection.json',{id,dir});
    const pkg=JSON.parse(await readFile(path.join(destination,'package.json'),'utf8'));pkg.version=version;await write('package.json',pkg);
  }else throw Error('不支持的 Agent');
}
