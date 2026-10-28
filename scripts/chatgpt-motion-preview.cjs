const {app,BrowserWindow}=require('electron');
const {mkdir,writeFile}=require('node:fs/promises');
const path=require('node:path');
app.setPath('userData',path.resolve('artifacts/ui-review/motion-preview-profile'));
app.whenReady().then(async()=>{
const win=new BrowserWindow({show:false,webPreferences:{sandbox:true}});await win.loadFile(path.resolve('scripts/animation-qa.html'));
const result=await win.webContents.executeJavaScript(`(async()=>{
 const {readyPixelAssets}=await import('../desktop/pixel-pet.js'),{paint,ORDER}=await import('../desktop/renderer.js'),{CHATGPT_CLIPS,CHATGPT_EYES}=await import('../desktop/chatgpt-motion.js'),{clipDuration}=await import('../desktop/action-clips.js');await readyPixelAssets();
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d');const blink=document.createElement('canvas');blink.width=1536;blink.height=256;const strip=blink.getContext('2d');strip.fillStyle='#191f2a';strip.fillRect(0,0,1536,256);strip.imageSmoothingEnabled=false;
 for(const [i,time] of [0,4130,4200,4280,4350,5800].entries()){paint(ctx,{settings:{character:'chatgpt'},current:{state:'idle'}},time,128,128);strip.drawImage(canvas,i*256,0,256,256);}
 const states=document.createElement('canvas');states.width=1024;states.height=512;const grid=states.getContext('2d');grid.fillStyle='#191f2a';grid.fillRect(0,0,1024,512);grid.imageSmoothingEnabled=false;
 const checks=[];for(const [i,state] of ORDER.entries()){const clip=CHATGPT_CLIPS[state];let time=0;const times=clip.durations.map(ms=>{const t=time+ms/2;time+=ms;return t;});for(const t of times){paint(ctx,{settings:{character:'chatgpt'},current:{state}},t,128,128);const data=ctx.getImageData(0,0,128,128).data;for(let p=0;p<data.length;p+=4){const a=data[p+3];if(a!==0&&a!==255)throw new Error('soft alpha '+state);const x=p/4%128,y=Math.floor(p/4/128);if(a&&(x<8||x>=120||y<8||y>=120))throw new Error('unsafe margin '+state);}}paint(ctx,{settings:{character:'chatgpt'},current:{state}},state==='sleep'?5000:state==='done'?600:700,128,128);grid.drawImage(canvas,i%4*256,Math.floor(i/4)*256,256,256);checks.push(state);}
 paint(ctx,{settings:{character:'chatgpt'},current:{state:'idle'}},0,128,128);const base=ctx.getImageData(0,0,128,128).data;paint(ctx,{settings:{character:'chatgpt'},current:{state:'idle'}},4200,128,128);const closed=ctx.getImageData(0,0,128,128).data;const changed=[0,0];for(let p=0;p<128*128;p++){const x=p%128,y=Math.floor(p/128),eye=CHATGPT_EYES.findIndex(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h);for(let c=0;c<4;c++)if(base[p*4+c]!==closed[p*4+c]){if(eye<0)throw new Error('blink changed body');changed[eye]++;}}if(changed.some(n=>!n))throw new Error('blink is asymmetric');
 return {blink:blink.toDataURL(),states:states.toDataURL(),checks,changed};
})()`);
await mkdir('artifacts/chatgpt-motion',{recursive:true});for(const key of ['blink','states'])await writeFile('artifacts/chatgpt-motion/'+key+'.png',Buffer.from(result[key].split(',')[1],'base64'));console.log(JSON.stringify({checks:result.checks,eyeChanges:result.changed}));app.quit();}).catch(e=>{console.error(e);app.exit(1);});
