import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import {mergeCursorHooks,installCursorUserHooks} from '../src/cursor-hook-config.js';

test('user hook fallback preserves other policies and remains idempotent',()=>{
  const existing={version:1,custom:'preserved',hooks:{preToolUse:[{command:'security-check',failClosed:true}],other:[{command:'other'}]}};
  const first=mergeCursorHooks(existing,'C:/Users/test/.cursor/plugins/local/board-pet');
  assert.deepEqual(first.hooks.preToolUse[0],existing.hooks.preToolUse[0]);
  assert.deepEqual(first.hooks.other,existing.hooks.other);assert.equal(first.custom,'preserved');
  assert.equal(first.hooks.preToolUse.length,2);
  assert.deepEqual(mergeCursorHooks(first,'C:/Users/test/.cursor/plugins/local/board-pet'),first);
  assert.ok(!first.hooks.preToolUse[1].command.includes('${CURSOR_PLUGIN_ROOT}'));
});
test('install user hooks backs up valid configs, rejects invalid configs and never replaces policies',async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),'.test-data-hooks-')),file=path.join(dir,'hooks.json');
  try{
    await writeFile(file,'{"version":1,"hooks":{"stop":[{"command":"existing"}]}}');
    assert.equal((await installCursorUserHooks(file,'C:/board-pet')).changed,true);
    assert.equal((await installCursorUserHooks(file,'C:/board-pet')).changed,false);
    assert.equal((await readdir(dir)).filter(n=>n.includes('backup')).length,1);
    await writeFile(file,'invalid');await assert.rejects(()=>installCursorUserHooks(file,'C:/board-pet'));
    assert.equal(await readFile(file,'utf8'),'invalid');
  }finally{await rm(dir,{recursive:true,force:true});}
});
