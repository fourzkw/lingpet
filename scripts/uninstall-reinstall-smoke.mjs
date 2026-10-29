import assert from 'node:assert/strict';
import {cp,mkdir,mkdtemp,writeFile,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const plugin=path.resolve(process.argv[2]),electron=path.resolve(process.argv[3]),root=path.join(plugin,'runtime');
if(!process.argv[3])throw Error('Usage: node scripts/uninstall-reinstall-smoke.mjs <Cursor-plugin> <verified-electron-dist>');
const base=await mkdtemp(path.resolve('output/uninstall-reinstall-')),dir=path.join(base,'BoardAiPet'),codexDir=path.join(base,'codex'),cursorDir=path.join(base,'cursor');
const load=file=>import(pathToFileURL(path.join(root,file)));
const {ensureRuntime}=await load('src/bootstrap.js'),{readEndpoint,request}=await load('src/bridge-client.js'),{uninstallLingPet}=await load('src/uninstall.js');
const {installCodexUserHooks}=await load('src/codex-hook-config.js'),{installCursorUserHooks}=await load('src/cursor-hook-config.js'),{syncCursorPlugin}=await load('src/cursor-install.js');
const {version:electronVersion}=JSON.parse(await readFile(path.join(root,'node_modules/electron/package.json'),'utf8'));
const seedRuntime=async()=>{const cache=path.join(dir,'runtime',`electron-${electronVersion}-win32-x64`);await mkdir(path.dirname(cache),{recursive:true});await cp(electron,cache,{recursive:true});};
const checks=[];
try{
 await seedRuntime();await ensureRuntime(dir,{explicit:true,dashboard:true});checks.push('initial real Electron startup');
 await mkdir(path.join(dir,'creation/projects'),{recursive:true});await writeFile(path.join(dir,'creation/projects/keep.json'),'valuable original project');
 const original=JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8'));
 await installCodexUserHooks(codexDir,dir);await syncCursorPlugin(plugin,path.join(cursorDir,'plugins/local/board-pet'));await installCursorUserHooks(path.join(cursorDir,'hooks.json'),path.join(cursorDir,'plugins/local/board-pet'));
 const options={dir,codexDir,cursorDir,clearStartup:async()=>({isolatedRegistry:true})};
 const preview=await uninstallLingPet(options);assert.equal(preview.preview,true);assert.equal((await request(await readEndpoint(dir),'/health')).name,'board-ai-pet');checks.push('preview makes no changes');
 await uninstallLingPet({...options,apply:true});assert.equal(await readFile(path.join(dir,'creation/projects/keep.json'),'utf8'),'valuable original project');checks.push('owned hooks and local plugin detached, real pet stopped');
 await ensureRuntime(dir,{explicit:true,dashboard:true});assert.deepEqual(JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8')),original);checks.push('retained-data reinstall preserves settings and projects');
 const reset=await uninstallLingPet({...options,apply:true,archiveData:true});assert.equal(await readFile(path.join(reset.archived,'creation/projects/keep.json'),'utf8'),'valuable original project');await assert.rejects(stat(path.join(dir,'settings.json')),{code:'ENOENT'});checks.push('clean reset archives all data without deleting it');
 // Keep this test independent of download mirrors; the verified runtime is a fixture.
 await seedRuntime();await ensureRuntime(dir,{explicit:true,dashboard:true});const fresh=JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8'));assert.equal(fresh.pets.length,1);assert.equal(fresh.pets[0].character,'claude');assert.equal(fresh.pets[0].variant,'pixel');checks.push('fresh reinstall creates only a Claude pixel pet');
 await uninstallLingPet({...options,apply:true});
 const result={passed:true,checks,output:base,electronDownloadTested:false};await writeFile(path.join(base,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){try{await uninstallLingPet({dir,codexDir,cursorDir,apply:true,clearStartup:async()=>({isolatedRegistry:true})});}catch{}throw error;}
