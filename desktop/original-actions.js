import {clipFrame} from './action-clips.js';
import {COMPANION_CLIPS} from './companion-actions.js';
import {CHATGPT_CLIPS} from './chatgpt-motion.js';
const images=new Map(),pending=new Map();
export async function readyOriginalAction(asset){
  if(images.has(asset))return;if(pending.has(asset))return pending.get(asset);
  const task=(async()=>{const image=new Image();image.src=new URL('../assets/'+asset+'/actions-v1/atlas.png',import.meta.url).href;await image.decode();images.set(asset,image);})();
  pending.set(asset,task);try{await task;}finally{pending.delete(asset);}
}
export function paintOriginalAction(ctx,asset,state,elapsed,width,height){
  const image=images.get(asset);if(!image){void readyOriginalAction(asset).catch(()=>{});return false;}
  const clips=asset==='chatgpt'?CHATGPT_CLIPS:COMPANION_CLIPS,clip=clips[state]??clips.idle,index=clipFrame(clip,elapsed);
  const x=Math.round(index%8*image.naturalWidth/8),y=Math.round(Math.floor(index/8)*image.naturalHeight/8);
  const right=Math.round((index%8+1)*image.naturalWidth/8),bottom=Math.round((Math.floor(index/8)+1)*image.naturalHeight/8);
  const size=Math.floor(Math.min(width,height)),inset=size/16,draw=size-inset*2;
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(image,x,y,right-x,bottom-y,(width-size)/2+inset,(height-size)/2+inset,draw,draw);return true;
}
