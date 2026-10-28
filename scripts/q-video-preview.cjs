const {app,BrowserWindow}=require('electron');const {mkdir,writeFile}=require('node:fs/promises');const path=require('node:path');
app.setPath('userData',path.resolve('artifacts/ui-review/q-video-preview-profile'));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{sandbox:true}});await win.loadFile(path.resolve('scripts/animation-qa.html'));
 const result=await win.webContents.executeJavaScript(`(async()=>{
  const {readyPixelAssets}=await import('../desktop/pixel-pet.js'),{paint,ORDER}=await import('../desktop/renderer.js'),{readyQVideoState}=await import('../desktop/q-video-actions.js');await readyPixelAssets();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=384;const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const sheet=document.createElement('canvas');sheet.width=1536;sheet.height=1536;const grid=sheet.getContext('2d');grid.fillStyle='#242936';grid.fillRect(0,0,1536,1536);grid.imageSmoothingEnabled=false;
  const checks=[];let row=0;
  for(const [character,appearance,asset] of [['chatgpt','white-dragon-v2','chatgpt-q-v2'],['gemini','star-cat-v2','gemini-q-v2']]){
   for(const state of ORDER){
    const snapshots=[];
    for(const variant of ['original','pixel']){
     await readyQVideoState(asset,state,variant);const frames=new Set();let totalSoft=0,maxColors=0;
     for(const time of [0,500,1000,1500,2000,3000,4200,5000,7000]){
      paint(ctx,{settings:{character,appearance,variant},current:{state}},time,384,384);const rgba=ctx.getImageData(0,0,384,384).data,colors=new Set();let visible=0,soft=0;
      for(let p=0;p<rgba.length;p+=4){const a=rgba[p+3];if(a){visible++;if(a<255)soft++;colors.add([rgba[p],rgba[p+1],rgba[p+2]].join(','));const x=p/4%384,y=Math.floor(p/4/384);if(x<20||y<20||x>=364||y>=364)throw new Error('clipped '+asset+' '+state);if(rgba[p+1]>rgba[p]+30&&rgba[p+1]>rgba[p+2]+30)throw new Error('green fringe '+asset+' '+state);}}
      if(visible<12000)throw new Error('incomplete '+asset+' '+state);if(variant==='pixel'&&(soft||colors.size>64))throw new Error('bad pixel grid');totalSoft+=soft;maxColors=Math.max(maxColors,colors.size);frames.add(canvas.toDataURL());
     }
     if(frames.size<3)throw new Error('static animation '+asset+' '+state);if(variant==='original'&&(totalSoft<200||maxColors<256))throw new Error('original detail lost');
     paint(ctx,{settings:{character,appearance,variant},current:{state}},state==='sleep'?4200:2000,384,384);snapshots.push(canvas.toDataURL());
     checks.push({asset,state,variant,frames:frames.size,softEdges:totalSoft>0,maxColors});
    }
    if(snapshots[0]===snapshots[1])throw new Error('same original/pixel image');grid.drawImage(canvas,row%4*384,Math.floor(row/4)*384);row++;
   }
  }
  return {checks,sheet:sheet.toDataURL()};
 })()`);
 await mkdir('artifacts/q-video',{recursive:true});await writeFile('artifacts/q-video/states.png',Buffer.from(result.sheet.split(',')[1],'base64'));await writeFile('artifacts/q-video/results.json',JSON.stringify(result.checks,null,2));console.log(JSON.stringify(result.checks));app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
