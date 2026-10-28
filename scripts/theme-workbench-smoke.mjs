import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {PACKAGE_ROOT,dataDirectory} from '../src/paths.js';
import {UI_THEMES} from '../src/ui-themes.js';
import {BrowserWindow,nativeImage} from 'electron';
export async function runThemeWorkbenchSmoke(win,petWindow){
 const out=path.join(PACKAGE_ROOT,'artifacts/theme-workbench-smoke');await mkdir(out,{recursive:true});
 const wc=win.webContents,checks=[],wait=ms=>new Promise(r=>setTimeout(r,ms));
 const before=await wc.executeJavaScript('window.pet.get()');
 assert.ok(!nativeImage.createFromPath(path.join(PACKAGE_ROOT,'assets/brand/app.ico')).isEmpty(),'Windows application icon decodes');
 assert.ok(!nativeImage.createFromPath(path.join(PACKAGE_ROOT,'assets/tray.png')).isEmpty(),'tray icon decodes');
 assert.ok(await wc.executeJavaScript("document.querySelector('.brand-icon').textContent===''&&getComputedStyle(document.querySelector('.brand-icon'),'::before').maskImage.includes('brand.svg')"),'original mark replaces the letter placeholder');
 checks.push('original brand mark, Windows ICO and tray PNG load correctly');
 assert.equal(before.global.theme,'paper-journal');
 for(const theme of UI_THEMES){
  await wc.executeJavaScript(`(async()=>{document.getElementById('openAppSettings').click();await document.querySelector('[data-theme-choice="${theme.id}"]').onclick();})()`);await wait(130);
  assert.equal(await wc.executeJavaScript('document.documentElement.dataset.theme'),theme.id);
  assert.equal(await petWindow.webContents.executeJavaScript('document.documentElement.dataset.theme'),theme.id);
  await petWindow.webContents.executeJavaScript("document.getElementById('pet').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))");
  let popup;for(let attempt=0;attempt<100;attempt++){popup=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='桌宠快捷栏');if(popup?.isVisible())break;await wait(30);}assert.ok(popup?.isVisible());await popup.webContents.executeJavaScript("import('./quick-controls.js').then(()=>true)");assert.equal(await popup.webContents.executeJavaScript('document.documentElement.dataset.theme'),theme.id);await writeFile(path.join(out,theme.id+'-quick.png'),(await popup.webContents.capturePage()).toPNG());popup.close();
  const saved=JSON.parse(await readFile(path.join(dataDirectory(),'settings.json'),'utf8'));assert.equal(saved.global.theme,theme.id);assert.deepEqual(saved.pets,before.pets.map(({current,...pet})=>pet));
  const app=await wc.executeJavaScript(`({visible:!document.getElementById('appView').hidden,workbenchHidden:document.getElementById('petView').hidden,buttons:document.querySelectorAll('[data-theme-choice]').length,selected:document.querySelectorAll('[data-theme-choice][aria-pressed=true]').length})`);
  assert.ok(app.visible&&app.workbenchHidden&&app.buttons===4&&app.selected===1);
  win.setSize(1130,850);await wait(100);await wc.executeJavaScript('window.scrollTo(0,0)');await writeFile(path.join(out,theme.id+'-settings.png'),(await wc.capturePage()).toPNG());
  await wc.executeJavaScript("document.getElementById('showMyPets').click();window.scrollTo(0,0)");await wait(80);
  assert.equal(await wc.executeJavaScript("document.querySelectorAll('.workspace-nav.selected').length"),1,'one active main page');
  await writeFile(path.join(out,theme.id+'-workbench.png'),(await wc.capturePage()).toPNG());
  for(const width of [1130,850]){win.setSize(width,850);await wait(100);assert.ok(await wc.executeJavaScript('document.documentElement.scrollWidth<=innerWidth'),'no horizontal overflow '+theme.id+' '+width);}
  await wc.executeJavaScript("document.getElementById('interactionTab').click()");
  assert.ok(await wc.executeJavaScript("!document.getElementById('interactionPanel').hidden&&document.getElementById('appearancePanel').hidden&&document.getElementById('interactionPanel').contains(document.getElementById('headPat'))"));
  await wc.executeJavaScript("document.getElementById('followTab').click()");
  assert.ok(await wc.executeJavaScript("document.querySelector('.session-panel').hidden"),'automatic follow does not ask for a session');
  await wc.executeJavaScript("document.getElementById('appearanceTab').click()");
  checks.push(theme.name+': saved globally; pet and quick popup synchronized; tabs and 850px layout verified');
 }
 await wc.executeJavaScript("window.pet.system({action:'theme',theme:'paper-journal'})");await wait(100);
 const loaded=new Promise(resolve=>wc.once('did-finish-load',resolve));wc.reload();await loaded;await wc.executeJavaScript("import('./settings.js').then(()=>true)");
 assert.equal(await wc.executeJavaScript('document.documentElement.dataset.theme'),'paper-journal');
 await wc.executeJavaScript("document.getElementById('openAppSettings').click()");
 await wc.executeJavaScript("document.getElementById('petList').querySelector('[data-select-pet]').click()");await wait(80);
 assert.ok(await wc.executeJavaScript("!document.getElementById('petView').hidden&&document.getElementById('appView').hidden"));
 assert.equal(await wc.executeJavaScript("document.getElementById('marketInstallMode').value"),'library');
 checks.push('reload remembers theme; selecting a pet returns to workbench; market defaults to collection');
 win.setSize(1130,850);return checks;
}
