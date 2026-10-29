import {readFile,stat,mkdir,cp,writeFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {BUILTIN_CHARACTERS} from './characters.js';
import {CreationStore} from './creation/store.js';
import {validateAppearance} from './creation/validation.js';
import {publishDirectory} from './atomic-directory.js';

const skins=BUILTIN_CHARACTERS.flatMap(c=>c.appearances.map(a=>({...a,character:c.id})));
export async function availableBuiltinAssets(root){
 const result=[];
 for(const skin of skins){const file=skin.asset==='claude'?'assets/claude/actions-v2/atlas.png':`assets/${skin.asset}/actions-v1/manifest.json`;try{await stat(path.join(root,file));result.push(skin.asset);}catch(error){if(error.code!=='ENOENT')throw error;}}
 return result;
}
export async function retainExternalAppearances(dir,available,{roots=[]}={}){
 let raw;for(const name of ['settings.json','settings.json.bak']){try{raw=JSON.parse(await readFile(path.join(dir,name),'utf8'));break;}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}}
 if(!raw)return [];
 const pets=Array.isArray(raw.pets)?raw.pets:[raw],needed=new Map();
 for(const pet of pets){let character=pet.character,appearance=pet.appearance;if(character==='gemini'||character==='chatgpt-dragon'){character='chatgpt';appearance='cloud-dragon';}if(appearance==='whale-classic')appearance='whale';
  const skin=skins.find(a=>a.character===character&&(a.id===appearance||!appearance));if(skin&&!available.includes(skin.asset))needed.set(skin.id,skin);
 }
 if(!needed.size)return [];
 try{const active=JSON.parse(await readFile(path.join(dir,'shared/active.json'),'utf8'));for(const name of [active.previous,active.active])if(typeof name==='string'&&/^[\w.-]+$/.test(name))roots.push(path.join(dir,'shared/releases',name));}catch(error){if(error.code!=='ENOENT')throw error;}
 const store=new CreationStore(dir),retained=[];
 await store.lock(async()=>{for(const skin of needed.values()){
  const target=path.join(dir,'appearances',skin.id),existing=(await store.list('appearances')).find(e=>e.id===skin.id);
  if(existing&&existing.character!==skin.character)throw Error('旧形象迁移遇到同名自定义形象，现有设置未修改：'+skin.id);
  const prior=await validateAppearance(target);
  if(prior.valid&&prior.complete){if(!existing)await store.write('appearances',{id:skin.id,asset:'custom:'+skin.id,character:skin.character,name:skin.name,variants:prior.manifest.variants||['pixel','original'],pixelSize:prior.manifest.tileSize,createdAt:new Date().toISOString(),retainedBuiltin:true});continue;}
  let source;
  for(const root of roots){try{await stat(path.join(root,'assets',skin.asset,'actions-v1/manifest.json'));source=root;break;}catch(error){if(error.code!=='ENOENT')throw error;}}
  if(!source)throw new Error(`缺少旧形象「${skin.name}」的素材。请恢复旧运行时缓存后升级；现有设置未修改。`);
  const base=path.join(source,'assets',skin.asset,'actions-v1'),extra=path.join(source,'assets/interactions',skin.asset);
  const manifest=JSON.parse(await readFile(path.join(base,'manifest.json'),'utf8'));manifest.variants??=['pixel',...(manifest.original?['original']:[])];
  let interactions;try{interactions=JSON.parse(await readFile(path.join(extra,'manifest.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const clips={...manifest.clips,...Object.fromEntries(['click','pet'].filter(k=>interactions?.clips[k]).map(k=>[k,interactions.clips[k]]))};manifest.clips=clips;
  const stage=target+'-staging-'+randomUUID();await mkdir(stage,{recursive:true});
  for(const [state,clip] of Object.entries(clips))for(const candidate of [clip,...(clip.alternatives||[])])for(const variant of manifest.variants){
   const rel=path.posix.normalize(path.posix.join(variant==='original'?manifest.original.directory:'',candidate.file));if(rel.startsWith('../')||path.posix.isAbsolute(rel)||rel.includes('\\'))throw Error('旧形象资源路径越界');
   const folder=await realpath(['click','pet'].includes(state)?extra:base),file=await realpath(path.join(folder,rel)),relative=path.relative(folder,file);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('旧形象资源路径越界');
   await mkdir(path.dirname(path.join(stage,rel)),{recursive:true});await cp(file,path.join(stage,rel));
  }
  await writeFile(path.join(stage,'manifest.json'),JSON.stringify(manifest));const report=await validateAppearance(stage);if(!report.valid||!report.complete)throw Error('旧形象迁移校验失败：'+report.errors.join('; '));
  await mkdir(path.dirname(target),{recursive:true});await publishDirectory(stage,target);
  await store.write('appearances',{id:skin.id,asset:'custom:'+skin.id,character:skin.character,name:skin.name,variants:manifest.variants,pixelSize:manifest.tileSize,createdAt:new Date().toISOString(),retainedBuiltin:true});retained.push(skin.id);
 }});
 return retained;
}
