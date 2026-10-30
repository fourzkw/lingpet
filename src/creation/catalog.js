import {storedAppearanceFingerprint} from './appearance-identity.js';
import {normalizePackageCharacter} from './package-character.js';
import {clipCandidates,maxClipDuration} from '../../desktop/action-clips.js';
import path from 'node:path';
import {readFile,realpath} from 'node:fs/promises';
import {CreationStore,safeId} from './store.js';
import {validateAppearance} from './validation.js';
import {CHARACTER_IDS,BUILTIN_CHARACTERS,appearanceName} from '../characters.js';
export async function loadCustomAppearances(dir){
  const store=new CreationStore(dir),roles=await store.list('characters');
  const entries=await store.list('appearances'),valid=[];
  for(const stored of entries){
    const normalized=normalizePackageCharacter(stored),entry={...normalized,name:appearanceName(normalized)};
    if(!roles.some(r=>r.id===entry.character)&&!CHARACTER_IDS.includes(entry.character)&&!BUILTIN_CHARACTERS.some(c=>c.id===entry.character)&&!(entry.community&&/^community-[a-z0-9-]{3,64}$/.test(entry.character)))continue;
    const root=path.join(dir,'appearances',safeId(entry.id));
    const report=await validateAppearance(root);if(report.valid&&report.complete)valid.push({...entry,root,manifest:report.manifest,doneMs:maxClipDuration(report.manifest.clips.done)+100});
  }
  const grouped=new Map();
  // Prefer the author's editable local creation, then the earliest installed copy.
  valid.sort((a,b)=>Number(!!b.projectId)-Number(!!a.projectId)||Number(b.character.startsWith('custom-'))-Number(a.character.startsWith('custom-'))||(a.createdAt||'').localeCompare(b.createdAt||'')||a.id.localeCompare(b.id));
  for(const entry of valid){const fingerprint=await storedAppearanceFingerprint(entry.root,entry.manifest),existing=grouped.get(fingerprint);
   if(!existing){grouped.set(fingerprint,{...entry,fingerprint,aliases:entry.aliases||[],marketSources:entry.marketSources||[entry.source].filter(Boolean)});continue;}
   existing.aliases.push({id:entry.id,character:entry.character},...(entry.aliases||[]));
   existing.packageVersions=[...(existing.packageVersions||[existing.package].filter(Boolean)),...(entry.packageVersions||[entry.package].filter(Boolean))].filter((p,i,all)=>all.findIndex(v=>v.id===p.id&&v.version===p.version)===i);
   existing.marketSources.push(...(entry.marketSources||[entry.source].filter(Boolean)));
   if(!existing.package&&entry.package){existing.package=entry.package;existing.sha256=entry.sha256;existing.source=entry.source;}
  }
  return [...grouped.values()];
}
export function publicAppearances(entries){return entries.map(({root,...entry})=>entry);}
export async function appearanceSheet(entries,{appearanceId,state,variant,candidate=0}){
  const entry=entries.find(a=>a.id===appearanceId);if(!entry||!entry.variants.includes(variant)||!entry.manifest.clips[state])throw new Error('未知形象或动作');
  if(!Number.isInteger(candidate)||candidate<0||candidate>=clipCandidates(entry.manifest.clips[state]).length)throw new Error('未知候选动作');
  const clip=clipCandidates(entry.manifest.clips[state])[candidate],directory=variant==='original'?entry.manifest.original.directory:'';
  const base=await realpath(entry.root),file=await realpath(path.join(entry.root,directory,clip.file)),relative=path.relative(base,file);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('资源路径越界');
  return 'data:image/png;base64,'+(await readFile(file)).toString('base64');
}
