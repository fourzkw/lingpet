// ChatGPT's original sheet redraws the whole head between eye poses. Keep a
// registered body and use the eyelid patches only, with a short bilateral blink.
export const CHATGPT_EYES=[{x:47,y:74,w:16,h:10},{x:69,y:70,w:16,h:11}];
export const CHATGPT_CLIPS={
  idle:{frames:[0,4,5,4,0],durations:[4100,65,85,75,1500],loop:true},
  thinking:{frames:[8,9,10,11,10,11],durations:[180,200,900,850,950,900],loop:true,loopFrom:2},
  working:{frames:[16,17,18,19,20,17,18,19],durations:[140,120,130,125,140,130,125,130],loop:true},
  input:{frames:[24,25,26,27,26,27,30,31],durations:[180,170,220,220,220,220,180,1500],loop:true},
  approval:{frames:[32,33,34,34],durations:[180,200,1600,1800],loop:true,loopFrom:2},
  done:{frames:[40,41,42,43,44,45,46,47],durations:[130,110,130,140,160,150,140,600],loop:false},
  error:{frames:[48,49,50,50,49,54,55],durations:[180,180,320,200,220,400,700],loop:false},
  sleep:{frames:[56,57,58,59,60,61,62,63],durations:[400,500,550,650,1500,1600,1500,1600],loop:true,loopFrom:4},
};
function copy(source,dx=0,dy=0){const canvas=new OffscreenCanvas(128,128);canvas.getContext('2d').drawImage(source,dx,dy);return canvas;}
function replaceRegion(target,source,{x,y,w,h}){const ctx=target.getContext('2d');ctx.clearRect(x,y,w,h);ctx.drawImage(source,x,y,w,h,x,y,w,h);}
// Align the horns/hair silhouette above the eyes. Expressions and hands do not
// influence registration; no frame is stretched, rotated or cross-faded.
function registered(source,reference,limit=4){
  const pixels=source.getContext('2d').getImageData(0,0,128,128).data;
  const target=reference.getContext('2d').getImageData(0,0,128,128).data;
  let best=Infinity,offset=[0,0];
  for(let dy=-limit;dy<=limit;dy++)for(let dx=-limit;dx<=limit;dx++){
    let score=0;
    for(let y=22;y<67;y+=2)for(let x=35;x<94;x+=2){
      const sx=x-dx,sy=y-dy;if(sx<0||sx>=128||sy<0||sy>=128)continue;
      const a=(y*128+x)*4,b=(sy*128+sx)*4;
      if(Boolean(target[a+3])!==Boolean(pixels[b+3])){score+=500;continue;}
      if(!target[a+3])continue;
      for(let c=0;c<3;c++)score+=Math.abs(target[a+c]-pixels[b+c]);
    }
    score+=(Math.abs(dx)+Math.abs(dy))*.5;
    if(score<best){best=score;offset=[dx,dy];}
  }
  // Keep the transparent safety margin even for an intentionally raised pose.
  const result=copy(source,...offset),ctx=result.getContext('2d');ctx.clearRect(0,0,128,8);ctx.clearRect(0,120,128,8);ctx.clearRect(0,0,8,128);ctx.clearRect(120,0,8,128);return result;
}
export function refineChatgptSprites(input){
  const base=input[0],frames=input.map((sprite,index)=>index<56?registered(sprite,base,index>=40&&index<48?14:4):copy(sprite));
  // Idle varies only the two eyelids. The mouth, face outline and all hair stay
  // exactly identical, including the reopening half-lid frame (no wink).
  const half=frames[4],closed=frames[5];
  for(let i=0;i<8;i++)frames[i]=copy(base);
  for(const [index,eyes] of [[4,half],[5,closed]])for(const region of CHATGPT_EYES)replaceRegion(frames[index],eyes,region);
  // Hold a consistent face during hand actions rather than replaying unrelated
  // smiling/blinking expressions from the generated sheet.
  const face={x:46,y:70,w:40,h:18};
  for(const row of [8,24,32])for(let i=row;i<row+8;i++)replaceRegion(frames[i],base,face);
  // Keyboard and body remain fixed: only the hand region changes at the keys.
  const typing=frames[16];
  for(let i=17;i<24;i++){const hands=frames[i];frames[i]=copy(typing);replaceRegion(frames[i],hands,{x:45,y:94,w:42,h:19});}
  // One coherent hop from one joyful pose, then a soft landing to the same idle.
  const joy=registered(input[43],base,14);
  frames[40]=copy(base);frames[41]=copy(base,0,1);
  frames[43]=copy(joy,0,-5);frames[44]=copy(joy,0,-9);frames[45]=copy(joy,0,-3);
  frames[46]=copy(base,0,1);frames[47]=copy(base);
  frames[8]=copy(base);frames[48]=copy(base);frames[54]=copy(base);frames[55]=copy(base);
  frames[56]=copy(base);
  // Resting head and closed eyes keep the same drawing. A one-pixel breathing
  // offset avoids both redraw jitter and a seam through the sleeping body.
  const asleep=frames[60];for(let i=61;i<64;i++)frames[i]=copy(asleep,0,i===61||i===62?-1:0);
  return frames;
}
