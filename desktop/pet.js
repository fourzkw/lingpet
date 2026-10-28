import {applyTheme} from './theme.js';
import {paint,frameLoop} from './renderer.js';
import {readyPixelAssets} from './pixel-pet.js';
import {nextCharacter,appearanceInfo} from '../src/characters.js';
import {createPetGestures,createPetReaction} from './pet-interaction.js';
import {interactionDuration,readyInteraction} from './interaction-actions.js';
import {REPLIES} from '../src/animation-kinds.js';
await readyPixelAssets();
const canvas=document.getElementById('sprite'),ctx=canvas.getContext('2d');
const gestures=createPetGestures(),reaction=createPetReaction(),bubble=document.getElementById('interaction');
let silhouette=null,silhouetteTime=-Infinity,reactionRequest=0;
let data=await window.pet.get(),start=performance.now()-Math.max(0,Date.now()-(data.animationStartedAt??Date.now())),previous=data.animationKey,dragging=false,ignored=false,menuOpen=false;
function update(value){applyTheme(value.global?.theme);const key=value.animationKey;if(key!==previous){start=performance.now()-Math.max(0,Date.now()-(value.animationStartedAt??Date.now()));previous=key;}data={...data,...value};document.getElementById('statusText').textContent=value.current.demo?'演示 · '+value.labels[value.current.state]:(value.current.label||value.labels[value.current.state]);document.getElementById('status').dataset.state=value.current.state;document.getElementById('status').style.visibility=value.settings.showLabel?'visible':'hidden';}
window.pet.onUpdate(update);update(data);
frameLoop(now=>{
  const frame=reaction.frame(now,data,now-start);paint(ctx,frame.data,frame.elapsed,512,512);
  const active=reaction.current(now,data);bubble.hidden=!active||data.settings.interactionHints===false;
  bubble.dataset.kind=active?.kind??'';
});

async function respond(kind){
  if(!['click','pet'].includes(kind))return;
  if(kind==='click'&&data.settings.clickResponse===false||kind==='pet'&&data.settings.headPat===false)return;
  const request=++reactionRequest,key=data.animationKey,skin=appearanceInfo(data.settings);
  try{await readyInteraction(skin.asset,kind,data.settings.variant);}
  catch(error){console.warn('专属互动动作加载失败',error.message);return;}
  if(request!==reactionRequest||key!==data.animationKey||dragging||menuOpen)return;
  const duration=interactionDuration(skin.asset,kind)??(kind==='pet'?Math.max(2200,skin.doneMs??1800):1800);
  reaction.start(kind,performance.now(),data,duration);
  bubble.textContent=REPLIES[kind][Math.floor(Math.random()*REPLIES[kind].length)];bubble.hidden=data.settings.interactionHints===false;
}

function point(event){
  const bounds=canvas.getBoundingClientRect();
  const size=Math.min(bounds.width,bounds.height),left=bounds.left+(bounds.width-size)/2,top=bounds.top+(bounds.height-size)/2;
  const x=Math.floor((event.clientX-left)/size*canvas.width),y=Math.floor((event.clientY-top)/size*canvas.height);
  const hit=x>=0&&x<canvas.width&&y>=0&&y<canvas.height&&ctx.getImageData(x,y,1,1).data[3]>25;
  const time=performance.now();
  // Follow the visible silhouette rather than a fixed rectangle: imported pets
  // have different margins. Only opaque pixels in its upper 42% count as head.
  if(hit&&time-silhouetteTime>250){
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let top=canvas.height,bottom=-1;
    for(let row=0;row<canvas.height;row++)for(let col=0;col<canvas.width;col++)if(pixels[(row*canvas.width+col)*4+3]>25){top=Math.min(top,row);bottom=row;break;}
    silhouette={top,bottom};silhouetteTime=time;
  }
  return {x:event.clientX,y:event.clientY,time,hit,head:data.settings.headPat!==false&&hit&&silhouette&&y<=silhouette.top+(silhouette.bottom-silhouette.top)*.42,button:event.button,buttons:event.buttons,scale:data.settings.scale,sensitivity:data.settings.patSensitivity};
}
document.getElementById('settings').onclick=()=>window.pet.showSettings();
document.getElementById('swap').onclick=()=>window.pet.settings({character:nextCharacter(data.settings.character)});
document.getElementById('hide').onclick=()=>window.pet.hide();
document.getElementById('pet').addEventListener('contextmenu',event=>{event.preventDefault();stop();menuOpen=true;ignored=false;window.pet.ignoreMouse(false);window.pet.showQuickControls();});
window.pet.onQuickControlsClosed(()=>{menuOpen=false;ignored=false;});
canvas.addEventListener('pointerdown',event=>{if(!gestures.down(point(event)))return;canvas.setPointerCapture(event.pointerId);});
canvas.addEventListener('pointermove',event=>{
  if(menuOpen)return;
  const action=gestures.move(point(event));
  if(action==='drag'){dragging=true;reactionRequest++;reaction.cancel();window.pet.drag(true);}
  else respond(action);
});
canvas.addEventListener('pointerup',event=>{
  if(event.button!==0)return;
  const action=gestures.up({time:performance.now()});
  if(dragging){dragging=false;window.pet.drag(false);}
  if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  respond(action);
});
function stop(){reactionRequest++;gestures.cancel();reaction.cancel();bubble.hidden=true;if(dragging){dragging=false;window.pet.drag(false);}}
canvas.addEventListener('pointercancel',stop);canvas.addEventListener('lostpointercapture',()=>{if(dragging)stop();});
canvas.addEventListener('pointerleave',()=>{if(!dragging)gestures.cancel();});window.addEventListener('blur',stop);
// Only character pixels and visible controls capture the pointer; blank desktop remains clickable.
window.addEventListener('mousemove',event=>{
  if(dragging||menuOpen)return;
  let hit=Boolean(event.target.closest('button'));
  hit||=point(event).hit;
  const ignore=!hit;if(ignore!==ignored){ignored=ignore;window.pet.ignoreMouse(ignore);}
});
