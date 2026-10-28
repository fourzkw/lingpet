// Load one idle sprite on demand; the cover stays visible if decoding fails.
let active=null,animation=0;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
function stop(){cancelAnimationFrame(animation);if(active)active.canvas.hidden=true;active=null;}
function frameAt(clip,elapsed){
 const duration=clip.durations.reduce((sum,value)=>sum+value,0);
 if(duration<=0)return clip.frames[0];
 const lead=clip.durations.slice(0,clip.loopFrom||0).reduce((sum,value)=>sum+value,0);
 if(elapsed>=duration){if(!clip.loop)return clip.frames.at(-1);elapsed=lead+(elapsed-duration)%Math.max(1,duration-lead);}
 for(let i=0;i<clip.frames.length;i++){if(elapsed<clip.durations[i])return clip.frames[i];elapsed-=clip.durations[i];}
 return clip.frames.at(-1);
}
function draw(now){
 if(!active)return;
 const {button,canvas,image,clip,columns,tile,start}=active;
 if(!button.isConnected||reducedMotion.matches||(!button.matches(':hover')&&document.activeElement!==button)){stop();return;}
 const index=frameAt(clip,now-start),context=canvas.getContext('2d');
 context.clearRect(0,0,384,384);context.imageSmoothingEnabled=active.original;
 context.drawImage(image,index%columns*tile,Math.floor(index/columns)*tile,tile,tile,0,0,384,384);
 canvas.hidden=false;animation=requestAnimationFrame(draw);
}
export function attachCardPreview(button,record){
 const meta=record.preview,clip=meta?.clips?.idle;
 if(!clip?.frames?.length)return;
 const original=meta.variants?.includes('original'),tile=original?meta.original?.tileSize:meta.tileSize;
 if(!tile||!meta.columns)return;
 const canvas=document.createElement('canvas');canvas.width=384;canvas.height=384;canvas.hidden=true;canvas.setAttribute('aria-hidden','true');button.append(canvas);
 let image,loading=false;
 async function start(){
  if(reducedMotion.matches||loading)return;
  if(!image){loading=true;try{image=new Image();image.src='/api/versions/'+record.id+'/preview/'+(original?'original/':'')+clip.file;await image.decode();}catch{image=null;return;}finally{loading=false;}}
  if(!button.isConnected||(!button.matches(':hover')&&document.activeElement!==button))return;
  stop();active={button,canvas,image,clip,columns:meta.columns,tile,original,start:performance.now()};draw(performance.now());
 }
 function leave(){if(active?.button===button&&!button.matches(':hover')&&document.activeElement!==button)stop();}
 button.addEventListener('pointerenter',start);button.addEventListener('focus',start);button.addEventListener('pointerleave',leave);button.addEventListener('blur',leave);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
