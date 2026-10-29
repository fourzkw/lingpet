import {cp,mkdir,readFile,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {CODEX_HOOKS} from '../src/codex-observer.js';
import {copyReleaseRuntime,copyHostDependencies} from './release-content.mjs';
const version=JSON.parse(await readFile('package.json','utf8')).version;
const out=path.resolve(process.argv[2]||`artifacts/lingpet-codex-${version}-win-x64`);
await import('./build-sidebar.mjs');
await mkdir(out,{recursive:false});
const plugin=path.join(out,'plugins/board-pet');await mkdir(path.join(plugin,'hooks'),{recursive:true});
const runtime=path.join(plugin,'runtime');await mkdir(runtime);
await copyReleaseRuntime(process.cwd(),runtime);
await cp('skills',path.join(plugin,'skills'),{recursive:true});
await copyHostDependencies(process.cwd(),runtime);
await writeFile(path.join(plugin,'plugin.json'),JSON.stringify({name:'board-pet',version,description:'灵伴桌宠：侧栏管理启停，并跟随 Codex 会话状态。',mcpServers:'./.mcp.json',interface:{displayName:'灵伴桌宠',shortDescription:'在侧栏启动、关闭与管理桌宠'},extensions:{'com.openai':{hooks:'./hooks/hooks.json'}}},null,2));
await writeFile(path.join(plugin,'.mcp.json'),JSON.stringify({mcpServers:{'board-pet':{command:'node',args:['./runtime/bin/sidebar-mcp.js'],cwd:'.'}}},null,2));
// Codex's Windows command hook runner uses COMSPEC (cmd.exe), independently of
// the interactive shell. Keep environment expansion in that runner's syntax.
const hooks=Object.fromEntries(CODEX_HOOKS.map(name=>[name,[{hooks:[{type:'command',command:`node "${'${PLUGIN_ROOT}'}/runtime/bin/codex-hook.js" ${name}`,commandWindows:`node "%PLUGIN_ROOT%/runtime/bin/codex-hook.js" ${name}`,timeout:3}]}]]));
await writeFile(path.join(plugin,'hooks/hooks.json'),JSON.stringify({hooks},null,2));
await mkdir(path.join(out,'.agents/plugins'),{recursive:true});
await writeFile(path.join(out,'.agents/plugins/marketplace.json'),JSON.stringify({name:'board-pet-local',interface:{displayName:'灵伴桌宠'},plugins:[{name:'board-pet',source:{source:'local',path:'./plugins/board-pet'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Productivity'}]},null,2));
await writeFile(path.join(plugin,'README.md'),(await readFile('docs/codex-integration.md','utf8')).replaceAll('(getting-started.md)','(runtime/docs/getting-started.md)'));
console.log(out);
