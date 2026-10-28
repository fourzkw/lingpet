import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {ipcMain,BrowserWindow} from 'electron';
import {readEndpoint,request} from '../src/bridge-client.js';
import {PACKAGE_ROOT} from '../src/paths.js';

export async function runMultiPetSmoke({app,registry,store,windows,openSettings,getSettingsWindow,getSettingsReady,dir,snapshot}){
  const checks=[],failures=[];const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const onError=e=>failures.push(e.stack||String(e));process.on('uncaughtException',onError);
  try{
    const endpoint=await readEndpoint(dir),manage=body=>request(endpoint,'/pets/manage',body,5000);
    const first=registry.pets[0];await manage({action:'update',id:first.id,value:{name:'DSH 桌宠',character:'claude',follow:{mode:'source',source:'dsh'}}});
    const create=async value=>{const result=await manage({action:'create',value});const pet=result.pets.at(-1);await windows.get(pet.id).ready;await windows.get(pet.id).window.webContents.executeJavaScript("import('./pet.js').then(()=>true)");return pet;};
    const cursor=await create({name:'Cursor 桌宠',character:'deepseek',follow:{mode:'source',source:'cursor'}});
    const global=await create({name:'全局桌宠',follow:{mode:'global'}});
    const pinned=await create({name:'固定会话',character:'deepseek',follow:{mode:'session',source:'cursor',scopeId:'cursor-local',sessionId:'cursor-task'}});
    await windows.get(first.id).ready;
    store.accept({version:1,source:'dsh',scopeId:'dsh-stable',instanceId:'dsh',sessionId:'dsh-task',turn:1,seq:1,state:'approval'});
    store.accept({version:1,source:'cursor',scopeId:'cursor-local',instanceId:'cursor',sessionId:'cursor-task',turn:1,seq:1,state:'working'});
    await pause(200);
    assert.equal(windows.size,4);assert.equal(snapshot(first.id).current.state,'approval');assert.equal(snapshot(cursor.id).current.state,'working');assert.equal(snapshot(global.id).current.source,'dsh');assert.equal(snapshot(pinned.id).current.sessionId,'cursor-task');checks.push('four independent windows resolve all four follow modes');
    await windows.get(cursor.id).window.webContents.executeJavaScript("window.pet.settings({scale:1.25})");
    assert.equal(snapshot(first.id).settings.scale,1);assert.equal(snapshot(cursor.id).settings.scale,1.25);checks.push('renderer can change only its own pet size and character');
    const context=windows.get(cursor.id),otherBounds=windows.get(first.id).window.getBounds();
    await context.window.webContents.executeJavaScript('window.pet.drag(true);window.pet.drag(false)');await pause(100);
    assert.deepEqual(windows.get(first.id).window.getBounds(),otherBounds);checks.push('drag IPC does not move or resize other pets');
    await context.window.webContents.executeJavaScript("window.pet.demo('done')");assert.equal(snapshot(cursor.id).current.demo,true);assert.equal(snapshot(first.id).current.state,'approval');await context.window.webContents.executeJavaScript('window.pet.demo(null)');checks.push('demo and timers are isolated per pet');
    store.disconnect('cursor');assert.equal(snapshot(pinned.id).current.state,'offline');
    store.accept({version:1,source:'cursor',scopeId:'cursor-local',instanceId:'cursor-reconnected',sessionId:'cursor-task',turn:2,seq:1,state:'thinking'});
    assert.equal(snapshot(pinned.id).current.instanceId,'cursor-reconnected');checks.push('pinned session reconnects using stable source identity');
    await manage({action:'update',id:global.id,value:{name:'Codex 桌宠',follow:{mode:'source',source:'codex'}}});
    store.accept({version:1,source:'codex',scopeId:'codex-local',instanceId:'codex',sessionId:'codex-task',turn:1,seq:1,state:'working'});
    assert.equal(snapshot(global.id).current.source,'codex');checks.push('Codex source follows independently beside DSH, Cursor and pinned sessions');
    await context.window.webContents.executeJavaScript("document.getElementById('sprite').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))");
    let quickMenu;
    for(let i=0;i<100;i++){quickMenu=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='桌宠快捷栏');if(quickMenu?.isVisible())break;await pause(30);}
    assert.ok(quickMenu?.isVisible(),'right-click must open quick controls');assert.ok(!getSettingsWindow(),'right-click must not open the workbench');
    const action=async(id,checked)=>quickMenu.webContents.executeJavaScript(`window.quickControls.act(${JSON.stringify({id,checked})})`);
    const other=registry.require(first.id).showLabel;await action('show-label',false);assert.equal(registry.require(cursor.id).showLabel,false);assert.equal(registry.require(first.id).showLabel,other);
    await action('character-chatgpt');assert.equal(registry.require(cursor.id).character,'chatgpt');assert.equal(registry.require(first.id).character,'claude');
    await action('appearance-cloud-dragon');assert.equal(registry.require(cursor.id).appearance,'cloud-dragon');assert.equal(registry.require(first.id).character,'claude');
    await action('variant-original');assert.equal(registry.require(cursor.id).variant,'original');await action('variant-pixel');
    await action('appearance-white-dragon');assert.equal(registry.require(cursor.id).appearance,'white-dragon');
    await action('character-deepseek');await action('show-label',true);
    await quickMenu.webContents.executeJavaScript('window.quickControls.close()');await pause(100);assert.equal(context.menuOpen,false);
    ipcMain.emit('pet:quick-controls',{sender:{isDestroyed:()=>false}});assert.ok(!BrowserWindow.getAllWindows().some(w=>w.getTitle()==='桌宠快捷栏'),'unknown sender must not open a menu');
    checks.push('right-click opens a scoped quick menu without the workbench; controls affect only the clicked pet and ignore unknown senders');
    console.log('multi: opening workbench');openSettings(global.id);
    const codexWindow=getSettingsWindow();codexWindow.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)console.log('workbench error: '+event.message);});
    await Promise.race([getSettingsReady(),pause(15000).then(()=>{throw new Error('workbench load timed out');})]);await pause(600);console.log('multi: workbench loaded');
    await Promise.race([codexWindow.webContents.executeJavaScript("(async()=>{await (await import('./pixel-pet.js')).readyPixelAssets();})()"),pause(15000).then(()=>{throw new Error('workbench assets timed out');})]);console.log('multi: workbench assets ready');
    for(let i=0;i<80;i++){if(await codexWindow.webContents.executeJavaScript("document.getElementById('followMode').value==='codex'"))break;await pause(100);}
    const codexUi=await codexWindow.webContents.executeJavaScript("(async()=>({mode:document.getElementById('followMode').value,actual:(await window.pet.get()).settings.follow,pet:(await window.pet.get()).activePetId}))()");
    assert.equal(codexUi.mode,'codex',JSON.stringify(codexUi));
    assert.ok(await codexWindow.webContents.executeJavaScript("document.getElementById('currentSource').textContent.includes('Codex')"));
    openSettings(cursor.id);getSettingsWindow().webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)console.log('workbench error: '+event.message);});await getSettingsReady();await pause(600);
    const workbench=getSettingsWindow();
    await workbench.webContents.executeJavaScript("(async()=>{await (await import('./pixel-pet.js')).readyPixelAssets();})()");
    for(let i=0;i<80;i++){if(await workbench.webContents.executeJavaScript("document.querySelectorAll('[data-select-pet]').length>0"))break;await pause(100);}
    const ui=await workbench.webContents.executeJavaScript("(async()=>({mode:document.getElementById('followMode').value,actual:(await window.pet.get()).settings.follow,selected:document.querySelector('.pet-list-row.selected')?.dataset.petId,name:document.getElementById('petName').value}))()");
    assert.equal(ui.mode,'cursor',JSON.stringify(ui));
    const sidebar=await workbench.webContents.executeJavaScript("({count:document.querySelectorAll('[data-select-pet]').length,names:[...document.querySelectorAll('.pet-list-select strong')].map(el=>el.textContent),selected:document.querySelector('.pet-list-row.selected')?.dataset.petId})");
    assert.equal(sidebar.count,4);assert.equal(sidebar.selected,cursor.id);assert.ok(sidebar.names.includes('DSH 桌宠'));
    await workbench.webContents.executeJavaScript(`document.querySelector('[data-select-pet="${first.id}"]').click()`);await pause(200);
    assert.equal((await workbench.webContents.executeJavaScript('window.pet.get()')).activePetId,first.id);
    await workbench.webContents.executeJavaScript(`document.querySelector('[data-select-pet="${cursor.id}"]').click()`);await pause(200);
    await workbench.webContents.executeJavaScript("document.getElementById('showPet').click()");await pause(250);
    assert.equal(windows.get(cursor.id).window.isVisible(),false);assert.equal(windows.get(first.id).window.isVisible(),true);
    assert.equal(registry.require(cursor.id).enabled,true);
    await workbench.webContents.executeJavaScript("document.getElementById('showPet').click()");await pause(250);
    assert.equal(windows.has(cursor.id),true);await windows.get(cursor.id).ready;
    await workbench.webContents.executeJavaScript(`document.querySelector('[data-select-pet="${cursor.id}"]').click()`);await pause(200);
    assert.equal((await workbench.webContents.executeJavaScript('window.pet.get()')).activePetId,cursor.id);
    checks.push('visible pet list shows all pets, switches editor and independently hides/shows a pet');
    const out=path.join(PACKAGE_ROOT,'artifacts/multi-pet-smoke');await mkdir(out,{recursive:true});await writeFile(path.join(out,'workbench.png'),(await workbench.webContents.capturePage()).toPNG());
    assert.ok(await workbench.webContents.executeJavaScript("document.getElementById('followPanel').hidden && !document.querySelector('.demo-panel').open"));
    await workbench.webContents.executeJavaScript("document.getElementById('followTab').click()");
    assert.ok(await workbench.webContents.executeJavaScript("document.getElementById('appearancePanel').hidden && document.getElementById('followTab').getAttribute('aria-selected')==='true'"));
    await workbench.webContents.executeJavaScript("document.getElementById('followMode').value='session';document.getElementById('followMode').dispatchEvent(new Event('change'))");
    assert.ok(await workbench.webContents.executeJavaScript("document.getElementById('followDescription').textContent.includes('尚未绑定')"));
    await workbench.webContents.executeJavaScript("document.querySelector('.session').click()");await pause(200);
    assert.equal((await workbench.webContents.executeJavaScript('window.pet.get()')).settings.follow.mode,'session');
    await writeFile(path.join(out,'follow.png'),(await workbench.webContents.capturePage()).toPNG());
    await workbench.webContents.executeJavaScript("document.getElementById('autoFollow').click()");await pause(200);
    assert.equal((await workbench.webContents.executeJavaScript('window.pet.get()')).settings.follow.mode,'global');
    await workbench.webContents.executeJavaScript("document.getElementById('appearanceTab').click();document.querySelector('.demo-panel').open=true;document.querySelector('[data-demo=working]').click()");await pause(200);
    assert.ok(await workbench.webContents.executeJavaScript("document.getElementById('currentState').textContent.includes('演示') && !document.getElementById('backLive').hidden"));
    await workbench.webContents.executeJavaScript("document.getElementById('backLive').click();document.querySelector('.demo-panel').open=false");await pause(200);
    workbench.setSize(850,680);await pause(300);
    assert.ok(await workbench.webContents.executeJavaScript("document.documentElement.scrollWidth<=innerWidth"),'minimum window width has no horizontal overflow');
    assert.ok(await workbench.webContents.executeJavaScript("document.getElementById('showPet').getBoundingClientRect().bottom<=innerHeight"),'show pet action stays visible at minimum window size');
    await writeFile(path.join(out,'workbench-compact.png'),(await workbench.webContents.capturePage()).toPNG());
    checks.push('workbench tabs, pending session binding, return to automatic follow, demo recovery and compact layout');
    workbench.setSize(1130,920);await pause(200);
    for(const [character,appearance] of [['chatgpt','white-dragon'],['gemini','star-cat'],['chatgpt','cloud-dragon']]){
      await workbench.webContents.executeJavaScript(`document.querySelector('[data-character=${character}]').click()`);await pause(250);
      await workbench.webContents.executeJavaScript(`document.querySelector('[data-appearance=${appearance}]').click()`);await pause(250);
      const selected=(await workbench.webContents.executeJavaScript('window.pet.get()')).settings;
      assert.equal(selected.character,character);assert.equal(selected.appearance,appearance);
      for(const variant of ['original','pixel']){
        await workbench.webContents.executeJavaScript(`document.querySelector('[data-variant=${variant}]').click()`);await pause(450);
        const value=(await workbench.webContents.executeJavaScript('window.pet.get()')).settings;assert.equal(value.variant,variant);assert.equal(value.appearance,appearance);assert.equal(value.character,character);assert.deepEqual(value.follow,selected.follow);
        await writeFile(path.join(out,appearance+'-'+variant+'-workbench.png'),(await workbench.webContents.capturePage()).toPNG());
      }
    }
    checks.push('four roles with retained appearances and independent original/pixel selection; format changes preserve follow rules');
    const companions=await workbench.webContents.executeJavaScript(`(async()=>{
      const {paint,ORDER}=await import('./renderer.js'),{COMPANION_CLIPS}=await import('./companion-actions.js'),{CHATGPT_CLIPS,CHATGPT_EYES}=await import('./chatgpt-motion.js'),{clipDuration}=await import('./action-clips.js');
      const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d');const results=[],previews=[];
      for(const character of ['chatgpt','gemini']){
        const sheet=document.createElement('canvas');sheet.width=1024;sheet.height=512;const grid=sheet.getContext('2d');grid.fillStyle='#191f2a';grid.fillRect(0,0,1024,512);
        for(const [row,state] of ORDER.entries()){
          const frames=new Set(),tops=new Set();let binary=true,inside=true,visible=true;
          const clip=(character==='chatgpt'?CHATGPT_CLIPS:COMPANION_CLIPS)[state];let elapsed=0;
          const times=clip.durations.map(ms=>{const t=elapsed+ms/2;elapsed+=ms;return t;});times.push(clipDuration(clip)+500,20000);
          for(const time of times){
            paint(ctx,{settings:{character},current:{state}},time,128,128);frames.add(canvas.toDataURL());
            const pixels=ctx.getImageData(0,0,128,128).data;let count=0;
            for(let p=0;p<pixels.length;p+=4){const a=pixels[p+3];if(a!==0&&a!==255)binary=false;if(a){count++;const x=(p/4)%128,y=Math.floor(p/4/128);if(x<8||x>=120||y<8||y>=120)inside=false;}}
            if(count<1000)visible=false;
            if(state==='working')tops.add(Array.from(ctx.getImageData(0,0,128,78).data).join(','));
          }
          if(state==='done'||state==='error'){paint(ctx,{settings:{character},current:{state}},clipDuration(clip)+500,128,128);const held=canvas.toDataURL();paint(ctx,{settings:{character},current:{state}},20000,128,128);if(canvas.toDataURL()!==held)throw new Error('one-time action did not hold');}
          if(character==='chatgpt'&&state==='idle'){
            paint(ctx,{settings:{character},current:{state}},0,128,128);const base=ctx.getImageData(0,0,128,128).data;
            paint(ctx,{settings:{character},current:{state}},4200,128,128);const closed=ctx.getImageData(0,0,128,128).data;const changed=[0,0];
            for(let p=0;p<128*128;p++){const x=p%128,y=Math.floor(p/128),eye=CHATGPT_EYES.findIndex(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h);for(let c=0;c<4;c++)if(base[p*4+c]!==closed[p*4+c]){if(eye<0)throw new Error('ChatGPT blink changed face/body outside eyelids');changed[eye]++;}}
            if(changed.some(n=>n===0))throw new Error('Blink must close both eyes together');
          }
          results.push({character,state,binary,inside,visible,frames:frames.size,steadyTyping:state!=='working'||tops.size===1});
          paint(ctx,{settings:{character},current:{state}},state==='sleep'?4000:state==='done'?600:700,128,128);grid.imageSmoothingEnabled=false;grid.drawImage(canvas,row%4*256,Math.floor(row/4)*256,256,256);
        }
        paint(ctx,{settings:{character},current:{state:'idle'}},0,128,128);previews.push({character,idle:canvas.toDataURL(),sheet:sheet.toDataURL()});
      }
      return {results,previews};
    })()`);
    for(const result of companions.results){assert.ok(result.binary&&result.inside&&result.visible&&result.steadyTyping&&result.frames>=2,JSON.stringify(result));}
    for(const preview of companions.previews){await writeFile(path.join(out,preview.character+'.png'),Buffer.from(preview.idle.split(',')[1],'base64'));await writeFile(path.join(out,preview.character+'-states.png'),Buffer.from(preview.sheet.split(',')[1],'base64'));}
    checks.push('ChatGPT and Gemini: all eight animations, clean transparency, safe margins, stable typing, one-time recovery and workbench selection');
    const oldContents=windows.get(cursor.id).window.webContents;await manage({action:'update',id:cursor.id,value:{enabled:false}});assert.equal(windows.size,3);
    ipcMain.emit('pet:ignore-mouse',{sender:oldContents},true);ipcMain.emit('pet:drag',{sender:oldContents},true);checks.push('pausing destroys only one window and ignores its late IPC');
    workbench.close();await windows.get(first.id).window.webContents.executeJavaScript('window.pet.get()');openSettings(first.id);await getSettingsReady();checks.push('closing/reopening workbench leaves all pet IPC valid');
    await pause(300);const saved=JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8'));assert.equal(saved.schemaVersion,2);assert.equal(saved.pets.find(p=>p.id===cursor.id).enabled,false);checks.push('independent pet configurations persist in schema v2');
    for(const pet of [...registry.pets])await manage({action:'remove',id:pet.id});assert.equal(windows.size,0);await pause(200);
    assert.ok(await getSettingsWindow().webContents.executeJavaScript("!document.getElementById('noPet').hidden && document.getElementById('petWorkspace').hidden"));
    await getSettingsWindow().webContents.executeJavaScript("document.getElementById('addPetFromList').click()");await pause(300);assert.equal(windows.size,1);checks.push('empty workbench explains next step and add pet remains usable');
  }catch(error){failures.push(error.stack||String(error));}
  await mkdir(path.join(PACKAGE_ROOT,'artifacts/multi-pet-smoke'),{recursive:true});await writeFile(path.join(PACKAGE_ROOT,'artifacts/multi-pet-smoke/results.json'),JSON.stringify({checks,failures},null,2));
  console.log(JSON.stringify({checks,failures}));app.exit(failures.length?1:0);
}
