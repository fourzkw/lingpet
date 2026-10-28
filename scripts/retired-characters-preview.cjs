const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
app.disableHardwareAcceleration();app.setPath('userData',path.resolve('artifacts/retired-characters/preview-profile'));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{sandbox:true}});await win.loadFile(path.resolve('scripts/animation-qa.html'));
 const result=await win.webContents.executeJavaScript(`(async()=>{
  const {CHARACTERS}=await import('../src/characters.js'),{readyPixelAssets}=await import('../desktop/pixel-pet.js'),{paint}=await import('../desktop/renderer.js');
  const {readyDeepseekVideoState}=await import('../desktop/deepseek-video-actions.js'),{readyDragonState}=await import('../desktop/dragon-actions.js'),{readyOriginalAction}=await import('../desktop/original-actions.js');
  await readyPixelAssets();const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');const results=[];
  if(CHARACTERS.some(c=>c.id==='gemini'||c.appearances.some(a=>a.id==='whale-classic')))throw new Error('Retired entries still visible');
  for(const role of CHARACTERS)for(const skin of role.appearances)for(const variant of skin.variants){
   if(skin.asset==='deepseek-h3')await readyDeepseekVideoState('idle',variant);
   else if(skin.asset==='chatgpt-white-dragon-h3')await (await import('../desktop/white-dragon-video-actions.js')).readyWhiteDragonVideoState('idle',variant);
   else if(skin.asset==='chatgpt-dragon')await readyDragonState('idle',variant);
   else if(variant==='original')await readyOriginalAction(skin.asset);
   paint(ctx,{settings:{character:role.id,appearance:skin.id,variant},current:{state:'idle'}},1000,256,256);
   const pixels=ctx.getImageData(0,0,256,256).data;let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])visible++;
   if(visible<1000)throw new Error('Blank pet: '+skin.asset+'/'+variant);results.push({character:role.id,appearance:skin.id,variant,visible});
  }return {valid:true,results};
 })()`);
 await fs.mkdir('artifacts/retired-characters',{recursive:true});await fs.writeFile('artifacts/retired-characters/render-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.quit();
}).catch(async error=>{await fs.writeFile('artifacts/retired-characters/render-error.txt',error.stack);console.error(error);app.exit(1);});
