import {clipFrame} from './action-clips.js';
import manifest from '../assets/chatgpt-dragon/actions-v1/manifest.js';

const root=new URL('../assets/chatgpt-dragon/actions-v1/',import.meta.url);
let ready;
const images=new Map(),pending=new Map(),failed=new Set();
// Each window keeps idle and at most two other decoded sheets.
function load(state,variant='pixel'){
  const key=variant+':'+state;
  if(images.has(key)){const image=images.get(key);images.delete(key);images.set(key,image);return Promise.resolve(image);}
  if(pending.has(key))return pending.get(key);
  const job=(async()=>{
    const image=new Image();image.src=new URL((variant==='original'?manifest.original.directory:'')+manifest.clips[state].file,root).href;await image.decode();
    images.set(key,image);
    while(images.size>3){const oldest=[...images.keys()].find(item=>!item.endsWith(':idle')&&item!==key);if(!oldest)break;images.delete(oldest);}
    return image;
  })();
  pending.set(key,job);job.then(()=>pending.delete(key),()=>{pending.delete(key);failed.add(key);});return job;
}
export function readyDragonActions(){
  return ready??=load('idle');
}
export async function readyDragonState(state,variant='pixel'){await readyDragonActions();await load('idle',variant);await load(manifest.clips[state]?state:'idle',variant);}
export function paintDragonAction(ctx,state,elapsed,width,height,variant='pixel'){
  if(!images.has('pixel:idle'))return;
  const requested=manifest.clips[state]?state:'idle';
  for(const state of new Set(['idle',requested]))if(!images.has(variant+':'+state)&&!failed.has(variant+':'+state))void load(state,variant).catch(()=>{});
  const active=images.has(variant+':'+requested)?requested:'idle',actual=images.has(variant+':'+active)?variant:'pixel',clip=manifest.clips[active];
  const frame=clipFrame(clip,active===requested?elapsed:0),tile=actual==='original'?manifest.original.tileSize:manifest.tileSize;
  const size=Math.floor(Math.min(width,height));ctx.imageSmoothingEnabled=actual==='original';ctx.imageSmoothingQuality='high';
  ctx.drawImage(images.get(actual+':'+active),frame%manifest.columns*tile,Math.floor(frame/manifest.columns)*tile,tile,tile,Math.floor((width-size)/2),Math.floor((height-size)/2),size,size);
}
