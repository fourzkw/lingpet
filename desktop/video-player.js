import {clipFrame,clipCandidates,createClipSelector} from './action-clips.js';

export function createVideoPlayer(root,manifest,{loadImage,random}={}){
  const baseVariant=manifest.variants&&!manifest.variants.includes('pixel')?'original':'pixel';
  const selectors=new WeakMap();
  let ready;const images=new Map(),pending=new Map(),failed=new Set();
  const keyFor=(state,variant,index)=>`${variant}:${state}:${index}`;
  function load(state,variant=baseVariant,index=0){
    const key=keyFor(state,variant,index),clip=clipCandidates(manifest.clips[state])[index];
    if(images.has(key)){const image=images.get(key);images.delete(key);images.set(key,image);return Promise.resolve(image);}
    if(pending.has(key))return pending.get(key);
    const job=(async()=>{
      const image=new Image();image.src=loadImage?await loadImage(state,variant,index):new URL((variant==='original'?manifest.original.directory:'')+clip.file,root).href;await image.decode();images.set(key,image);
      while(images.size>6){const oldest=[...images.keys()].find(item=>item!==keyFor('idle',baseVariant,0)&&item!==key);if(!oldest)break;images.delete(oldest);}
      return image;
    })();
    pending.set(key,job);job.then(()=>pending.delete(key),()=>{pending.delete(key);failed.add(key);});return job;
  }
  function ensureReady(){return ready??=load('idle');}
  async function readyState(state,variant=baseVariant){await ensureReady();await load('idle',variant);await load(manifest.clips[state]?state:'idle',variant);}
  function paint(ctx,state,elapsed,width,height,variant=baseVariant,entryKey){
    if(!images.has(keyFor('idle',baseVariant,0))){void ensureReady().catch(()=>{});return;}
    if(!selectors.has(ctx))selectors.set(ctx,createClipSelector({random}));
    const requested=manifest.clips[state]?state:'idle',selection=selectors.get(ctx)(requested,manifest.clips[requested],elapsed,entryKey),key=keyFor(requested,variant,selection.index);
    // Load just the chosen sheet, rather than decoding every candidate eagerly.
    if(!images.has(key)&&!failed.has(key))void load(requested,variant,selection.index).catch(()=>{});
    const loaded=images.has(key),actual=loaded?variant:baseVariant,clip=loaded?selection.clip:manifest.clips.idle;
    const frame=clipFrame(clip,loaded?selection.elapsed:0),tile=actual==='original'?manifest.original.tileSize:manifest.tileSize;
    const size=Math.floor(Math.min(width,height));ctx.imageSmoothingEnabled=actual==='original';ctx.imageSmoothingQuality='high';
    ctx.drawImage(images.get(loaded?key:keyFor('idle',baseVariant,0)),frame%manifest.columns*tile,Math.floor(frame/manifest.columns)*tile,tile,tile,Math.floor((width-size)/2),Math.floor((height-size)/2),size,size);
  }
  return {ready:ensureReady,readyState,paint};
}
