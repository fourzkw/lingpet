import {app,BrowserWindow,dialog} from 'electron';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {launchDesktop} from '../src/desktop-runtime.js';
import {dataDirectory,PACKAGE_ROOT} from '../src/paths.js';
const out=path.join(PACKAGE_ROOT,'artifacts/settings-recovery-smoke'),checks=[];
async function run(){
let failure;
try{
  await launchDesktop(dataDirectory());
  const win=BrowserWindow.getAllWindows().find(w=>w.getTitle().includes('工作台'));assert.ok(win,'recovery opens workbench');
  const wc=win.webContents;
  for(let i=0;i<100;i++){
    if(await wc.executeJavaScript("Boolean(document.getElementById('restoreSettings')?.onclick)"))break;
    await new Promise(r=>setTimeout(r,100));
  }
  const initial=await wc.executeJavaScript('window.pet.get()');assert.equal(initial.settings.name,'恢复前的伙伴');
  const report=await wc.executeJavaScript("window.pet.system({action:'status'})");assert.equal(report.settingsRecovery.source,'backup');
  assert.equal(await readFile(path.join(dataDirectory(),report.settingsRecovery.preserved),'utf8'),'{broken');
  checks.push('malformed primary auto-recovers backup, preserves original and opens workbench');
  await wc.executeJavaScript("window.pet.settings({name:'修改后的伙伴'})");
  dialog.showMessageBox=async()=>({response:1});
  await wc.executeJavaScript("document.getElementById('restoreSettings').onclick()");
  assert.equal((await wc.executeJavaScript('window.pet.get()')).settings.name,'修改后的伙伴');
  checks.push('cancel restore keeps current settings');
  dialog.showMessageBox=async()=>({response:0});
  await wc.executeJavaScript("document.getElementById('restoreSettings').onclick()");
  assert.equal((await wc.executeJavaScript('window.pet.get()')).settings.name,'恢复前的伙伴');
  const manual=await wc.executeJavaScript("window.pet.system({action:'status'})");assert.equal(manual.settingsRecovery.source,'manual');
  assert.equal(JSON.parse(await readFile(path.join(dataDirectory(),manual.settingsRecovery.preserved),'utf8')).pets[0].name,'修改后的伙伴');
  checks.push('real settings button restores previous revision and archives current config');
  await wc.executeJavaScript("document.getElementById('openAppSettings').click();document.getElementById('settingsRecovery').parentElement.scrollIntoView({block:'center'})");
  await new Promise(r=>setTimeout(r,200));
  assert.match(await wc.executeJavaScript("document.getElementById('settingsRecovery').textContent"),/已恢复/);
  await writeFile(path.join(out,'application.png'),(await wc.capturePage()).toPNG());
}catch(error){failure=error.stack||String(error);}
await writeFile(path.join(out,'results.json'),JSON.stringify({checks,failure},null,2));
console.log(JSON.stringify({checks,failure}));app.exit(failure?1:0);
}
void run();
