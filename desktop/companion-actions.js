import {clipFrame} from './action-clips.js';
import {CHATGPT_CLIPS,refineChatgptSprites} from './chatgpt-motion.js';
export const COMPANION_CLIPS={
  idle:{frames:[0,1,2,3,4,5,6,7],durations:[850,250,250,260,120,130,200,750],loop:true},
  thinking:{frames:[8,9,10,11,12,13,14,15],durations:[180,200,320,340,300,200,280,320],loop:true,loopFrom:2},
  working:{frames:[16,17,18,19,20,17,18,19],durations:[110,100,100,100,110,100,100,100],loop:true},
  input:{frames:[24,25,26,27,28,29,30,31],durations:[200,180,220,240,350,260,240,650],loop:true},
  approval:{frames:[32,33,34,35,36,37,38,39],durations:[180,180,220,450,450,500,140,650],loop:true,loopFrom:3},
  done:{frames:[40,41,42,43,44,45,46,47],durations:[120,130,140,150,180,160,180,350],loop:false},
  error:{frames:[48,49,50,51,52,53,54,55],durations:[160,200,350,260,300,350,400,650],loop:false},
  sleep:{frames:[56,57,58,59,60,61,62,63],durations:[300,350,350,450,700,750,750,750],loop:true,loopFrom:4},
};
const atlases=new Map(),sprites=new Map();
const companions=['chatgpt'];
function getAtlas(character){
  if(!atlases.has(character)){const image=new Image();image.src=new URL(`../assets/${character}/actions-v1/atlas.png`,import.meta.url).href;atlases.set(character,image);}
  return atlases.get(character);
}
// Rendering preparation preserves the original atlas. All pets render on the
// same 128px grid; generated sheets may have a non-integer source tile size.
function prepareSprite(image,index){
  const sprite=new OffscreenCanvas(128,128),ctx=sprite.getContext('2d',{willReadFrequently:true});
  const left=Math.round(index%8*image.naturalWidth/8),top=Math.round(Math.floor(index/8)*image.naturalHeight/8);
  const right=Math.round((index%8+1)*image.naturalWidth/8),bottom=Math.round((Math.floor(index/8)+1)*image.naturalHeight/8);
  ctx.imageSmoothingEnabled=false;ctx.drawImage(image,left,top,right-left,bottom-top,8,8,112,112);
  const pixels=ctx.getImageData(0,0,128,128),data=pixels.data;
  for(let i=0;i<data.length;i+=4){if(data[i+3]<200){data.fill(0,i,i+4);continue;}for(let c=0;c<3;c++)data[i+c]=Math.min(255,Math.round(data[i+c]/8)*8);data[i+3]=255;}
  // Discard isolated single-pixel matte specks, keeping the character and props.
  const seen=new Uint8Array(128*128),components=[];
  for(let p=0;p<seen.length;p++){
    if(seen[p]||!data[p*4+3])continue;
    const component=[p];seen[p]=1;
    for(let i=0;i<component.length;i++){const n=component[i],x=n%128,y=Math.floor(n/128);for(const next of [x>0?n-1:-1,x<127?n+1:-1,y>0?n-128:-1,y<127?n+128:-1]){if(next<0||seen[next]||!data[next*4+3])continue;seen[next]=1;component.push(next);}}
    components.push(component);
  }
  const minimum=Math.max(12,Math.max(...components.map(component=>component.length),0)*.012);
  for(const component of components)if(component.length<minimum)for(const n of component)data.fill(0,n*4,n*4+4);
  ctx.putImageData(pixels,0,0);return sprite;
}
export async function readyCompanionActions(){
  await Promise.all(companions.map(async character=>{
    const image=getAtlas(character);await image.decode();
    for(let i=0;i<64;i++)sprites.set(`${character}:${i}`,prepareSprite(image,i));
    if(character==='chatgpt'){
      const refined=refineChatgptSprites(Array.from({length:64},(_,i)=>sprites.get(`${character}:${i}`)));
      refined.forEach((sprite,i)=>sprites.set(`${character}:${i}`,sprite));return;
    }
    // Stable typing head/torso; only the independently drawn hands and keys vary.
    const first=sprites.get(`${character}:16`);
    for(let i=17;i<24;i++){const ctx=sprites.get(`${character}:${i}`).getContext('2d');ctx.clearRect(0,0,128,78);ctx.drawImage(first,0,0,128,78,0,0,128,78);}
  }));
}
export function paintCompanionAction(ctx,character,state,elapsed,width,height){
  if(!companions.includes(character))return false;
  const clips=character==='chatgpt'?CHATGPT_CLIPS:COMPANION_CLIPS;
  const clip=clips[state]??clips.idle,index=clipFrame(clip,elapsed),sprite=sprites.get(`${character}:${index}`);
  if(!sprite)return false;
  const size=Math.floor(Math.min(width,height));ctx.imageSmoothingEnabled=false;
  ctx.drawImage(sprite,Math.floor((width-size)/2),Math.floor((height-size)/2),size,size);return true;
}
