import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import {syncCursorPlugin} from '../src/cursor-install.js';
async function plugin(root,version){
 await mkdir(path.join(root,'.cursor-plugin'),{recursive:true});await writeFile(path.join(root,'.cursor-plugin/plugin.json'),JSON.stringify({name:'board-pet',version}));
 const runtime=path.join(root,'runtime');for(const folder of ['src','desktop','assets','bin'])await mkdir(path.join(runtime,folder),{recursive:true});
 await writeFile(path.join(runtime,'package.json'),JSON.stringify({name:'lingpet',version}));
 for(const file of ['src/app.js','bin/hook.js','desktop/main.js','desktop/preload.cjs','assets/icon.png'])await writeFile(path.join(runtime,file),version);
}
test('Cursor refresh replaces an old standalone copy, backs it up outside discovery and never downgrades',async t=>{
 const base=await mkdtemp(path.join(process.cwd(),'.test-data-cursor-install-'));t.after(()=>rm(base,{recursive:true,force:true}));
 const source=path.join(base,'source'),target=path.join(base,'plugins/local/board-pet');await plugin(source,'2.0.0');await plugin(target,'1.0.0');await writeFile(path.join(target,'stale-electron.exe'),'old');
 const result=await syncCursorPlugin(source,target);assert.equal(result.changed,true);assert.equal(result.version,'2.0.0');assert.ok(!result.backup.startsWith(path.join(base,'plugins/local')+path.sep));
 await assert.rejects(stat(path.join(target,'stale-electron.exe')),{code:'ENOENT'});assert.equal(await readFile(path.join(result.backup,'stale-electron.exe'),'utf8'),'old');
 assert.equal((await syncCursorPlugin(source,target)).changed,false);
 const older=path.join(base,'older');await plugin(older,'1.0.0');assert.equal((await syncCursorPlugin(older,target)).version,'2.0.0');
});
