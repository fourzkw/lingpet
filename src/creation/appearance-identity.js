import {createHash} from 'node:crypto';
import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {STATES} from './store.js';
import {clipCandidates} from '../../desktop/action-clips.js';
import {INTERACTION_KINDS} from '../animation-kinds.js';

// Identity is the rendered resources and playback, independent of publisher, ZIP
// encoding, metadata, and on-disk filenames. Names alone must never merge roles.
export async function appearanceFingerprint(manifest,read){
 const hash=createHash('sha256'),variants=[...(manifest.variants||['pixel',...(manifest.original?['original']:[])])].sort();
 hash.update(JSON.stringify({columns:manifest.columns,tileSize:manifest.tileSize,originalTileSize:manifest.original?.tileSize,variants}));
 for(const state of [...STATES,...INTERACTION_KINDS.filter(s=>manifest.clips[s])]){const group=manifest.clips[state];if(group.alternatives?.length)hash.update(JSON.stringify({selection:group.selection||'random',candidates:clipCandidates(group).length}));for(const c of clipCandidates(group)){hash.update(JSON.stringify({state,sourceFrames:c.sourceFrames,frames:c.frames,durations:c.durations,loop:c.loop,loopFrom:c.loopFrom||0}));
  for(const variant of variants){const file=(variant==='original'?(manifest.original.directory||''):'')+c.file;hash.update(variant);const bytes=await read(file);hash.update(createHash('sha256').update(bytes).digest());}
 }}
 return hash.digest('hex');
}
export async function storedAppearanceFingerprint(root,manifest){
 const base=await realpath(root);
 return appearanceFingerprint(manifest,async file=>{const target=await realpath(path.resolve(base,file)),rel=path.relative(base,target);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw new Error('资源路径越界');return readFile(target);});
}
export function resolveAppearanceAliases(pets,entries){
 for(const pet of pets||[]){const entry=entries.find(e=>e.id===pet.appearance||e.aliases?.some(a=>a.id===pet.appearance&&a.character===pet.character));if(entry){pet.character=entry.character;pet.appearance=entry.id;}}
 return pets;
}
