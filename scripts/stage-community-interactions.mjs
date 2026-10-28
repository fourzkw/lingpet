import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateAppearance} from '../src/creation/validation.js';
// Creates a reviewable copy first. Live catalog changes happen only after validation.
const source=process.argv[2],existing=process.argv[3],target=path.resolve('output/community-interactions/extended-appearance');
if(!source||!existing)throw new Error('Need processed bundle and existing appearance');
await mkdir(target,{recursive:true});await cp(existing,target,{recursive:true});
const manifest=JSON.parse(await readFile(path.join(target,'manifest.json'),'utf8')),extra=JSON.parse(await readFile(path.join(source,'manifest.json'),'utf8'));
if(extra.columns!==manifest.columns||extra.original.tileSize!==manifest.original.tileSize)throw new Error('图集尺寸不匹配');
for(const [kind,state] of [['click','idle'],['pet','done']]){
  manifest.clips[kind]={...extra.clips[state],file:'sprites/'+kind+'.png'};
  for(const variant of manifest.variants){const directory=variant==='original'?manifest.original.directory:'';await mkdir(path.join(target,directory,'sprites'),{recursive:true});await cp(path.join(source,'original',extra.clips[state].file),path.join(target,directory,manifest.clips[kind].file));}
}
manifest.contentRevision=createHash('sha256').update(await readFile(path.join(target,manifest.original.directory,manifest.clips.click.file))).update(await readFile(path.join(target,manifest.original.directory,manifest.clips.pet.file))).digest('hex');
await writeFile(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2));
await cp(path.join(source,'provenance.json'),path.join(target,'interaction-provenance.json'));
const report=await validateAppearance(target);if(!report.valid||!report.complete)throw new Error(report.errors.join('; '));
console.log(JSON.stringify({target,valid:report.valid,variants:manifest.variants,clips:Object.keys(manifest.clips)}));
