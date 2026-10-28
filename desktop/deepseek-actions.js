import {clipFrame} from './action-clips.js';
export const DEEPSEEK_CLIPS={
  idle:{name:'观察与眨眼',frames:[0,1,2,3,4,5,6,7],durations:[800,240,260,220,120,130,220,700],loop:true},
  thinking:{name:'托腮思考',frames:[8,9,10,11,12,13,14,15],durations:[200,150,240,300,200,260,240,500],loop:true,loopFrom:2},
  working:{name:'持续打字',frames:[16,17,18,19,20,21,22,23],durations:[100,90,90,90,100,90,90,90],loop:true},
  input:{name:'挥手等待',frames:[24,25,26,27,28,27,28,29,30,31],durations:[280,120,120,140,140,140,140,120,140,550],loop:true},
  approval:{name:'举盾等待',frames:[32,33,34,35,36,37,38,39],durations:[180,160,180,450,220,450,130,650],loop:true,loopFrom:3},
  done:{name:'开心庆祝',frames:[40,41,42,43,44,45,46,47],durations:[120,130,100,130,180,110,140,260],loop:false},
  // Raise hands, pause, then lower them along the same path; omit the opposing tilts and slump.
  error:{name:'受惊后平静恢复',frames:[48,49,50,49,54,55],durations:[180,200,420,200,340,900],loop:false},
  sleep:{name:'入睡与休眠',frames:[56,57,58,59,60,61,62,63],durations:[220,250,260,280,650,700,700,750],loop:true,loopFrom:4},
};
let atlas;
const frames=new Map();
function getAtlas(){
  if(!atlas){atlas=new Image();atlas.src=new URL('../assets/deepseek/actions-v1/atlas.png',import.meta.url).href;}
  return atlas;
}
export async function readyDeepseekActions(){await getAtlas().decode();}
export function paintDeepseekAction(ctx,state,elapsed,width,height){
  const clip=DEEPSEEK_CLIPS[state];if(!clip)return false;
  const image=getAtlas();if(!image.complete||!image.naturalWidth)return false;
  const index=clipFrame(clip,elapsed);
  let sprite=frames.get(index);
  if(!sprite){
    sprite=new OffscreenCanvas(128,128);
    sprite.getContext('2d').drawImage(image,index%8*128,Math.floor(index/8)*128,128,128,0,0,128,128);
    frames.set(index,sprite);
  }
  const layer=new OffscreenCanvas(128,128),art=layer.getContext('2d');
  art.drawImage(sprite,0,0);
  const tick=Math.floor(Math.max(0,elapsed)/80);
  if(state==='working'){
    art.fillStyle='#83d8f0';art.fillRect(43+(tick%3)*13,119,6,1);
  }
  if(state==='thinking'&&index>=10){
    for(let i=0;i<3;i++){
      art.fillStyle=i===Math.floor(tick/3)%3?'#a3e5ff':'#6587ba';
      art.fillRect(104+i*5,39,2,2);
    }
  }
  if(state==='input'&&index>=26&&index<=29&&tick%4<3){
    art.fillStyle='#9fe2ff';art.fillRect(110,55,2,5);art.fillRect(114,61,4,2);
  }
  if(state==='approval'&&index>=35&&tick%12<3){
    art.fillStyle='#fff0bb';art.fillRect(68,96,2,5);art.fillRect(66,98,6,1);
  }
  if(state==='done'&&elapsed>=350&&elapsed<1100){
    for(let i=0;i<8;i++){
      art.fillStyle=['#8cd7fa','#ffd47d','#b5a5ee'][i%3];
      art.fillRect(8+i*15,12+(tick*3+i*9)%29,2,i%2?3:2);
    }
  }
  if(state==='sleep'&&index>=60){
    art.fillStyle='#b2d3e9';
    for(let i=0;i<3;i++){
      const x=102+i*6,y=43-i*9-Math.floor(tick/5)%4;
      art.fillRect(x,y,4,1);art.fillRect(x+2,y+1,1,1);art.fillRect(x+1,y+2,1,1);art.fillRect(x,y+3,4,1);
    }
  }
  const size=Math.floor(Math.min(width,height));
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(layer,Math.floor((width-size)/2),Math.floor((height-size)/2),size,size);
  return true;
}
