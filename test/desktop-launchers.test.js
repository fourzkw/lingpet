import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile,rm,rename} from 'node:fs/promises';
import {replaceDesktopLaunchers} from '../src/maintenance/desktop-launchers.js';

const names=['LingPet.exe','LingPetBridge.exe','LingPetMaintenance.exe'];
async function fixture(t){
  const base=path.resolve('.test-data-desktop-launchers');await mkdir(base,{recursive:true});
  const root=await mkdtemp(path.join(base,'case-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const payload=path.join(root,'payload'),installed=path.join(root,'installed');await mkdir(payload);await mkdir(installed);
  for(const name of names){await writeFile(path.join(payload,name),'new '+name);await writeFile(path.join(installed,name),'old '+name);}
  return {payload,root:installed};
}
test('launcher replacement moves old images aside instead of overwriting a locked executable',async t=>{
  const {payload,root}=await fixture(t);
  const move=async(from,to)=>{
    // Model Windows: overwrite of a mapped image fails; moving it aside is allowed.
    if(names.includes(path.basename(to)))try{await readFile(to);throw Object.assign(Error('mapped image'),{code:'EPERM'});}catch(error){if(error.code!=='ENOENT')throw error;}
    return rename(from,to);
  };
  const result=await replaceDesktopLaunchers(payload,root,{move});
  for(const name of names)assert.equal(await readFile(path.join(root,name),'utf8'),'new '+name);
  await result.commit();
});
test('failed publication restores every previously replaced launcher',async t=>{
  const {payload,root}=await fixture(t);
  const move=async(from,to)=>{if(path.basename(from)==='LingPetBridge.exe.new')throw Object.assign(Error('publication blocked'),{code:'EPERM'});return rename(from,to);};
  await assert.rejects(replaceDesktopLaunchers(payload,root,{move}),/publication blocked/);
  for(const name of names)assert.equal(await readFile(path.join(root,name),'utf8'),'old '+name);
});
test('later installation failure can restore old launcher bytes',async t=>{
  const {payload,root}=await fixture(t),result=await replaceDesktopLaunchers(payload,root);
  await result.rollback();for(const name of names)assert.equal(await readFile(path.join(root,name),'utf8'),'old '+name);
});
test('identical launcher bytes need no rename',async t=>{
  const {payload,root}=await fixture(t);
  for(const name of names)await writeFile(path.join(root,name),'new '+name);
  const result=await replaceDesktopLaunchers(payload,root,{move:async()=>{throw Error('unchanged launcher moved');}});await result.commit();
});
