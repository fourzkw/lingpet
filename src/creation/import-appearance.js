import {cp,copyFile,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {publishDirectory} from '../atomic-directory.js';
import {clipCandidates,maxClipDuration} from '../../desktop/action-clips.js';
import {validateAppearance} from './validation.js';

// Revisions live outside the appearance catalog; a material edit keeps its ID.
export async function importAppearance({dir,store,job,project,id,character,name,existing}){
 const root=path.join(dir,'appearances',id),revision=randomUUID();
 const stage=path.resolve(store.root,'staging',revision),backup=path.resolve(store.root,'revisions',id,revision);
 if(path.relative(path.resolve(store.root),stage).startsWith('..'))throw new Error('暂存目录越界');
 let moved=false,published=false;
 try{
  await mkdir(stage,{recursive:true});
  if(existing){
   const previous=await validateAppearance(root);if(!previous.valid||!previous.complete)throw new Error('原形象资源损坏，无法合并动作');
   const incoming=JSON.parse(await readFile(path.join(job.bundle,'manifest.json'),'utf8')),old=previous.manifest;
   const variants=m=>m.variants||['pixel',...(m.original?['original']:[])];
   const layout=m=>JSON.stringify([m.columns,m.tileSize,m.original?.tileSize,[...variants(m)].sort()]);
   if(layout(old)!==layout(incoming))throw new Error('动作更新须使用与原形象相同的图集尺寸和显示版本');
   const manifest={...old,clips:{}};
   for(const state of new Set([...Object.keys(old.clips),...Object.keys(incoming.clips)])){
    const source=incoming.clips[state]?incoming:old,sourceRoot=incoming.clips[state]?job.bundle:root;
    const group=structuredClone(source.clips[state]);let index=0;
    for(const clip of clipCandidates(group)){
     const file=state+'-'+revision+'-'+(index++)+'.png';
     for(const variant of variants(old)){
      const sourceDirectory=variant==='original'?source.original?.directory||'':'',directory=variant==='original'?old.original?.directory||'':'';
      const target=path.join(stage,directory,file);await mkdir(path.dirname(target),{recursive:true});
      await copyFile(path.join(sourceRoot,sourceDirectory,clip.file),target);
     }
     clip.file=file;
    }
    manifest.clips[state]=group;
   }
   await storeJson(stage,manifest);
  }else await cp(job.bundle,stage,{recursive:true});
  const report=await validateAppearance(stage);if(!report.valid||!report.complete)throw new Error(report.errors.join('; ')||'首次导入需要全部八种动作');
  const entry={...existing,id,character,name:name||existing?.name||project.name,asset:'custom:'+id,variants:report.variants,pixelSize:report.manifest.tileSize,doneMs:maxClipDuration(report.manifest.clips.done),root,manifest:report.manifest,projectId:project.id,taskId:job.id,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  await mkdir(path.dirname(root),{recursive:true});
  if(existing){await mkdir(backup,{recursive:true});await storeJson(backup,existing,'appearance.json');await publishDirectory(root,path.join(backup,'bundle'));moved=true;}
  await publishDirectory(stage,root);published=true;
  await store.write('appearances',entry);
  return {entry,updated:!!existing,backup:existing?backup:undefined};
 }catch(error){
  if(published)await publishDirectory(root,stage);
  if(moved)await publishDirectory(path.join(backup,'bundle'),root);
  if(existing&&published)await store.write('appearances',existing);
  throw error;
 }finally{await rm(stage,{recursive:true,force:true});}
}
async function storeJson(root,value,name='manifest.json'){
 await writeFile(path.join(root,name),JSON.stringify(value,null,2));
}
