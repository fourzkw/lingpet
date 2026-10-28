// Authored pose clips. Body motion comes from the sprite frames, never image warps.
import {clipFrame} from './action-clips.js';
export {clipDuration,clipFrame} from './action-clips.js';
export const CLAUDE_CLIPS={
  input:{name:'挥手',frames:[0,1,2,3,4,3,4,5,6,7],durations:[280,110,110,120,120,120,120,110,120,500],loop:true},
  working:{name:'持续打字',frames:[8,9,10,11,12,13,14,15],durations:[100,90,90,90,100,90,90,90],loop:true},
  done:{name:'庆祝跳跃',frames:[16,17,18,19,20,21,22,23],durations:[120,120,80,100,160,100,130,260],loop:false},
  idle:{name:'观察与眨眼',frames:[24,25,26,27,28,29,30,31],durations:[800,240,260,240,100,120,200,700],loop:true},
  thinking:{name:'思考与挠头',frames:[32,33,34,35,36,37,36,38,39],durations:[200,120,180,250,160,200,140,240,500],loop:true,loopFrom:2},
  approval:{name:'举盾等待',frames:[40,41,42,43,44,45,46,47],durations:[160,140,160,400,200,400,120,650],loop:true,loopFrom:3},
  error:{name:'受惊与恢复',frames:[48,49,50,51,52,53,54,55],durations:[100,120,120,120,120,200,200,800],loop:false},
  sleep:{name:'入睡与休眠',frames:[56,57,58,59,60,61,62,63],durations:[200,240,250,260,650,650,700,750],loop:true,loopFrom:4},
};

let atlas;
const frames=new Map();
function getAtlas(){
  if(!atlas){atlas=new Image();atlas.src=new URL('../assets/claude/actions-v2/atlas.png',import.meta.url).href;}
  return atlas;
}
export async function readyClaudeActions(){await getAtlas().decode();}

export function paintClaudeAction(ctx,state,elapsed,width,height){
  const clip=CLAUDE_CLIPS[state];if(!clip)return false;
  const image=getAtlas();if(!image.complete||!image.naturalWidth)return false;
  const index=clipFrame(clip,elapsed);
  let sprite=frames.get(index);
  if(!sprite){
    sprite=new OffscreenCanvas(128,128);
    sprite.getContext('2d').drawImage(image,index%8*128,Math.floor(index/8)*128,128,128,0,0,128,128);
    frames.set(index,sprite);
  }
  // Compose independent effect layers on the same 128px grid as the authored poses.
  const layer=new OffscreenCanvas(128,128),art=layer.getContext('2d');
  art.drawImage(sprite,0,0);
  const tick=Math.floor(Math.max(0,elapsed)/80);
  if(state==='working'){
    // Keyboard activity marks move independently of the alternating hand poses.
    art.fillStyle='#ffda83';art.fillRect(40+(tick%3)*22,113,8,1);
  }
  if(state==='input'&&index>=2&&index<=5&&tick%4<3){
    art.fillStyle='#ffd26f';art.fillRect(111,30,2,6);art.fillRect(116,37,5,2);
  }
  if(state==='done'&&elapsed>=320&&elapsed<1000){
    for(let i=0;i<9;i++){
      art.fillStyle=['#ffcf70','#f19b81','#82d1c4'][i%3];
      art.fillRect(12+i*13,16+(tick*3+i*9)%43,2,i%2?3:2);
    }
  }
  if(state==='thinking'&&index>=34){
    for(let i=0;i<3;i++){
      art.fillStyle=i===Math.floor(tick/3)%3?'#ffda83':'#a88065';
      art.fillRect(94+i*6,28,2,2);
    }
  }
  if(state==='approval'&&index>=43&&tick%12<3){
    art.fillStyle='#fff0bb';art.fillRect(70,77,2,5);art.fillRect(68,79,6,1);
  }
  if(state==='error'&&elapsed>=240&&elapsed<1100){
    art.fillStyle='#91cee8';art.fillRect(102,50+tick%4,2,5);art.fillRect(101,54+tick%4,4,2);
  }
  if(state==='sleep'&&index>=60){
    art.fillStyle='#b9cbdc';
    for(let i=0;i<3;i++){
      const x=94+i*7,y=45-i*10-Math.floor(tick/5)%4;
      art.fillRect(x,y,5,1);art.fillRect(x+3,y+1,1,1);art.fillRect(x+2,y+2,1,1);art.fillRect(x+1,y+3,1,1);art.fillRect(x,y+4,5,1);
    }
  }
  const size=Math.floor(Math.min(width,height));
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(layer,Math.floor((width-size)/2),Math.floor((height-size)/2),size,size);
  return true;
}
