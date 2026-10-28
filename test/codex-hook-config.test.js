import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeCodexHooks,disableCodexPluginHooks,CODEX_USER_LAUNCHER} from '../src/codex-hook-config.js';
import vm from 'node:vm';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {installCodexUserHooks} from '../src/codex-hook-config.js';
test('Codex user hook merge preserves third-party handlers and is idempotent',()=>{
 const foreign={type:'command',command:'audit-policy',timeout:10};
 const existing={description:'Existing hooks',hooks:{Stop:[{hooks:[foreign]}],Notification:[{hooks:[foreign]}]}};
 const next=mergeCodexHooks(existing,'C:/User Data/LingPet/codex/user-hook.cjs');
 assert.equal(next.description,existing.description);assert.deepEqual(next.hooks.Stop[0].hooks,[foreign]);assert.deepEqual(next.hooks.Notification,existing.hooks.Notification);
 assert.equal(Object.keys(next.hooks).length,9);assert.deepEqual(mergeCodexHooks(next,'C:/User Data/LingPet/codex/user-hook.cjs'),next);
 assert.match(next.hooks.SessionStart[0].hooks[0].commandWindows,/User Data/);
 assert.throws(()=>mergeCodexHooks({},'C:/%unsafe%/a.cjs'));
 new vm.Script(CODEX_USER_LAUNCHER);
});
test('Codex migration disables only duplicate LingPet plugin hooks without changing trust',()=>{
 const text='[plugins."another@market"]\nenabled = true\n[hooks.state."another:stop"]\nenabled = true\n[hooks.state."board-pet@board-pet-local:hooks/hooks.json:stop:0:0"]\ntrusted_hash = "unchanged"\nenabled = true\n[features]\nhooks = true\n';
 const next=disableCodexPluginHooks(text);
 assert.match(next,/another:stop"\]\nenabled = true/);assert.match(next,/trusted_hash = "unchanged"\nenabled = false/);assert.match(next,/\[features\]\nhooks = true/);
 assert.equal((next.match(/enabled = false/g)||[]).length,8);assert.equal(disableCodexPluginHooks(next),next);
});
test('installed lightweight launcher forwards stdin and selects an upgraded shared release',async()=>{
 const dir=await mkdtemp(path.join(process.cwd(),'.test-data-codex-config-'));
 try{
  const data=path.join(dir,'data with spaces'),codex=path.join(dir,'codex'),root=path.join(data,'shared/releases/v1');
  await mkdir(path.join(root,'bin'),{recursive:true});await mkdir(codex,{recursive:true});
  await writeFile(path.join(root,'package.json'),JSON.stringify({name:'lingpet',type:'module'}));
  await writeFile(path.join(data,'shared/active.json'),JSON.stringify({protocol:1,active:'v1'}));
  await writeFile(path.join(root,'bin/codex-hook.js'),`let input='';for await(const b of process.stdin)input+=b;process.stdout.write(JSON.stringify({event:process.argv[2],input,dir:process.env.BOARD_PET_DATA_DIR}));`);
  await writeFile(path.join(codex,'config.toml'),'[features]\nhooks = true\n');
  const result=await installCodexUserHooks(codex,data);assert.equal(result.reviewRequired,true);
  const run=()=>new Promise((resolve,reject)=>{const c=spawn(process.execPath,[result.script,'Stop'],{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',reject);c.on('close',code=>code?reject(new Error(err)):resolve(JSON.parse(out)));c.stdin.end('{"session_id":"test"}');});
  assert.deepEqual(await run(),{event:'Stop',input:'{"session_id":"test"}',dir:data});
  assert.equal((await installCodexUserHooks(codex,data)).changed,false);
  await writeFile(path.join(data,'shared/active.json'),JSON.stringify({protocol:1,active:'..'}));
  await assert.rejects(installCodexUserHooks(codex,data),/运行时目录/);
  assert.match(await readFile(path.join(codex,'config.toml'),'utf8'),/hooks = true/);
 }finally{assert.equal(path.dirname(path.resolve(dir)),process.cwd());assert.ok(path.basename(dir).startsWith('.test-data-codex-config-'));await rm(dir,{recursive:true,force:true});}
});
