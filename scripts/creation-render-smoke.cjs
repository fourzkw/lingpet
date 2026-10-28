const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
app.disableHardwareAcceleration();
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/creation-smoke');
let win;
app.whenReady().then(async()=>{
  const manifest=JSON.parse(await fs.readFile(path.join(out,'bundle/manifest.json'),'utf8'));
  const entry={id:'smoke',taskId:'fixture',asset:'custom:smoke',character:'chatgpt',name:'合成测试形象',variants:['original','pixel'],pixelSize:64,doneMs:1000,manifest};
  const pet={id:'test-pet',name:'测试实例',character:'chatgpt',appearance:'smoke',variant:'pixel',scale:1,resolution:32,enabled:true,petVisible:true,showLabel:true,alwaysOnTop:true,follow:{mode:'global'}};
  const snapshot={settings:pet,current:{state:'idle',label:'测试'},customAppearances:[entry],activePetId:pet.id,pets:[pet],sessions:[],instances:0,global:{launchAtLogin:false},animationKey:'fixture',animationStartedAt:Date.now(),labels:Object.fromEntries(Object.keys(manifest.clips).map(s=>[s,s]))};
  ipcMain.handle('pet:get',()=>snapshot);
  ipcMain.handle('pet:appearance-sheet',async(_e,{state,variant})=>'data:image/png;base64,'+(await fs.readFile(path.join(out,'bundle',variant==='original'?'original':'',manifest.clips[state].file))).toString('base64'));
  win=new BrowserWindow({show:false,width:1130,height:850,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
  const errors=[];win.webContents.on('console-message',(_e,...args)=>{const message=typeof args[0]==='object'?args[0].message:args[1];if(String(message).includes('Uncaught'))errors.push(message);});
  await win.loadFile(path.join(root,'desktop/settings.html'));
  await win.webContents.executeJavaScript("import('./settings.js').then(()=>true)");
  const results=await win.webContents.executeJavaScript(`(async()=>{
    const {paint}=await import('./renderer.js'),{syncCustomAppearances,readyCustomAppearance}=await import('./custom-appearances.js');
    const data=await window.pet.get();syncCustomAppearances(data.customAppearances);const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');const results=[];
    for(const variant of ['original','pixel'])for(const state of ${JSON.stringify(Object.keys(manifest.clips))}){
      await readyCustomAppearance('custom:smoke',state,variant);paint(ctx,{...data,settings:{...data.settings,variant},current:{state}},500,256,256);
      const pixels=ctx.getImageData(0,0,256,256).data;let alpha=0,clear=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i])alpha++;else clear++;}results.push({variant,state,alpha,clear});
    }
    await readyCustomAppearance('custom:smoke','idle','pixel');const preview=document.getElementById('preview');paint(preview.getContext('2d'),data,500,420,420);
    const mainAlpha=preview.getContext('2d').getImageData(0,0,420,420).data.filter((v,i)=>i%4===3&&v>0).length;
    return {results,mainAlpha,appearanceCards:[...document.querySelectorAll('[data-appearance]')].map(e=>e.dataset.appearance)};
  })()`);
  assert.ok(results.appearanceCards.includes('smoke'));assert.ok(results.appearanceCards.includes('white-dragon'));assert.ok(results.mainAlpha>100);assert.equal(results.results.length,16);assert.ok(results.results.every(r=>r.alpha>100&&r.clear>100));assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'render-results.json'),JSON.stringify(results,null,2));await fs.writeFile(path.join(out,'settings.png'),(await win.webContents.capturePage()).toPNG());console.log('PASS: original + pixel, eight states, transparency, custom and existing appearance gallery.');app.exit(0);
}).catch(async error=>{console.error(error);await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'error.txt'),error.stack);app.exit(1);});
setTimeout(()=>{console.error('Creation render smoke timeout');app.exit(2);},30000).unref();
