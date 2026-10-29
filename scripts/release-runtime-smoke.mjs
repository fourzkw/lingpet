// Execute with the development Electron binary, passing the packaged runtime directory.
import {app,BrowserWindow} from 'electron';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
for(const stream of [process.stdout,process.stderr])stream?.on('error',error=>{if(error.code!=='EPIPE')throw error;});
const root=path.resolve(process.argv[2]),packDirectory=process.argv[3]?.startsWith('--')?undefined:process.argv[3],out=path.resolve('output/release-runtime-'+Date.now());
app.setPath('userData',out);app.disableHardwareAcceleration();
// Keep the packaged runtime in this isolated test process rather than installing it.
process.env.BOARD_PET_LIFECYCLE_SMOKE='release-verification';process.argv.push('--dashboard');
BrowserWindow.prototype.show=function(){};BrowserWindow.prototype.showInactive=function(){};
const errors=[];app.on('web-contents-created',(_e,wc)=>{wc.setBackgroundThrottling(false);wc.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});});
const load=relative=>import(pathToFileURL(path.join(root,relative)).href);
async function run(){try{
 await mkdir(out,{recursive:true});console.log('Checking packaged runtime: '+root);
 const {launchDesktop}=await load('src/desktop-runtime.js');await launchDesktop(out);
 let dashboard;for(let i=0;i<100;i++){dashboard=BrowserWindow.getAllWindows().find(w=>/\/settings\.html(?:\?|$)/.test(w.webContents.getURL()));if(dashboard&&!dashboard.webContents.isLoading()&&await dashboard.webContents.executeJavaScript("Boolean(document.querySelector('.onboarding'))"))break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(dashboard,'packaged workbench opens');assert.ok(await dashboard.webContents.executeJavaScript("Boolean(document.querySelector('.onboarding'))"),'workbench initializes');
 assert.equal(await dashboard.webContents.executeJavaScript("!document.querySelector('.onboarding').hidden&&document.querySelector('.onboarding').children.length===1&&document.getElementById('onboardingConnect').textContent==='让伙伴跟上你的第一次会话'&&!document.querySelector('#petView #hostConnections')"),true,'fresh workbench only shows a connection button');
 assert.equal(await dashboard.webContents.executeJavaScript("Boolean(document.getElementById('changeContentFolder'))"),true,'content directory can be changed in app settings');
 await dashboard.webContents.executeJavaScript("document.getElementById('openAppSettings').click();document.getElementById('storageLocation').closest('.panel').scrollIntoView({block:'center',behavior:'instant'})");
 await new Promise(resolve=>setTimeout(resolve,400));
 await dashboard.webContents.executeJavaScript("document.getAnimations().forEach(animation=>animation.finish())");
 await dashboard.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await new Promise(resolve=>setTimeout(resolve,150));
 await writeFile(path.join(out,'storage-settings.png'),(await dashboard.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 await dashboard.webContents.executeJavaScript("document.getElementById('showMyPets').click()");
 if(await dashboard.webContents.executeJavaScript("Boolean(document.getElementById('openIntegrations'))")){
   assert.equal(await dashboard.webContents.executeJavaScript("(async()=>{document.getElementById('onboardingConnect').click();const result=await window.pet.integrations({action:'list'});return !document.getElementById('integrationsView').hidden&&result.targets.length===3&&!JSON.stringify(result).includes('controlToken')&&document.querySelectorAll('#integrationsView #hostConnections p').length===3;})()"),true,'first-connection button opens centralized Agent status');
   assert.equal(await dashboard.webContents.executeJavaScript("document.getElementById('integrationSource').value==='codex'&&!document.getElementById('integrationAdvanced').open&&!document.getElementById('integrationDetection').hidden&&document.getElementById('integrationProfileRow').hidden"),true,'Codex installation defaults to automatic discovery without manual parameters');
   assert.equal(await dashboard.webContents.executeJavaScript("(()=>{const source=document.getElementById('integrationSource');source.value='cursor';source.dispatchEvent(new Event('change',{bubbles:true}));return !document.getElementById('integrationAdvanced').open&&!document.getElementById('integrationDetection').hidden&&document.getElementById('integrationDetection').textContent.includes('Cursor 默认配置目录')&&document.getElementById('integrationExecutableRow').hidden&&document.getElementById('integrationProfileRow').hidden;})()"),true,'Cursor defaults to automatic configuration without command or profile fields');
   await new Promise(resolve=>setTimeout(resolve,400));
   assert.equal(await dashboard.webContents.executeJavaScript("document.getElementById('integrationConfig').getClientRects().length===0"),true,'Cursor hides custom configuration until advanced options are opened');
   assert.equal(await dashboard.webContents.executeJavaScript("(()=>{document.getElementById('integrationAdvanced').open=true;return Boolean(document.getElementById('integrationChooseConfig'));})()"),true,'Cursor retains custom directory selection in advanced options');
   await dashboard.webContents.executeJavaScript("document.getElementById('integrationAdvanced').open=false");
   const {IntegrationManager}=await load('src/integrations/manager.js');
   const manager=new IntegrationManager({dir:out,root,bridge:path.join(out,'LingPetBridge.exe'),version:JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version});
   const item=await manager.install({source:'cursor',config:path.join(out,'test-cursor')});
   await dashboard.webContents.executeJavaScript("document.getElementById('refreshIntegrations').click()");
   for(let i=0;i<50&&!await dashboard.webContents.executeJavaScript("document.querySelector('.onboarding').hidden");i++)await new Promise(resolve=>setTimeout(resolve,50));
   assert.equal(await dashboard.webContents.executeJavaScript("document.querySelector('.onboarding').hidden"),true,'installed Agent hides onboarding even without a live connection');
   assert.equal(await dashboard.webContents.executeJavaScript("[...document.querySelectorAll('#integrationList button')].some(button=>button.textContent==='重新安装接入')"),true,'current integration offers reinstall');
   const records=await manager.records();records.find(record=>record.id===item.id).version='0.0.1';await manager.save(records);
   await dashboard.webContents.executeJavaScript("document.getElementById('refreshIntegrations').click()");
   for(let i=0;i<50&&!await dashboard.webContents.executeJavaScript("[...document.querySelectorAll('#integrationList button')].some(button=>button.textContent==='更新接入')");i++)await new Promise(resolve=>setTimeout(resolve,50));
   assert.equal(await dashboard.webContents.executeJavaScript("[...document.querySelectorAll('#integrationList button')].some(button=>button.textContent==='更新接入')"),true,'older integration offers update');
   await dashboard.webContents.executeJavaScript("[...document.querySelectorAll('#integrationList button')].find(button=>button.textContent==='更新接入').click()");
   for(let i=0;i<50&&!await dashboard.webContents.executeJavaScript("[...document.querySelectorAll('#integrationList button')].some(button=>button.textContent==='重新安装接入')");i++)await new Promise(resolve=>setTimeout(resolve,50));
   assert.equal(await dashboard.webContents.executeJavaScript("[...document.querySelectorAll('#integrationList button')].some(button=>button.textContent==='重新安装接入')"),true,'updating the integration restores reinstall action');
   assert.equal(await dashboard.webContents.executeJavaScript("document.getElementById('integrationComplete').open&&document.getElementById('integrationCompleteTitle').textContent==='Cursor 接入安装完成'"),true,'successful installation opens a persistent completion dialog');
   await dashboard.webContents.executeJavaScript("document.getElementById('integrationCompleteConfirm').click()");
   await dashboard.webContents.executeJavaScript("(async()=>{const {showInstallationComplete}=await import('./integrations-ui.js');showInstallationComplete('codex');})()");
   assert.equal(await dashboard.webContents.executeJavaScript("document.getElementById('integrationComplete').open&&document.getElementById('integrationCompleteSteps').textContent.includes('完全退出并重新打开 Codex')&&document.getElementById('integrationCompleteSteps').textContent.includes('在对话框下方')&&document.getElementById('integrationCompleteSteps').textContent.includes('审核后选择允许')"),true,'Codex completion explains restart and Hooks review location');
   await new Promise(resolve=>setTimeout(resolve,400));await dashboard.webContents.executeJavaScript("document.getAnimations().forEach(animation=>animation.finish())");
   await dashboard.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await new Promise(resolve=>setTimeout(resolve,150));
   await writeFile(path.join(out,'codex-install-complete.png'),(await dashboard.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
   await dashboard.webContents.executeJavaScript("document.getElementById('integrationCompleteConfirm').click()");
   assert.equal(await dashboard.webContents.executeJavaScript("!document.getElementById('integrationComplete').open"),true,'completion dialog can be acknowledged');
   await manager.remove(item.id);
   await dashboard.webContents.executeJavaScript("document.getElementById('refreshIntegrations').click()");
   for(let i=0;i<50&&await dashboard.webContents.executeJavaScript("document.querySelector('.onboarding').hidden");i++)await new Promise(resolve=>setTimeout(resolve,50));
   assert.equal(await dashboard.webContents.executeJavaScript("!document.querySelector('.onboarding').hidden"),true,'removing all integrations restores the connection entry');
   assert.equal(await dashboard.webContents.executeJavaScript("(()=>{const source=document.getElementById('integrationSource');source.value='dsh';source.dispatchEvent(new Event('change',{bubbles:true}));return !document.getElementById('integrationAdvanced').open&&!document.getElementById('integrationDetection').hidden&&!document.getElementById('integrationConfig').required;})()"),true,'DSH installation defaults to automatic discovery without required manual fields');
   await new Promise(resolve=>setTimeout(resolve,400));
   assert.equal(await dashboard.webContents.executeJavaScript("document.getElementById('integrationConfig').getClientRects().length===0"),true,'collapsed advanced options do not expose manual fields');
   await dashboard.webContents.executeJavaScript("document.getAnimations().forEach(animation=>animation.finish())");
   await dashboard.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await new Promise(resolve=>setTimeout(resolve,150));
   await writeFile(path.join(out,'agent-integrations.png'),(await dashboard.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
   await dashboard.webContents.executeJavaScript("document.getElementById('showMyPets').click()");
 }
 assert.deepEqual(await dashboard.webContents.executeJavaScript("[...document.querySelectorAll('.character-grid [data-character]')].map(n=>n.dataset.character)"),['claude'],'fresh installer exposes only Claude');
 let imported=0;
 if(packDirectory){
  const directory=path.resolve(packDirectory),manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8')),{installPetpack}=await load('src/market/package.js');
  for(const pack of manifest.packs){await installPetpack(out,await readFile(path.join(directory,pack.file)),{expectedSHA256:pack.sha256});imported++;}
  const {readEndpoint,request}=await load('src/bridge-client.js');await request(await readEndpoint(out),'/appearances/reload',{},30000);
  for(let i=0;i<100;i++){if(await dashboard.webContents.executeJavaScript("document.querySelectorAll('.character-grid [data-character]').length===4"))break;await new Promise(r=>setTimeout(r,50));}
 }
 const renders=await dashboard.webContents.executeJavaScript(`(async()=>{
  const {CHARACTERS}=await import('../src/characters.js'),{paint,ORDER}=await import('./renderer.js');
  const {readyDeepseekVideoState}=await import('./deepseek-video-actions.js'),{readyWhiteDragonVideoState}=await import('./white-dragon-video-actions.js'),{readyDragonState}=await import('./dragon-actions.js'),{readyInteraction}=await import('./interaction-actions.js'),{readyCustomAppearance}=await import('./custom-appearances.js');
  const ready={'deepseek-h3':readyDeepseekVideoState,'chatgpt-white-dragon-h3':readyWhiteDragonVideoState,'chatgpt-dragon':readyDragonState};
  const canvas=document.createElement('canvas');canvas.width=canvas.height=192;const ctx=canvas.getContext('2d'),checks=[];
  for(const character of CHARACTERS)for(const skin of character.appearances)for(const variant of skin.variants)for(const state of [...ORDER,'click','pet']){
   if(ORDER.includes(state)){if(skin.custom)await readyCustomAppearance(skin.asset,state,variant);else await ready[skin.asset]?.(state,variant);}else await readyInteraction(skin.asset,state,variant);
   paint(ctx,{settings:{character:character.id,appearance:skin.id,variant},current:{state:ORDER.includes(state)?state:'idle'},...(!ORDER.includes(state)?{interaction:state}:{})},200,192,192);
   const pixels=ctx.getImageData(0,0,192,192).data;let opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])opaque++;
   if(!opaque||opaque===192*192)throw Error(skin.asset+'/'+variant+'/'+state+' rendered blank or without transparency');checks.push(skin.asset+'/'+variant+'/'+state);
  }return checks;
 })()`);
 // Export tests also exercise PNG/archive dependencies and both render variants.
 const {CHARACTERS}=await load('src/characters.js'),{exportPetpack,readPetpack}=await load('src/market/package.js');let exports=0;const existingExportFailures=[];
 for(const character of CHARACTERS)for(const skin of character.appearances){
  const input={dataDir:out,pet:{character:character.id,appearance:skin.id},details:{id:'release-check-'+exports,author:'QA',license:'test',version:'1.0.0'}};
  const result=await exportPetpack(input);
  const pkg=await readPetpack(result.bytes);assert.equal(Object.keys(pkg.manifest.clips).length,10);exports++;
 }
 assert.equal(exports,imported?4:1);assert.deepEqual(errors,[]);await writeFile(path.join(out,'workbench.png'),(await dashboard.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 const report={version:JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version,imported,renderChecks:renders.length,exports,existingExportFailures,errors,output:out};await writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));app.exit(0);
}catch(error){console.error(error);app.exit(1);}}
void run();
