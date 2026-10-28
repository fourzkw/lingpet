import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {CODEX_HOOKS} from '../src/codex-observer.js';
const roots=process.argv.slice(2);
if(!roots.length)roots.push(path.join(os.homedir(),'.codex/plugins/cache/board-pet-local/board-pet/local'));
const backup=path.resolve('artifacts/codex-hook-fix',String(Date.now()));await mkdir(backup,{recursive:true});
for(const [index,root] of roots.entries()){
 const pkg=JSON.parse(await readFile(path.join(root,'plugin.json'),'utf8'));
 if(pkg.name!=='board-pet')throw new Error('目标不是灵伴 Codex 插件');
 const file=path.join(root,'hooks/hooks.json'),original=await readFile(file,'utf8'),config=JSON.parse(original);let changed=0;
 for(const name of CODEX_HOOKS)for(const group of config.hooks?.[name]||[])for(const hook of group.hooks||[]){
  if(hook.commandWindows===`node "$env:PLUGIN_ROOT/runtime/bin/codex-hook.js" ${name}`){hook.commandWindows=`node "%PLUGIN_ROOT%/runtime/bin/codex-hook.js" ${name}`;changed++;}
 }
 if(changed){await writeFile(path.join(backup,`hooks-${index}.json`),original);await writeFile(file,JSON.stringify(config,null,2)+'\n');}
 // Restore the production hook after the optional diagnostics used during repair.
 await copyFile('bin/codex-hook.js',path.join(root,'runtime/bin/codex-hook.js'));
 console.log(JSON.stringify({root,changed,reviewRequired:changed>0}));
}
