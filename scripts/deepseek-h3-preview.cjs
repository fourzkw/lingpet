const {app,BrowserWindow}=require('electron');
const {mkdir,writeFile}=require('node:fs/promises');
const path=require('node:path');
app.disableHardwareAcceleration();
app.setPath('userData',path.resolve('artifacts/deepseek-h3/preview-profile'));
let win;
app.whenReady().then(async()=>{
 const out=path.resolve('artifacts/deepseek-h3');await mkdir(out,{recursive:true});win=new BrowserWindow({show:false,webPreferences:{sandbox:true,backgroundThrottling:false}});await win.loadFile(path.resolve('scripts/animation-qa.html'));
 const result=await win.webContents.executeJavaScript(`(async()=>{
  const {readyPixelAssets}=await import('../desktop/pixel-pet.js'),{paint,ORDER}=await import('../desktop/renderer.js'),{readyDeepseekVideoState}=await import('../desktop/deepseek-video-actions.js');await readyPixelAssets();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=384;const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const sheet=document.createElement('canvas');sheet.width=384*4;sheet.height=408*4;const grid=sheet.getContext('2d');grid.fillStyle='#242936';grid.fillRect(0,0,sheet.width,sheet.height);grid.font='16px sans-serif';
  const checks=[];let cell=0;
  for(const state of ORDER)for(const variant of ['original','pixel']){
   await readyDeepseekVideoState(state,variant);const hashes=new Set();let maxColors=0,soft=0,minVisible=Infinity;
   for(const time of [0,500,1000,1500,2000,3000,4200,5000,7000,15000]){
    paint(ctx,{settings:{character:'deepseek',appearance:'whale',variant},current:{state}},time,384,384);const pixels=ctx.getImageData(0,0,384,384).data,colors=new Set();let visible=0,partial=0;
    for(let i=0;i<pixels.length;i+=4){if(!pixels[i+3])continue;visible++;if(pixels[i+3]<255)partial++;colors.add(pixels[i]+','+pixels[i+1]+','+pixels[i+2]);const x=i/4%384,y=Math.floor(i/4/384);if(x<10||y<10||x>373||y>373)throw new Error('边缘越界 '+state+'/'+variant);if(pixels[i+1]>Math.max(pixels[i],pixels[i+2])+35)throw new Error('绿边 '+state+'/'+variant);}
    if(visible<8000)throw new Error('角色缺失 '+state+'/'+variant);if(variant==='pixel'&&(partial||colors.size>64))throw new Error('像素颜色或透明度错误');hashes.add(canvas.toDataURL());maxColors=Math.max(maxColors,colors.size);soft+=partial;minVisible=Math.min(minVisible,visible);
   }
   if(hashes.size<3)throw new Error('动作静止 '+state+'/'+variant);if(variant==='original'&&(soft<100||maxColors<256))throw new Error('原图细节损失');
   paint(ctx,{settings:{character:'deepseek',appearance:'whale',variant},current:{state}},['sleep','thinking','approval','working'].includes(state)?4200:2000,384,384);
   const x=cell%4*384,y=Math.floor(cell/4)*408;grid.fillStyle='white';grid.fillText(state+' / '+variant,x+10,y+18);grid.drawImage(canvas,x,y+24);cell++;
   checks.push({state,variant,distinctFrames:hashes.size,maxColors,softAlpha:soft,minVisible});
  }
  return {checks,sheet:sheet.toDataURL()};
 })()`);
 await writeFile(path.join(out,'states.png'),Buffer.from(result.sheet.split(',')[1],'base64'));await writeFile(path.join(out,'render-results.json'),JSON.stringify(result.checks,null,2));console.log('PASS: sixteen DeepSeek variant/state render checks');app.exit(0);
}).catch(async e=>{await mkdir('artifacts/deepseek-h3',{recursive:true});await writeFile('artifacts/deepseek-h3/render-error.txt',e.stack);console.error(e);app.exit(1);});
setTimeout(()=>{console.error('DeepSeek preview timeout');app.exit(2);},60000).unref();
