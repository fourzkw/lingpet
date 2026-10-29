import {setCustomAppearances,configureBundledAssets} from '../src/characters.js';
import {createVideoPlayer} from './video-player.js';
import {syncInteractionAssets} from './interaction-actions.js';
const players=new Map(),versions=new Map();let revision='';
export function syncCustomAppearances(entries=[],roles=[],bundledAssets){
  const key=JSON.stringify([entries.map(e=>[e.id,e.taskId,e.manifest]),roles,bundledAssets]);if(key===revision)return false;revision=key;if(bundledAssets)configureBundledAssets(bundledAssets);setCustomAppearances(entries,roles);
  syncInteractionAssets(entries);
  const assets=new Set(entries.map(e=>e.asset));for(const asset of players.keys())if(!assets.has(asset)){players.delete(asset);versions.delete(asset);}
  for(const entry of entries){const version=JSON.stringify([entry.taskId,entry.manifest]);if(versions.get(entry.asset)===version)continue;
    players.set(entry.asset,createVideoPlayer(null,entry.manifest,{loadImage:(state,variant,candidate)=>window.pet.appearanceSheet({appearanceId:entry.id,state,candidate,variant:entry.variants.includes(variant)?variant:entry.variants[0]})}));versions.set(entry.asset,version);
  }
  return true;
}
export function paintCustomAppearance(ctx,asset,state,elapsed,width,height,variant,entryKey){const player=players.get(asset);if(!player)return false;player.paint(ctx,state,elapsed,width,height,variant,entryKey);return true;}
export async function readyCustomAppearance(asset,state,variant){const player=players.get(asset);if(!player)throw new Error('未知自定义形象');await player.readyState(state,variant);}
