import path from 'node:path';
import {mkdir,cp,readFile,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {atomicRename} from '../atomic-directory.js';

const names=['LingPet.exe','LingPetBridge.exe','LingPetMaintenance.exe'];
async function optionalBytes(file){try{return await readFile(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}}

// Windows can move a running executable, but cannot overwrite its mapped image.
// Keep old images under the owned maintenance directory until their processes exit.
export async function replaceDesktopLaunchers(payload,root,{move=atomicRename}={}){
  const transaction=path.join(root,'maintenance','launchers-'+randomUUID()),changes=[];
  await mkdir(transaction,{recursive:true});
  const cleanup=()=>rm(transaction,{recursive:true,force:true}).catch(()=>{});
  const rollback=async()=>{
    for(const change of [...changes].reverse()){
      if(change.published)await move(change.target,change.staged);
      if(change.backedUp)await move(change.backup,change.target);
    }
    await cleanup();
  };
  try{
    for(const name of names){
      const target=path.join(root,name),source=path.join(payload,name),before=await optionalBytes(target);
      if(before?.equals(await readFile(source)))continue;
      const change={target,staged:path.join(transaction,name+'.new'),backup:path.join(transaction,name+'.old')};
      await cp(source,change.staged);changes.push(change);
      if(before!==null){await move(target,change.backup);change.backedUp=true;}
      await move(change.staged,target);change.published=true;
    }
    return {commit:cleanup,rollback};
  }catch(error){
    try{await rollback();}catch(restoreError){throw Object.assign(Error(error.message+'；启动入口恢复失败：'+restoreError.message),{launcherRestoreFailed:true});}
    throw error;
  }
}
