const {app,BrowserWindow}=require('electron');
const {mkdir,writeFile}=require('node:fs/promises');const path=require('node:path');
app.setPath('userData',path.resolve('artifacts/ui-review/appearance-preview-profile'));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{sandbox:true}});await win.loadFile(path.resolve('scripts/animation-qa.html'));
 const result=await win.webContents.executeJavaScript(`(async()=>{
  const {readyPixelAssets}=await import('../desktop/pixel-pet.js'),{paint,ORDER}=await import('../desktop/renderer.js'),{readyDragonState}=await import('../desktop/dragon-actions.js'),{readyOriginalAction}=await import('../desktop/original-actions.js');await readyPixelAssets();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=384;const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const sheet=document.createElement('canvas');sheet.width=1536;sheet.height=768;const grid=sheet.getContext('2d');grid.fillStyle='#242936';grid.fillRect(0,0,1536,768);grid.imageSmoothingEnabled=false;
  const results=[];
  for(const state of ORDER){
   const snapshots=[];
   for(const variant of ['original','pixel']){
    await readyDragonState(state,variant);paint(ctx,{settings:{character:'chatgpt',appearance:'cloud-dragon',variant},current:{state}},state==='sleep'?4200:2000,384,384);
    const rgba=ctx.getImageData(0,0,384,384).data,colors=new Set();let visible=0,soft=0,green=0;
    for(let p=0;p<rgba.length;p+=4){if(rgba[p+3]){visible++;colors.add([rgba[p],rgba[p+1],rgba[p+2]].join(','));if(rgba[p+3]<255)soft++;if(rgba[p+1]>rgba[p]+30&&rgba[p+1]>rgba[p+2]+30)green++;}}
    if(visible<15000||green>0)throw new Error('invalid matte '+state+' '+variant);
    if(variant==='pixel'&&(soft||colors.size>64))throw new Error('pixel version altered '+state);
    if(variant==='original'&&(soft<50||colors.size<256))throw new Error('original lost detail '+state);
    snapshots.push(canvas.toDataURL());results.push({state,variant,visible,soft,colors:colors.size});
    if(state==='idle'||state==='working')grid.drawImage(canvas,(state==='idle'?0:2)*384+(variant==='pixel'?384:0),0);
   }
   if(snapshots[0]===snapshots[1])throw new Error('versions are identical '+state);
  }
  let slot=0;for(const character of ['chatgpt','gemini'])for(const variant of ['original','pixel']){
   if(variant==='original')await readyOriginalAction(character);
   paint(ctx,{settings:{character,variant},current:{state:'idle'}},0,384,384);grid.drawImage(canvas,slot++*384,384);
  }
  return {results,sheet:sheet.toDataURL()};
 })()`);
 await mkdir('artifacts/appearances',{recursive:true});await writeFile('artifacts/appearances/comparison.png',Buffer.from(result.sheet.split(',')[1],'base64'));await writeFile('artifacts/appearances/render-results.json',JSON.stringify(result.results,null,2));console.log(JSON.stringify(result.results));app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
