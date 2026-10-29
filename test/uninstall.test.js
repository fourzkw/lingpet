import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import {uninstallLingPet} from '../src/uninstall.js';
import {mergeCodexHooks,CODEX_USER_LAUNCHER,disableCodexPluginHooks} from '../src/codex-hook-config.js';
import {mergeCursorHooks} from '../src/cursor-hook-config.js';
async function fixture(t){
 const root=await mkdtemp(path.join(process.cwd(),'.test-data-uninstall-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const dir=path.join(root,'BoardAiPet'),codexDir=path.join(root,'codex'),cursorDir=path.join(root,'cursor'),local=path.join(cursorDir,'plugins/local/board-pet');
 for(const folder of [path.join(dir,'codex'),codexDir,local+'/.cursor-plugin'])await mkdir(folder,{recursive:true});
 await writeFile(path.join(dir,'settings.json'),'{"pets":[{"name":"keep"}]}');await writeFile(path.join(dir,'codex/user-hook.cjs'),CODEX_USER_LAUNCHER);
 await writeFile(path.join(local,'.cursor-plugin/plugin.json'),'{"name":"board-pet"}');
 const foreign={command:'company-policy',failClosed:true};
 await writeFile(path.join(codexDir,'hooks.json'),JSON.stringify(mergeCodexHooks({hooks:{Stop:[{matcher:'*',hooks:[foreign]}]}},path.join(dir,'codex/user-hook.cjs'))));
 await writeFile(path.join(cursorDir,'hooks.json'),JSON.stringify(mergeCursorHooks({hooks:{preToolUse:[foreign]}},local)));
 await writeFile(path.join(codexDir,'config.toml'),disableCodexPluginHooks('[hooks.state."other:stop"]\nenabled = false\n[hooks.state."board-pet@board-pet-local:hooks/hooks.json:stop:0:0"]\ntrusted_hash = "KEEP"\nenabled = true\n'));
 let stopped=0,startup=0;return {root,dir,codexDir,cursorDir,local,options:{dir,codexDir,cursorDir,stopServices:async()=>{stopped++;},clearStartup:async()=>{startup++;return {removed:true};}},calls:()=>({stopped,startup})};
}
test('uninstall previews without mutations then detaches owned hooks while preserving data and third-party policies',async t=>{
 const f=await fixture(t),original=await readFile(path.join(f.codexDir,'hooks.json'),'utf8');
 const preview=await uninstallLingPet(f.options);assert.equal(preview.preview,true);assert.equal(preview.changedFiles.length,3);assert.deepEqual(f.calls(),{stopped:0,startup:0});assert.equal(await readFile(path.join(f.codexDir,'hooks.json'),'utf8'),original);
 const result=await uninstallLingPet({...f.options,apply:true});assert.equal(result.completed,true);assert.deepEqual(f.calls(),{stopped:1,startup:1});
 assert.equal(await readFile(path.join(f.dir,'settings.json'),'utf8'),'{"pets":[{"name":"keep"}]}');
 const codex=JSON.parse(await readFile(path.join(f.codexDir,'hooks.json'),'utf8')),cursor=JSON.parse(await readFile(path.join(f.cursorDir,'hooks.json'),'utf8'));
 assert.deepEqual(codex.hooks.Stop,[{matcher:'*',hooks:[{command:'company-policy',failClosed:true}]}]);assert.deepEqual(cursor.hooks.preToolUse,[{command:'company-policy',failClosed:true}]);
 const config=await readFile(path.join(f.codexDir,'config.toml'),'utf8');assert.match(config,/trusted_hash = "KEEP"/);assert.equal((config.match(/enabled = false/g)||[]).length,1);
 await assert.rejects(stat(f.local),{code:'ENOENT'});assert.ok((await stat(path.join(result.backup,'cursor-local-plugin'))).isDirectory());
 await assert.rejects(stat(path.join(f.dir,'codex/user-hook.cjs')),{code:'ENOENT'});assert.ok((await stat(path.join(f.dir,'runtime.paused'))).isFile());
 assert.equal((await uninstallLingPet(f.options)).changedFiles.length,0);
});
test('clean reinstall mode archives data instead of deleting creations and leaves only a pause marker',async t=>{
 const f=await fixture(t);await mkdir(path.join(f.dir,'creation'));await writeFile(path.join(f.dir,'creation/project.json'),'valuable');
 const result=await uninstallLingPet({...f.options,apply:true,archiveData:true});
 assert.equal(await readFile(path.join(result.archived,'creation/project.json'),'utf8'),'valuable');
 await assert.rejects(stat(path.join(f.dir,'settings.json')),{code:'ENOENT'});assert.ok((await stat(path.join(f.dir,'runtime.paused'))).isFile());
});
test('uninstall refuses unrelated plugins and dangerous data roots before any mutation',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.local,'.cursor-plugin/plugin.json'),'{"name":"other"}');
 await assert.rejects(uninstallLingPet({...f.options,apply:true}),/其他插件/);assert.deepEqual(f.calls(),{stopped:0,startup:0});
 await assert.rejects(uninstallLingPet({...f.options,dir:path.parse(f.dir).root}),/根目录/);
});
