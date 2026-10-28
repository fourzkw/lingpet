import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {PACKAGE_ROOT} from '../src/paths.js';

export async function runInteractionAssetSmoke(win){
  const rendered=await win.webContents.executeJavaScript(`(async()=>{
    const {paint}=await import('./renderer.js'),{readyInteraction,interactionDuration}=await import('./interaction-actions.js');
    const choices=[['claude','classic','claude'],['deepseek','whale','deepseek-h3'],['chatgpt','white-dragon','chatgpt-white-dragon-h3'],['chatgpt','cloud-dragon','chatgpt-dragon']];
    const strip=document.createElement('canvas');strip.width=192*8;strip.height=216*14;const output=strip.getContext('2d');
    const canvas=document.createElement('canvas');canvas.width=canvas.height=192;const ctx=canvas.getContext('2d'),checks=[];let row=0;
    for(const [character,appearance,asset]of choices)for(const variant of (character==='claude'?['pixel']:['pixel','original']))for(const kind of ['click','pet']){
      await readyInteraction(asset,kind,variant);const duration=interactionDuration(asset,kind),frames=new Set();let minInk=Infinity,soft=0;
      for(let sample=0;sample<8;sample++){
        paint(ctx,{settings:{character,appearance,variant},current:{state:'working'},interaction:kind,animationKey:asset+kind},sample*duration/8,192,192);
        const pixels=ctx.getImageData(0,0,192,192).data;let ink=0;
        for(let i=3;i<pixels.length;i+=4){if(pixels[i]>0)ink++;if(pixels[i]>0&&pixels[i]<255)soft++;}
        minInk=Math.min(minInk,ink);frames.add(canvas.toDataURL());
        output.fillStyle=sample%2?'#f3eee8':'#20242b';output.fillRect(sample*192,row*216,192,192);output.drawImage(canvas,sample*192,row*216);
        output.fillStyle='#edbc99';output.font='11px sans-serif';output.fillText(asset+' '+kind+'/'+variant,sample*192+4,row*216+206);
      }
      checks.push({asset,kind,variant,duration,frames:frames.size,minInk,soft});row++;
    }
    return {checks,url:strip.toDataURL()};
  })()`);
  assert.equal(rendered.checks.length,14);
  for(const check of rendered.checks){
    assert.ok(check.frames>=3,check.asset+' '+check.kind+' actually animates');
    assert.ok(check.minInk>1000,check.asset+' remains visible in every sample');
    if(check.variant==='pixel')assert.equal(check.soft,0,'pixel rendering stays crisp');
  }
  const out=path.join(PACKAGE_ROOT,'artifacts/pet-interaction-smoke');await mkdir(out,{recursive:true});
  await writeFile(path.join(out,'dedicated-animations.png'),Buffer.from(rendered.url.split(',')[1],'base64'));
  await writeFile(path.join(out,'dedicated-render-results.json'),JSON.stringify(rendered.checks,null,2));
  return ['all 14 dedicated animation/variant combinations render moving transparent frames'];
}

export async function runPetInteractionSmoke(win){
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),contents=win.webContents;
  win.showInactive();
  await contents.executeJavaScript("import('./pet.js').then(()=>true)");await pause(150);
  const before=await contents.executeJavaScript('window.pet.get()');
  const durations=await contents.executeJavaScript(`(async()=>{
    const {appearanceInfo}=await import('../src/characters.js'),{interactionDuration}=await import('./interaction-actions.js');
    const data=await window.pet.get(),asset=appearanceInfo(data.settings).asset;
    return {click:interactionDuration(asset,'click')??1800,pet:interactionDuration(asset,'pet')??2200};
  })()`);
  // Find opaque head pixels in the decoded idle pose.
  const coordinates=await contents.executeJavaScript(`(()=>{
    const canvas=document.getElementById('sprite'),ctx=canvas.getContext('2d'),pixels=ctx.getImageData(0,0,512,512).data;
    const rows=[];for(let y=0;y<512;y++){const xs=[];for(let x=0;x<512;x++)if(pixels[(y*512+x)*4+3]>25)xs.push(x);if(xs.length)rows.push({y,xs});}
    const top=rows[0].y,bottom=rows.at(-1).y;
    const head=rows.filter(row=>row.y<=top+(bottom-top)*.35).sort((a,b)=>(b.xs.at(-1)-b.xs[0])-(a.xs.at(-1)-a.xs[0]))[0];
    const bounds=canvas.getBoundingClientRect(),size=Math.min(bounds.width,bounds.height);
    const convert=x=>({x:Math.round(bounds.left+(bounds.width-size)/2+x/512*size),y:Math.round(bounds.top+(bounds.height-size)/2+head.y/512*size)});
    return {left:convert(head.xs[Math.floor(head.xs.length*.15)]),right:convert(head.xs[Math.floor(head.xs.length*.85)])};
  })()`);
  const move=position=>contents.sendInputEvent({type:'mouseMove',...position});
  const click=position=>{move(position);contents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...position});contents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...position});};
  click(coordinates.left);await pause(100);
  assert.equal(await contents.executeJavaScript("document.getElementById('interaction').hidden"),false,'click displays a response');
  assert.match(await contents.executeJavaScript("document.getElementById('interaction').textContent"),/嗨|召唤|陪着/);
  const out=path.join(PACKAGE_ROOT,'artifacts/pet-interaction-smoke');await mkdir(out,{recursive:true});
  await writeFile(path.join(out,'click.png'),(await contents.capturePage()).toPNG());
  // Let the wave end before measuring the head in its idle pose again.
  await pause(durations.click+100);
  for(let i=0;i<8;i++){move(i%2?coordinates.right:coordinates.left);await pause(100);}
  assert.equal(await contents.executeJavaScript("document.getElementById('interaction').dataset.kind"),'pet','head strokes trigger affection');
  await writeFile(path.join(out,'pet.png'),(await contents.capturePage()).toPNG());
  const after=await contents.executeJavaScript('window.pet.get()');
  assert.deepEqual(after.settings,before.settings,'interaction does not alter pet configuration');
  assert.equal(after.current.state,before.current.state,'interaction does not replace session state');
  await pause(durations.pet+100);
  assert.equal(await contents.executeJavaScript("document.getElementById('interaction').hidden"),true,'reaction expires');
  return ['tap response, hover head strokes, automatic recovery and unchanged session/configuration'];
}
