// Existing characters use 128px pose clips; the new dragon uses 192px video sprites.
// Display scaling preserves the pixel edges of each character's own grid.
import {paintClaudeAction,readyClaudeActions} from './claude-actions.js';
import {paintCompanionAction,readyCompanionActions} from './companion-actions.js';
import {paintDragonAction,readyDragonActions} from './dragon-actions.js';
import {paintQVideoAction} from './q-video-actions.js';
export const PIXEL_SIZE=128;
export const FRAME_MS=100;
export const FRAME_COUNT=32;
export const STATES=['idle','thinking','working','input','approval','done','error','sleep'];
const atlases=new Map(),bases=new Map(),cache=new Map();

export function animationFrame(elapsed){
  return Math.floor(Math.max(0,Number.isFinite(elapsed)?elapsed:0)/FRAME_MS)%FRAME_COUNT;
}
export function pixelateRGBA(data){
  const out=new Uint8ClampedArray(data.length);
  for(let i=0;i<data.length;i+=4){
    if(data[i+3]<128)continue;
    for(let c=0;c<3;c++)out[i+c]=Math.round(data[i+c]/8)*8;
    out[i+3]=255;
  }
  return out;
}
function influence(x,y,cx,cy,rx,ry){
  const d=((x-cx)/rx)**2+((y-cy)/ry)**2;
  return d<1?(1-d)**2:0;
}

// Pure raster deformation: every visible output color comes from the original art.
export function animatePixels(source,character,state,frame){
  const size=PIXEL_SIZE,out=new Uint8ClampedArray(source.length);
  const f=((frame%FRAME_COUNT)+FRAME_COUNT)%FRAME_COUNT;
  const phase=f*Math.PI*2/FRAME_COUNT,slow=Math.sin(phase),fast=Math.sin(phase*4);
  const deep=character==='deepseek';
  const lift=state==='done'?-Math.abs(Math.sin(phase*2))*4:0;
  const breath=state==='sleep'?slow*1.7:slow*.8;
  const blink=state==='idle'&&f>=26&&f<=29;
  const openness=f===27||f===28?.12:.5;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    let dx=0,dy=breath+lift;
    // Breathing expands the torso while the bottom of the original pose stays anchored.
    dy+=slow*(y-105)*(state==='sleep'?.025:.009);
    if(deep){
      dx+=slow*2*(influence(x,y,31,94,23,26)-influence(x,y,94,94,23,26));
      dy+=fast*1.8*influence(x,y,105,90,19,24); // original whale tail
    }
    const hands=deep?[[53,91],[72,91]]:[[31,86],[98,75]];
    for(let i=0;i<hands.length;i++){
      const [hx,hy]=hands[i],weight=influence(x,y,hx,hy,16,16);
      if(state==='working')dy+=fast*(i?3:-3)*weight;
      else if(state==='input'||state==='idle')dy+=slow*(i?1.7:-1.2)*weight;
      else if(state==='done')dy+=fast*(i?2:-2)*weight;
      else if(state==='thinking')dy+=slow*1.4*weight;
      else if(state==='approval')dy+=slow*1.2*weight;
    }
    if(state==='thinking')dy+=fast*1.5*influence(x,y,98,26,24,18);
    if(state==='input'||state==='approval')dy+=fast*1.8*influence(x,y,104,28,20,22);
    if(state==='done'){
      dx+=slow*2*influence(x,y,20,29,22,30);
      dy+=fast*2*influence(x,y,103,27,23,28);
    }
    if(state==='error'){
      dx+=fast*1.3*influence(x,y,64,77,48,30);
      dy+=slow*2*influence(x,y,104,34,20,28);
    }
    if(state==='sleep')dy+=slow*2*influence(x,y,106,37,20,32);
    let sx=Math.round(x-dx),sy=Math.round(y-dy);
    // Blink only the original eye patches. Face shape, eye colors and costume stay intact.
    if(blink){
      const eyes=deep?[[50,82,8,5],[73,81,8,5]]:[[42,67,5,10],[85,66,5,10]];
      for(const [ex,ey,rx,ry] of eyes)if(Math.abs(sx-ex)<=rx&&Math.abs(sy-ey)<=ry){
        const offset=sy-ey;
        sy=Math.abs(offset)>ry*openness?ey+ry+2:Math.round(ey+offset/openness);
        break;
      }
    }
    if(sx<0||sx>=size||sy<0||sy>=size)continue;
    const from=(sy*size+sx)*4,to=(y*size+x)*4;
    out[to]=source[from];out[to+1]=source[from+1];out[to+2]=source[from+2];out[to+3]=source[from+3];
  }
  return out;
}

function atlasFor(character){
  let atlas=atlases.get(character);
  if(!atlas){atlas=new Image();atlas.src=new URL(`../assets/${character}/states.png`,import.meta.url).href;atlases.set(character,atlas);}
  return atlas;
}
export async function readyPixelAssets(){
  await Promise.all([atlasFor('claude').decode(),readyClaudeActions(),readyCompanionActions(),readyDragonActions()]);
}
function baseFor(character,state){
  const key=`${character}:${state}`;
  if(bases.has(key))return bases.get(key);
  const atlas=atlasFor(character);
  if(!atlas.complete||!atlas.naturalWidth)return null;
  const index=Math.max(0,STATES.indexOf(state)),sw=atlas.naturalWidth/4;
  const sh=character==='claude'?atlas.naturalHeight*336/1024:atlas.naturalHeight/2;
  const sy=character==='claude'?atlas.naturalHeight*(index<4?120:560)/1024:Math.floor(index/4)*sh;
  const canvas=new OffscreenCanvas(PIXEL_SIZE,PIXEL_SIZE),ctx=canvas.getContext('2d',{willReadFrequently:true});
  const ratio=112/Math.max(sw,sh),w=Math.round(sw*ratio),h=Math.round(sh*ratio);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(atlas,index%4*sw,sy,sw,sh,Math.round((128-w)/2),Math.round((128-h)/2),w,h);
  const base=pixelateRGBA(ctx.getImageData(0,0,128,128).data);
  bases.set(key,base);return base;
}
export function paintPixelPet(ctx,character,state,elapsed,width,height){
  if(paintQVideoAction(ctx,character,state,elapsed,width,height))return;
  if(character==='chatgpt-dragon'){paintDragonAction(ctx,state,elapsed,width,height);return;}
  if(paintCompanionAction(ctx,character,state,elapsed,width,height))return;
  if(character==='claude'&&paintClaudeAction(ctx,state,elapsed,width,height))return;
  const kind='claude';
  const pose=STATES.includes(state)?state:'idle';
  const frame=animationFrame(elapsed),key=`${kind}:${pose}:${frame}`;
  let sprite=cache.get(key);
  if(!sprite){
    const base=baseFor(kind,pose);if(!base)return;
    sprite=new OffscreenCanvas(128,128);
    sprite.getContext('2d').putImageData(new ImageData(animatePixels(base,kind,pose,frame),128,128),0,0);
    if(cache.size>=512)cache.delete(cache.keys().next().value);
    cache.set(key,sprite);
  }
  const size=Math.floor(Math.min(width,height));
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(sprite,Math.floor((width-size)/2),Math.floor((height-size)/2),size,size);
}
