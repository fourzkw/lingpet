import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile,realpath,rm} from 'node:fs/promises';
import {relocateDesktopData,validateStorageTarget} from '../src/maintenance/desktop-data.js';

async function fixture(t){
  const base=path.resolve('.test-data-desktop-storage');await mkdir(base,{recursive:true});
  const work=await mkdtemp(path.join(base,'case-'));t.after(()=>rm(work,{recursive:true,force:true}));
  const root=path.join(work,'program'),dir=path.join(root,'data');await mkdir(dir,{recursive:true});
  await writeFile(path.join(root,'desktop-location.json'),JSON.stringify({format:1,root,dataDir:dir,version:'0.7.1'}));
  await writeFile(path.join(dir,'settings.json'),JSON.stringify({appearance:path.join(dir,'appearances','pet.png')}));
  await mkdir(path.join(dir,'appearances'));await writeFile(path.join(dir,'appearances/pet.png'),'pet artwork');
  return {work,root,dir};
}
test('moving data preserves logical asset and Agent paths, with original content backed up',async t=>{
  const {work,root,dir}=await fixture(t),target=path.join(work,'外部 内容');let stopped=0;
  await mkdir(path.join(dir,'integrations/packages'),{recursive:true});await writeFile(path.join(dir,'integrations/packages/connection.json'),JSON.stringify({dir}));
  const moved=await relocateDesktopData({root,dir,target,stop:async()=>stopped++});
  assert.equal(stopped,1);assert.equal(await realpath(dir),target);
  const settings=JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8'));
  assert.equal(await readFile(settings.appearance,'utf8'),'pet artwork');
  assert.equal(JSON.parse(await readFile(path.join(dir,'integrations/packages/connection.json'),'utf8')).dir,dir);
  assert.equal(await readFile(path.join(moved.backup,'appearances/pet.png'),'utf8'),'pet artwork');
  await writeFile(path.join(dir,'appearances/new.png'),'new download');assert.equal(await readFile(path.join(target,'appearances/new.png'),'utf8'),'new download');
});
test('subsequent content directory changes preserve prior external data',async t=>{
  const {work,root,dir}=await fixture(t),first=path.join(work,'first'),second=path.join(work,'second');
  await relocateDesktopData({root,dir,target:first,stop:async()=>{}});
  await writeFile(path.join(dir,'downloaded.txt'),'later download');
  await relocateDesktopData({root,dir,target:second,stop:async()=>{}});
  assert.equal(await realpath(dir),second);assert.equal(await readFile(path.join(second,'downloaded.txt'),'utf8'),'later download');
  assert.equal(await readFile(path.join(first,'downloaded.txt'),'utf8'),'later download');
});
test('nonempty and overlapping targets are rejected before stopping the app',async t=>{
  const {work,root,dir}=await fixture(t),target=path.join(work,'occupied');await mkdir(target);await writeFile(path.join(target,'keep.txt'),'keep');
  let stopped=false;await assert.rejects(relocateDesktopData({root,dir,target,stop:async()=>{stopped=true;}}),/空文件夹/);assert.equal(stopped,false);
  for(const target of [root,path.join(root,'versions/new'),path.join(dir,'new'),work])await assert.rejects(validateStorageTarget({root,dir,target}));
  assert.equal(await readFile(path.join(target,'keep.txt'),'utf8'),'keep');assert.equal(await realpath(dir),dir);
});
test('failure to stop the app leaves both the data directory and target untouched',async t=>{
  const {work,root,dir}=await fixture(t),target=path.join(work,'new');
  await assert.rejects(relocateDesktopData({root,dir,target,stop:async()=>{throw Error('still running');}}),/still running/);
  assert.equal(await realpath(dir),dir);await assert.rejects(readFile(path.join(target,'settings.json')),{code:'ENOENT'});
});
