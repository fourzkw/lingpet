import {clipCandidates,validClipSet,maxClipDuration} from '../../desktop/action-clips.js';
import {appearanceFingerprint} from '../creation/appearance-identity.js';
import {loadCustomAppearances} from '../creation/catalog.js';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,mkdtemp,rename,rm,realpath} from 'node:fs/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';
import pngjs from 'pngjs';
import {STATES,CreationStore} from '../creation/store.js';
import {validateAppearance} from '../creation/validation.js';
import {appearanceInfo} from '../characters.js';
import {PACKAGE_ROOT} from '../paths.js';
import {withInstallLock} from '../install-lock.js';
import {publishDirectory} from '../atomic-directory.js';
import {CLAUDE_CLIPS} from '../../desktop/claude-actions.js';
import {INTERACTION_KINDS} from '../animation-kinds.js';
const {PNG}=pngjs;
export const LIMITS={package:200*1024*1024,expanded:512*1024*1024,file:64*1024*1024,entries:163,pixels:16*1024*1024};
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
// Round frame boundaries, so fractional milliseconds do not accumulate timing drift.
export function integerDurations(values){
 if(!Array.isArray(values)||values.some(d=>!Number.isFinite(d)||d<1||d>10000))throw new Error('无效的导出帧时长');
 let elapsed=0,previous=0;
 return values.map(duration=>{elapsed+=duration;const end=Math.round(elapsed),value=end-previous;previous=end;return value;});
}
const idPattern=/^[a-z0-9][a-z0-9-]{2,63}$/;
export function metadata(value){
 if(!value||value.formatVersion!==1||!idPattern.test(value.id)||typeof value.version!=='string'||value.version.length>32||!/^\d+\.\d+\.\d+$/.test(value.version))throw new Error('无效的资源包 ID 或版本');
 for(const [key,max] of [['name',40],['author',100],['license',200],['description',2000]])if(typeof value[key]!=='string'||(!value[key].trim()&&key!=='description')||value[key].length>max)throw new Error('无效的资源包字段 '+key);
 return {formatVersion:1,id:value.id,name:value.name,author:value.author,license:value.license,description:value.description,version:value.version,minAppVersion:['0.4.9','0.5.0'].includes(value.minAppVersion)?value.minAppVersion:'0.4.0'};
}
export function resourceFiles(manifest){
 if(!manifest||manifest.schemaVersion!==1||!Array.isArray(manifest.variants)||!manifest.variants.length||manifest.variants.length>2||new Set(manifest.variants).size!==manifest.variants.length||manifest.variants.some(v=>!['original','pixel'].includes(v)))throw new Error('无效显示版本');
 if(!Number.isInteger(manifest.columns)||manifest.columns<1||manifest.columns>16)throw new Error('无效图集列数');
 if(!manifest.clips||STATES.some(s=>!manifest.clips[s])||Object.keys(manifest.clips).some(s=>![...STATES,...INTERACTION_KINDS].includes(s)))throw new Error('需要完整八动作，可附带点击和摸头互动');
 const files=new Set(['pet.json','manifest.json','cover.png']);
 for(const [state,group] of Object.entries(manifest.clips)){
  if(!validClipSet(group))throw new Error('无效候选动作 '+state);
  if(INTERACTION_KINDS.includes(state)&&clipCandidates(group).some(c=>c.loop!==false))throw new Error('互动动作需单次播放');
  for(const [index,clip] of clipCandidates(group).entries()){
  if(clip.file!==`sprites/${state}${index?'-'+index:''}.png`||!Number.isInteger(clip.sourceFrames)||clip.sourceFrames<1||clip.sourceFrames>128||!Array.isArray(clip.frames)||!clip.frames.length||clip.frames.length>256||!Array.isArray(clip.durations)||clip.frames.length!==clip.durations.length||clip.frames.some(f=>!Number.isInteger(f)||f<0||f>=clip.sourceFrames)||clip.durations.some(d=>!Number.isInteger(d)||d<1||d>10000)||typeof clip.loop!=='boolean'||!Number.isInteger(clip.loopFrom??0)||(clip.loopFrom??0)<0||(clip.loopFrom??0)>=clip.frames.length)throw new Error('无效动作 '+state);
  for(const v of manifest.variants){const tile=v==='original'?manifest.original?.tileSize:manifest.tileSize;if(!Number.isInteger(tile)||tile<16||tile>512||manifest.columns*tile*Math.ceil(clip.sourceFrames/manifest.columns)*tile>LIMITS.pixels)throw new Error('图集尺寸超限');if(v==='original'&&manifest.original.directory!=='original/')throw new Error('无效原图目录');files.add((v==='original'?'original/':'')+clip.file);}
 }}
 return files;
}
function readPNG(bytes,cover=false){
 if(bytes.length<33||bytes.toString('hex',0,8)!=='89504e470d0a1a0a'||bytes[24]!==8||bytes[25]!==6||bytes[28]!==0||bytes.readUInt32BE(16)*bytes.readUInt32BE(20)>(cover?1024*1024:LIMITS.pixels))throw new Error('需要尺寸受限的非交错 RGBA PNG');
 return PNG.sync.read(bytes,{checkCRC:true});
}
export async function readPetpack(bytes){
 if(bytes.length>LIMITS.package)throw new Error('资源包超过 200MiB');
 const files=new Map();let total=0;
 await new Promise((resolve,reject)=>yauzl.fromBuffer(bytes,{lazyEntries:true,validateEntrySizes:true},(error,zip)=>{
  if(error)return reject(error);const fail=e=>{zip.close();reject(e);};zip.on('error',fail);zip.on('end',resolve);
  zip.on('entry',entry=>{
   const name=entry.fileName,mode=(entry.externalFileAttributes>>>16)&0xf000;
   if(files.has(name)||files.size>=LIMITS.entries||! /^(?:pet\.json|manifest\.json|cover\.png|(?:original\/)?sprites\/(?:idle|thinking|working|input|approval|done|error|sleep|click|pet)(?:-[1-7])?\.png)$/.test(name)||mode===0xa000||(entry.generalPurposeBitFlag&1)||entry.uncompressedSize>LIMITS.file||(name.endsWith('.json')&&entry.uncompressedSize>(name==='manifest.json'?512*1024:65536))||(total+=entry.uncompressedSize)>LIMITS.expanded)return fail(new Error('资源包包含非法、重复或超限文件'));
   zip.openReadStream(entry,(e,stream)=>{if(e)return fail(e);const chunks=[];let n=0;stream.on('error',fail);stream.on('data',chunk=>{n+=chunk.length;if(n>entry.uncompressedSize||n>LIMITS.file){stream.destroy(new Error('解压体积超限'));return;}chunks.push(chunk);});stream.on('end',()=>{files.set(name,Buffer.concat(chunks));zip.readEntry();});});
  });zip.readEntry();
 }));
 if(!files.has('pet.json')||!files.has('manifest.json')||!files.has('cover.png'))throw new Error('缺少资源包清单或封面');
 const raw=JSON.parse(files.get('pet.json'));if(!['0.4.0','0.4.9','0.5.0'].includes(raw.minAppVersion))throw new Error('不支持的资源包兼容版本');const pet=metadata(raw),manifest=JSON.parse(files.get('manifest.json')),expected=resourceFiles(manifest);
 if(files.size!==expected.size||[...expected].some(f=>!files.has(f)))throw new Error('资源文件与清单不符');
 readPNG(files.get('cover.png'),true);
 for(const state of Object.keys(manifest.clips))for(const clip of clipCandidates(manifest.clips[state]))for(const v of manifest.variants){const tile=v==='original'?manifest.original.tileSize:manifest.tileSize,png=readPNG(files.get((v==='original'?'original/':'')+clip.file));if(png.width!==manifest.columns*tile||png.height!==Math.ceil(clip.sourceFrames/manifest.columns)*tile)throw new Error('图集尺寸与清单不符');}
 return {pet,manifest,files,sha256:sha256(bytes),size:bytes.length};
}
export async function exportPetpack({dataDir,pet,details}){
 const info=appearanceInfo(pet);let root,source;
 if(info.custom){const entry=await new CreationStore(dataDir).read('appearances',info.id);root=path.join(dataDir,'appearances',entry.id);source=entry.manifest;}
 else if(info.asset==='claude'){root=path.join(PACKAGE_ROOT,'assets/claude/actions-v2');source={schemaVersion:1,tileSize:128,columns:8,variants:['pixel'],clips:Object.fromEntries(STATES.map(state=>[state,{...CLAUDE_CLIPS[state],file:'atlas.png',sourceFrames:64}]))};}
 else{root=path.join(PACKAGE_ROOT,'assets',info.asset,'actions-v1');source=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));}
 let interactionRoot;
 if(!info.custom){interactionRoot=path.join(PACKAGE_ROOT,'assets/interactions',info.asset);try{const extra=JSON.parse(await readFile(path.join(interactionRoot,'manifest.json'),'utf8'));if(extra.columns!==source.columns||extra.tileSize!==source.tileSize||extra.original?.tileSize!==source.original?.tileSize)throw new Error('互动图集尺寸不匹配');source={...source,clips:{...source.clips,...Object.fromEntries(INTERACTION_KINDS.filter(k=>extra.clips[k]).map(k=>[k,extra.clips[k]]))}};}catch(e){if(e.code!=='ENOENT')throw e;}}
 const meta=metadata({formatVersion:1,id:details.id,name:details.name||info.name,author:details.author,license:details.license,description:details.description||'',version:details.version});
 const manifest=structuredClone(source);manifest.character=meta.id;manifest.variants=source.variants||['pixel',...(source.original?['original']:[])];if(manifest.variants.includes('original'))manifest.original={tileSize:source.original.tileSize,directory:'original/'};
 const files=new Map([['pet.json',Buffer.from(JSON.stringify(meta,null,2))]]);let cover;
 for(const state of Object.keys(source.clips)){const candidates=[];
  for(const [index,clip] of clipCandidates(source.clips[state]).entries()){
   const target=`sprites/${state}${index?'-'+index:''}.png`,copy={...clip,file:target,durations:integerDurations(clip.durations)};delete copy.alternatives;delete copy.selection;delete copy.name;candidates.push(copy);
   for(const v of manifest.variants){const resourceRoot=interactionRoot&&INTERACTION_KINDS.includes(state)?interactionRoot:root,base=await realpath(resourceRoot),file=await realpath(path.resolve(resourceRoot,v==='original'?source.original.directory:'',clip.file)),rel=path.relative(base,file);if(rel.startsWith('..')||path.isAbsolute(rel))throw new Error('资源路径越界');const bytes=await readFile(file);files.set((v==='original'?'original/':'')+target,bytes);
    if(state==='idle'&&index===0&&(!cover||v==='original')){const png=readPNG(bytes),tile=v==='original'?source.original.tileSize:source.tileSize,frame=clip.frames[0],image=new PNG({width:tile,height:tile});PNG.bitblt(png,image,frame%source.columns*tile,Math.floor(frame/source.columns)*tile,tile,tile,0,0);cover=PNG.sync.write(image,{colorType:6});}
   }
  }
  manifest.clips[state]=candidates[0];if(candidates.length>1){manifest.clips[state].alternatives=candidates.slice(1);manifest.clips[state].selection=source.clips[state].selection||'random';meta.minAppVersion='0.4.9';}
 }
 if(INTERACTION_KINDS.some(k=>manifest.clips[k]))meta.minAppVersion='0.5.0';
 files.set('pet.json',Buffer.from(JSON.stringify(meta,null,2)));
 files.set('manifest.json',Buffer.from(JSON.stringify(manifest,null,2)));files.set('cover.png',cover);resourceFiles(manifest);
 const zip=new yazl.ZipFile(),chunks=[];const result=new Promise((resolve,reject)=>{zip.outputStream.on('data',b=>chunks.push(b));zip.outputStream.on('error',reject);zip.outputStream.on('end',()=>resolve(Buffer.concat(chunks)));});for(const [name,bytes] of files)zip.addBuffer(bytes,name);zip.end();const bytes=await result;if(bytes.length>LIMITS.package)throw new Error('导出包过大');return {bytes,pet:meta,sha256:sha256(bytes),name:meta.id+'-'+meta.version+'.petpack'};
}
export async function installPetpack(dataDir,bytes,{expectedSHA256,expectedIdentity,source}={}){
 if(expectedSHA256&&sha256(bytes)!==expectedSHA256)throw new Error('下载内容与预期哈希不一致');
 const pack=await readPetpack(bytes);if(expectedIdentity&&(pack.pet.id!==expectedIdentity.id||pack.pet.version!==expectedIdentity.version))throw new Error('资源包作品 ID 或版本与市场条目不符');const namespace=source?.github?.repoId?`github:${source.github.repoId}`:`local:${pack.pet.author}`;const publisher=sha256(Buffer.from(namespace)).slice(0,12),character='community-'+sha256(Buffer.from(namespace+'/'+pack.pet.id)).slice(0,24);const store=new CreationStore(dataDir),id=`market-${publisher}-${pack.pet.id}-${pack.sha256.slice(0,12)}`;
 return withInstallLock(path.join(dataDir,'package-install.lock'),async()=>{
  const fingerprint=await appearanceFingerprint(pack.manifest,file=>{const bytes=pack.files.get(file);if(!bytes)throw new Error('缺少素材文件');return bytes;});
  const existing=(await loadCustomAppearances(dataDir)).find(e=>e.fingerprint===fingerprint);
  if(existing){const sources=[...(existing.marketSources||[existing.source].filter(Boolean))];if(source&&!sources.some(s=>s.market===source.market&&s.versionId===source.versionId))sources.push(source);
   const packageVersions=[...(existing.packageVersions||[existing.package].filter(Boolean))];if(!packageVersions.some(p=>p.id===pack.pet.id&&p.version===pack.pet.version))packageVersions.push(pack.pet);
   const merged={...existing,package:existing.package||pack.pet,packageVersions,sha256:existing.sha256||pack.sha256,source:existing.source||source,marketSources:sources};
   // Persist only the canonical entry. Original assets, projects and aliases remain intact.
   const {aliases,...saved}=merged;await store.write('appearances',saved);return {installed:true,existing:true,appearance:merged};}

  await mkdir(path.join(dataDir,'appearances'),{recursive:true});const temp=await mkdtemp(path.join(dataDir,'appearances','.incoming-'));let published=false,registered=false;let publishedRoot;
  try{
   for(const [file,bytes] of pack.files){const target=path.join(temp,file);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});}
   const report=await validateAppearance(temp);if(!report.valid||!report.complete)throw new Error(report.errors.join('; '));
   const root=path.join(dataDir,'appearances',id);await publishDirectory(temp,root);published=true;publishedRoot=root;
   const entry={id,character,community:true,characterName:pack.pet.name,name:pack.pet.name+' · '+pack.pet.version,asset:'custom:'+id,variants:pack.manifest.variants,pixelSize:pack.manifest.tileSize,doneMs:maxClipDuration(pack.manifest.clips.done)+100,manifest:pack.manifest,root,package:pack.pet,sha256:pack.sha256,source,createdAt:new Date().toISOString()};
   await store.write('appearances',entry);registered=true;return {installed:true,appearance:entry};
  }finally{const cleanup=published&&!registered?publishedRoot:!published?temp:null;if(cleanup){const relative=path.relative(path.resolve(dataDir,'appearances'),path.resolve(cleanup));if(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative))await rm(cleanup,{recursive:true,force:true});}}
 });
}
