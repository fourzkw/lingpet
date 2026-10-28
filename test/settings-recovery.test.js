import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,readdir,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {SettingsStore} from '../src/settings-store.js';
import {PetRegistry} from '../src/pet-registry.js';

async function fixture(t){
  const dir=await mkdtemp(path.join(process.cwd(),'.test-data-settings-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  return new SettingsStore(dir,raw=>new PetRegistry(raw).config);
}
const read=file=>readFile(file,'utf8').then(JSON.parse);

test('settings preserve the previous valid revision across saves and restarts',async t=>{
  const store=await fixture(t),config=await store.load();
  await store.save(config);config.pets[0].name='第二版';await store.save(config);
  assert.equal((await read(store.backup)).pets[0].name,'默认桌宠');
  const restarted=new SettingsStore(path.dirname(store.file),raw=>new PetRegistry(raw).config);
  await restarted.save(await restarted.load());
  assert.equal((await read(store.backup)).pets[0].name,'默认桌宠');
  const restored=await restarted.restore();assert.equal(restored.pets[0].name,'默认桌宠');
  assert.equal((await read(store.file)).pets[0].name,'默认桌宠');
  assert.equal((await read(path.join(path.dirname(store.file),restarted.recovery.preserved))).pets[0].name,'第二版');
});

for(const broken of ['{"schemaVersion":',JSON.stringify({schemaVersion:2,pets:[{id:'a',scale:999}]})]){
  test('corrupt JSON or invalid configuration recovers without losing the original: '+broken.slice(0,25),async t=>{
    const store=await fixture(t),config=await store.load();config.pets[0].name='保留的伙伴';await store.save(config);
    await writeFile(store.file,broken);const recovered=await store.load();
    assert.deepEqual(recovered,config);assert.equal(store.recovery.source,'backup');
    assert.equal(await readFile(path.join(path.dirname(store.file),store.recovery.preserved),'utf8'),broken);
    assert.deepEqual(await read(store.file),config);
  });
}

test('missing settings use backup; two damaged files are both preserved before defaults',async t=>{
  const store=await fixture(t),config=await store.load();await store.save(config);await rm(store.file);
  assert.deepEqual(await store.load(),config);assert.equal(store.recovery.source,'backup');
  await writeFile(store.file,'broken-primary');await writeFile(store.backup,'broken-backup');
  const fallback=await store.load();assert.equal(fallback.pets.length,1);assert.equal(store.recovery.source,'defaults');
  const files=await readdir(path.dirname(store.file));
  const contents=await Promise.all(files.filter(f=>f.includes('corrupt-')).map(f=>readFile(path.join(path.dirname(store.file),f),'utf8')));
  assert.ok(contents.includes('broken-primary'));assert.ok(contents.includes('broken-backup'));
});

test('failed writes do not poison later saves and pending snapshots cannot mutate',async t=>{
  const store=await fixture(t),config=await store.load();await store.save(config);
  await rm(store.backup);await mkdir(store.backup);
  config.pets[0].name='写入失败';await assert.rejects(store.save(config));
  assert.equal((await read(store.file)).pets[0].name,'默认桌宠');
  await rm(store.backup,{recursive:true});
  const saving=store.save(config);config.pets[0].name='之后修改';await saving;
  assert.equal((await read(store.file)).pets[0].name,'写入失败');
  assert.ok(!(await readdir(path.dirname(store.file))).some(f=>f.endsWith('.tmp')));
});

test('I/O errors are surfaced instead of resetting settings; invalid backups cannot be restored',async t=>{
  const store=await fixture(t);await mkdir(store.file);
  await assert.rejects(store.load());assert.equal(store.recovery,null);
  await rm(store.file,{recursive:true});await writeFile(store.backup,'invalid');
  await assert.rejects(store.restore(),/没有可用/);
});
