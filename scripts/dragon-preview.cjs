const {app,BrowserWindow}=require('electron');
const {mkdir,writeFile}=require('node:fs/promises');
const path=require('node:path');
app.setPath('userData',path.resolve('artifacts/ui-review/dragon-preview-profile'));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{sandbox:true}});await win.loadFile(path.resolve('scripts/animation-qa.html'));
 const result=await win.webContents.executeJavaScript(`(async()=>{
  const {readyPixelAssets}=await import('../desktop/pixel-pet.js'),{paint,ORDER}=await import('../desktop/renderer.js'),{readyDragonState}=await import('../desktop/dragon-actions.js'),{clipDuration}=await import('../desktop/action-clips.js');
  await readyPixelAssets();const manifest=await (await fetch('../assets/chatgpt-dragon/actions-v1/manifest.json')).json();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=192;const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const sheet=document.createElement('canvas');sheet.width=1536;sheet.height=768;const grid=sheet.getContext('2d');grid.fillStyle='#242936';grid.fillRect(0,0,sheet.width,sheet.height);grid.imageSmoothingEnabled=false;
  const checks=[];let workingReference;
  for(const [row,state] of ORDER.entries()){
   await readyDragonState(state);const clip=manifest.clips[state];let time=0;const seen=new Set(),colors=new Set();
   for(const duration of clip.durations){
    paint(ctx,{settings:{character:'chatgpt-dragon'},current:{state}},time+duration/2,192,192);time+=duration;
    const rgba=ctx.getImageData(0,0,192,192).data;let opaque=0;
    for(let p=0;p<192*192;p++){
     const a=rgba[p*4+3],x=p%192,y=Math.floor(p/192);
     if(a!==0&&a!==255)throw new Error('soft alpha '+state);
     if(a){opaque++;if(x<12||x>=180||y<12||y>=180)throw new Error('unsafe margin '+state);colors.add([rgba[p*4],rgba[p*4+1],rgba[p*4+2]].join(','));}
    }
    if(opaque<3000)throw new Error('empty or incomplete '+state);seen.add(canvas.toDataURL());
   }
   if(seen.size<20)throw new Error('not enough distinct video frames '+state);
   if(colors.size>64)throw new Error('palette drift '+state);
   if(['done','error'].includes(state)){paint(ctx,{settings:{character:'chatgpt-dragon'},current:{state}},clipDuration(clip)+1,192,192);const held=canvas.toDataURL();paint(ctx,{settings:{character:'chatgpt-dragon'},current:{state}},60000,192,192);if(held!==canvas.toDataURL())throw new Error('completion replayed '+state);}
   paint(ctx,{settings:{character:'chatgpt-dragon'},current:{state}},state==='sleep'?4200:2000,192,192);if(state==='working')workingReference=canvas.toDataURL();grid.drawImage(canvas,row%4*384,Math.floor(row/4)*384,384,384);checks.push({state,uniqueFrames:seen.size,colors:colors.size});
  }
  // Revisit evicted sheets; idle stays available during loading.
  await readyDragonState('working');paint(ctx,{settings:{character:'chatgpt-dragon'},current:{state:'working'}},2000,192,192);
  const reloaded=canvas.toDataURL();if(reloaded!==workingReference)throw new Error('evicted state did not reload identically');
  paint(ctx,{settings:{character:'chatgpt'},current:{state:'idle'}},0,192,192);const legacy=canvas.toDataURL();
  paint(ctx,{settings:{character:'chatgpt-dragon'},current:{state:'idle'}},0,192,192);const fresh=canvas.toDataURL();if(fresh===legacy)throw new Error('old and new GPT share imagery');
  return {checks,sheet:sheet.toDataURL(),legacy,fresh};
 })()`);
 await mkdir('artifacts/dragon-motion',{recursive:true});for(const name of ['sheet','legacy','fresh'])await writeFile('artifacts/dragon-motion/'+name+'.png',Buffer.from(result[name].split(',')[1],'base64'));
 await writeFile('artifacts/dragon-motion/results.json',JSON.stringify(result.checks,null,2));console.log(JSON.stringify(result.checks));app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
