import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,cp} from 'node:fs/promises';
import path from 'node:path';
import {prepareSharedRuntime,activeSharedRelease,rollbackSharedRuntime,compareVersions,confirmRunningSharedRuntime} from '../src/shared-runtime.js';
import {StateStore} from '../src/state-store.js';
import {startLocalServer} from '../src/local-server.js';

async function fixture(root,version,text='same',protocol=1){
  await mkdir(root,{recursive:true});
  for(const folder of ['src','desktop','assets','bin'])await mkdir(path.join(root,folder));
  await writeFile(path.join(root,'package.json'),JSON.stringify({name:'dsh-board-pet',version,boardPetProtocol:protocol}));
  for(const file of ['src/core.js','desktop/main.js','desktop/preload.cjs','assets/test.bin','bin/cli.js'])await writeFile(path.join(root,file),text);
}

test('healthy releases cannot be rolled back by late starters and repair stale active pointers and block lists',async()=>{
 const root=await mkdtemp(path.join(process.cwd(),'.test-data-shared-health-')),dir=path.join(root,'data'),copyDependencies=async()=>{};let server;
 try{
  const a=path.join(root,'a'),b=path.join(root,'b');await fixture(a,'1.0.0');await fixture(b,'2.0.0');
  const first=await prepareSharedRuntime(dir,{root:a,copyDependencies}),next=await prepareSharedRuntime(dir,{root:b,copyDependencies});
  server=await startLocalServer(new StateStore(),dir,{getRelease:()=>next});
  assert.equal(await rollbackSharedRuntime(dir,next.root),null);assert.equal((await activeSharedRelease(dir)).root,next.root);
  const file=path.join(dir,'shared/active.json'),stale={protocol:1,active:path.basename(first.root),previous:null,version:first.version,backendHash:first.backendHash,frontendHash:first.frontendHash,blocked:[path.basename(next.root)]};await writeFile(file,JSON.stringify(stale));
  await confirmRunningSharedRuntime(dir);assert.equal((await activeSharedRelease(dir)).root,next.root);assert.deepEqual(JSON.parse(await readFile(file,'utf8')).blocked,[]);
  assert.equal((await prepareSharedRuntime(dir,{root:a,copyDependencies})).root,next.root);
 }finally{await server?.close();await rm(root,{recursive:true,force:true});}
});
test('concurrent DSH and Cursor installs reuse one immutable runtime that survives adapter removal',async()=>{
  const root=await mkdtemp(path.join(process.cwd(),'.test-data-shared-'));let copies=0;
  try{
    const a=path.join(root,'dsh'),b=path.join(root,'cursor'),dir=path.join(root,'data');await fixture(a,'1.0.0');await cp(a,b,{recursive:true});
    const copyDependencies=async()=>{copies++;await new Promise(resolve=>setTimeout(resolve,50));};
    const results=await Promise.all([prepareSharedRuntime(dir,{root:a,copyDependencies}),prepareSharedRuntime(dir,{root:b,copyDependencies})]);
    assert.equal(results[0].root,results[1].root);assert.equal(copies,1);
    await rm(a,{recursive:true,force:true});await rm(b,{recursive:true,force:true});assert.equal((await activeSharedRelease(dir)).root,results[0].root);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('shared runtime rejects downgrades and same-version conflicts and can roll back a failed upgrade',async()=>{
  const root=await mkdtemp(path.join(process.cwd(),'.test-data-shared-'));const copyDependencies=async()=>{};
  try{
    const a=path.join(root,'a'),b=path.join(root,'b'),c=path.join(root,'c'),old=path.join(root,'old'),dir=path.join(root,'data');
    await fixture(a,'1.0.0');await fixture(b,'1.0.0','different');await fixture(c,'1.1.0');await fixture(old,'0.9.0');
    const initial=await prepareSharedRuntime(dir,{root:a,copyDependencies});
    assert.equal((await prepareSharedRuntime(dir,{root:old,copyDependencies})).root,initial.root);
    assert.equal((await prepareSharedRuntime(dir,{root:b,copyDependencies})).conflict,true);
    const next=await prepareSharedRuntime(dir,{root:c,copyDependencies});assert.notEqual(next.root,initial.root);
    await rollbackSharedRuntime(dir,next.root);assert.equal((await activeSharedRelease(dir)).root,initial.root);
    assert.equal(compareVersions('1.0.0','1.0.0-beta'),1);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('failed staging and incompatible protocol leave the active runtime untouched',async()=>{
  const root=await mkdtemp(path.join(process.cwd(),'.test-data-shared-'));
  try{
    const a=path.join(root,'a'),b=path.join(root,'b'),c=path.join(root,'c'),dir=path.join(root,'data');await fixture(a,'1.0.0');await fixture(b,'2.0.0');await fixture(c,'2.0.0','same',2);
    const initial=await prepareSharedRuntime(dir,{root:a,copyDependencies:async()=>{}});
    await assert.rejects(()=>prepareSharedRuntime(dir,{root:b,copyDependencies:async()=>{throw new Error('disk failure');}}));
    await assert.rejects(()=>prepareSharedRuntime(dir,{root:c,copyDependencies:async()=>{}}));
    assert.equal((await activeSharedRelease(dir)).root,initial.root);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('LingPet packages upgrade legacy runtimes without breaking old adapters or saved settings',async()=>{
 const root=await mkdtemp(path.join(process.cwd(),'.test-data-shared-brand-'));const copyDependencies=async()=>{};
 try{
  const old=path.join(root,'old'),next=path.join(root,'new'),dir=path.join(root,'data');await fixture(old,'1.0.0');await fixture(next,'1.1.0','LingPet');
  const pkgFile=path.join(next,'package.json'),pkg=JSON.parse(await readFile(pkgFile,'utf8'));pkg.name='lingpet';await writeFile(pkgFile,JSON.stringify(pkg));
  await prepareSharedRuntime(dir,{root:old,copyDependencies});const settings='{"pets":[{"id":"keep","name":"我的桌宠"}]}';await writeFile(path.join(dir,'settings.json'),settings);
  const upgraded=await prepareSharedRuntime(dir,{root:next,copyDependencies}),installed=JSON.parse(await readFile(path.join(upgraded.root,'package.json'),'utf8'));
  assert.equal(installed.name,'dsh-board-pet');assert.equal(installed.lingpetDistribution,true);assert.equal(upgraded.version,'1.1.0');assert.equal((await prepareSharedRuntime(dir,{root:old,copyDependencies})).root,upgraded.root);assert.equal(await readFile(path.join(dir,'settings.json'),'utf8'),settings);
  const {describeRelease}=await import('../src/release.js');assert.equal((await describeRelease(next)).version,'1.1.0');pkg.name='unrelated-app';await writeFile(pkgFile,JSON.stringify(pkg));await assert.rejects(describeRelease(next),/不是桌宠插件包/);
 }finally{await rm(root,{recursive:true,force:true});}
});
