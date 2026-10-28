import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {PACKAGE_ROOT} from '../src/paths.js';

export async function runWindowLifecycleSmoke({app,ipcMain,petWindow,petReady,openSettings,getSettingsWindow,getSettingsReady}){
  const failures=[],checks=[];
  const onException=error=>failures.push(error.stack||String(error));
  process.on('uncaughtException',onException);
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  try{
    await petReady;
    const {runPetInteractionSmoke,runInteractionAssetSmoke}=await import('./pet-interaction-smoke.mjs');
    checks.push(...await runInteractionAssetSmoke(petWindow));
    let interactionTimeout;
    try{checks.push(...await Promise.race([runPetInteractionSmoke(petWindow),new Promise((_,reject)=>{interactionTimeout=setTimeout(()=>reject(new Error('Pet interaction smoke timed out')),30000);})]));}
    finally{clearTimeout(interactionTimeout);}
    const {runQuickControlsSmoke}=await import('./quick-controls-smoke.mjs');checks.push(...await runQuickControlsSmoke(petWindow));
    for(let cycle=0;cycle<5;cycle++){
      openSettings();
      assert.equal(getSettingsWindow().isVisible(),false,'workbench stays hidden before first paint');
      const pendingWindow=getSettingsWindow();
      openSettings();openSettings();
      assert.equal(getSettingsWindow(),pendingWindow,'rapid opens reuse the loading window');
      assert.equal(pendingWindow.isVisible(),false,'rapid opens must not reveal the unpainted window');
      await getSettingsReady();
      for(let attempt=0;attempt<100&&!getSettingsWindow().isVisible();attempt++)await pause(20);
      assert.equal(getSettingsWindow().isVisible(),true);
      await getSettingsWindow().webContents.executeJavaScript("import('./settings.js').then(()=>true)");
      assert.ok(await getSettingsWindow().webContents.executeJavaScript("document.querySelector('#petList [data-select-pet]')!==null"),'workbench initializes pet controls');
      if(cycle===0){const {runDisplayControlsSmoke}=await import('./display-controls-smoke.mjs');checks.push(...await runDisplayControlsSmoke(getSettingsWindow()));}
      if(cycle===0&&process.env.BOARD_PET_THEME_SMOKE==="1"){const {runThemeWorkbenchSmoke}=await import("./theme-workbench-smoke.mjs");checks.push(...await runThemeWorkbenchSmoke(getSettingsWindow(),petWindow));}
      if(cycle===0&&process.env.BOARD_PET_COMPLETION_SMOKE==='1'){const {runCompletionFeaturesSmoke}=await import('./completion-features-smoke.mjs');checks.push(...await runCompletionFeaturesSmoke(getSettingsWindow()));}
      const image=await getSettingsWindow().webContents.capturePage();
      const pixels=image.toBitmap(),colors=new Set();
      for(let i=0;i<pixels.length;i+=4)colors.add(pixels.readUInt32LE(i));
      assert.ok(colors.size>32,'workbench paints content instead of a solid black frame');
      const oldWindow=getSettingsWindow(),oldContents=oldWindow.webContents;
      const closed=new Promise(resolve=>oldWindow.once('closed',resolve));oldWindow.close();await closed;
      assert.equal(oldWindow.isDestroyed(),true);
      assert.equal(getSettingsWindow(),null);
      await petWindow.webContents.executeJavaScript(`(async()=>{
        await window.pet.get();
        await window.pet.settings({showLabel:true});
        await window.pet.demo('error');await window.pet.demo(null);
        window.pet.ignoreMouse(false);window.pet.drag(true);window.pet.drag(false);
        window.pet.hide();window.pet.showSettings();
      })()`);
      // Simulate messages already queued when the old renderer closed.
      for(const channel of ['pet:show-settings','pet:hide','pet:ignore-mouse','pet:drag'])ipcMain.emit(channel,{sender:oldContents},true);
      await pause(250);assert.ok(getSettingsWindow()&&!getSettingsWindow().isDestroyed());
      await getSettingsReady();
      await getSettingsWindow().webContents.executeJavaScript('window.pet.get()');
      checks.push(`close/reopen cycle ${cycle+1}: pet IPC works and stale sender ignored`);
      const reopened=getSettingsWindow(),reopenedClosed=new Promise(resolve=>reopened.once('closed',resolve));
      reopened.close();await reopenedClosed;
    }
    const contents=petWindow.webContents;
    petWindow.destroy();
    for(const channel of ['pet:ignore-mouse','pet:drag'])ipcMain.emit(channel,{sender:contents},true);
    await pause(100);checks.push('late mouse/drag IPC after pet destruction is ignored');
  }catch(error){failures.push(error.stack||String(error));}
  const out=path.join(PACKAGE_ROOT,'artifacts/window-lifecycle-smoke');await mkdir(out,{recursive:true});
  await writeFile(path.join(out,'results.json'),JSON.stringify({checks,failures},null,2));
  console.log(JSON.stringify({checks,failures}));app.exit(failures.length?1:0);
}
