import {createVideoPlayer} from './video-player.js';
import {CHARACTERS} from '../src/characters.js';
// Unfinished optional packs must not stop every existing pet's renderer loading.
const players=new Map(),pending=new Map();
for(const asset of ['chatgpt-q-v2'].filter(asset=>CHARACTERS.some(c=>c.appearances.some(a=>a.asset===asset)))){
  const root=new URL('../assets/'+asset+'/actions-v1/',import.meta.url);
  pending.set(asset,import(new URL('manifest.js',root).href).then(({default:manifest})=>players.set(asset,createVideoPlayer(root,manifest))).catch(()=>{}));
}
export function isQVideoAsset(asset){return players.has(asset);}
export async function readyQVideoState(asset,state='idle',variant='pixel'){
  await pending.get(asset);
  const player=players.get(asset);if(!player)throw new Error('Unknown video appearance');await player.readyState(state,variant);
}
export function paintQVideoAction(ctx,asset,state,elapsed,width,height,variant='pixel'){
  const player=players.get(asset);if(!player)return false;player.paint(ctx,state,elapsed,width,height,variant);return true;
}
