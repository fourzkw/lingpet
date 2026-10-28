import {createVideoPlayer} from './video-player.js';
import {maxClipDuration} from './action-clips.js';
import claude from '../assets/interactions/claude/manifest.js';
import whale from '../assets/interactions/deepseek-h3/manifest.js';
import whiteDragon from '../assets/interactions/chatgpt-white-dragon-h3/manifest.js';
import cloudDragon from '../assets/interactions/chatgpt-dragon/manifest.js';

const manifests={claude,'deepseek-h3':whale,'chatgpt-white-dragon-h3':whiteDragon,'chatgpt-dragon':cloudDragon};
const players=new Map();
const custom=new Map();
export function syncInteractionAssets(entries=[]){
  const active=new Set(entries.map(e=>e.asset));for(const key of custom.keys())if(!active.has(key)){custom.delete(key);players.delete(key);}
  for(const entry of entries){const version=JSON.stringify(entry.manifest);if(custom.get(entry.asset)?.version===version)continue;custom.set(entry.asset,{manifest:entry.manifest,version});players.set(entry.asset,createVideoPlayer(null,entry.manifest,{loadImage:(state,variant,candidate)=>window.pet.appearanceSheet({appearanceId:entry.id,state,variant,candidate})}));}
}
function manifestFor(asset){return manifests[asset]??custom.get(asset)?.manifest;}
export function interactionDuration(asset,kind){
  const clip=manifestFor(asset)?.clips[kind];return clip?maxClipDuration(clip):null;
}
function playerFor(asset){
  if(!manifestFor(asset))return null;
  if(!players.has(asset))players.set(asset,createVideoPlayer(new URL(`../assets/interactions/${asset}/`,import.meta.url),manifests[asset]));
  return players.get(asset);
}
export function readyInteraction(asset,kind,variant='pixel'){
  const manifest=manifestFor(asset);
  if(!manifest)return Promise.resolve();
  return playerFor(asset).readyState(kind,manifest.variants.includes(variant)?variant:manifest.variants[0]);
}
export function paintInteraction(ctx,asset,kind,elapsed,width,height,variant,entryKey){
  const manifest=manifestFor(asset);if(!manifest?.clips[kind])return false;
  playerFor(asset).paint(ctx,kind,elapsed,width,height,manifest.variants.includes(variant)?variant:manifest.variants[0],entryKey);
  return true;
}
