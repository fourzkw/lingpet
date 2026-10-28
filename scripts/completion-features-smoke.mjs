import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {dialog} from 'electron';
import path from 'node:path';
import {dataDirectory,PACKAGE_ROOT} from '../src/paths.js';
import {CreationStore} from '../src/creation/store.js';
import {readPetpack} from '../src/market/package.js';
export async function runCompletionFeaturesSmoke(win){
 const version=JSON.parse(await readFile(path.join(PACKAGE_ROOT,'package.json'),'utf8')).version;
 const out=path.join(PACKAGE_ROOT,'artifacts/completion-features-smoke');await mkdir(out,{recursive:true});
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),wc=win.webContents,dir=dataDirectory(),original=await wc.executeJavaScript('window.pet.get()');
 const server=createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify([{id:'c'.repeat(48),status:'approved',repository:'test/jade',pet:{id:'jade-test',version:'3.0.0'}}]));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const market='http://127.0.0.1:'+server.address().port;
 const store=new CreationStore(dir);for(const entry of await store.list('appearances')){entry.source.market=market;await store.write('appearances',entry);}
 const oldSave=dialog.showSaveDialog,oldOpen=dialog.showOpenDialog;
 try{
  await wc.executeJavaScript(`window.pet.market({action:'configure',url:${JSON.stringify(market)}})`);
  const result=await wc.executeJavaScript(`(async()=>{
   const $=id=>document.getElementById(id),wait=ms=>new Promise(r=>setTimeout(r,ms));
   const assert=(v,m)=>{if(!v)throw new Error(m);};
   assert($('patSensitivity')&&$('launchAtLogin')&&$('appVersion'),'feature controls exist');
   $('headPat').checked=false;await $('headPat').onchange();assert($('patSensitivity').disabled,'disabled head pats disable sensitivity');
   $('headPat').checked=true;await $('headPat').onchange();$('patSensitivity').value='sensitive';await $('patSensitivity').onchange();
   $('interactionHints').checked=false;await $('interactionHints').onchange();
   const value=await window.pet.get();assert(value.settings.patSensitivity==='sensitive'&&!value.settings.interactionHints,'preferences saved');
   assert(value.pets.find(p=>p.id!==value.activePetId).patSensitivity==='normal','other pet preferences unchanged');
   const diagnostics=await window.pet.system({action:'diagnostics'});assert(diagnostics.version===${JSON.stringify(version)}&&diagnostics.pets.length===2,'real runtime diagnostics');
   assert(!JSON.stringify(diagnostics).includes('first-test-pet'),'diagnostics omit pet IDs');
   document.querySelector('.system-panel').open=true;await wait(150);assert($('appVersion').textContent.includes(${JSON.stringify(version)}),'version displayed');
   return diagnostics;
  })()`);
  await writeFile(path.join(out,'diagnostic-result.json'),JSON.stringify(result,null,2));
  dialog.showSaveDialog=async()=>({canceled:false,filePath:path.join(out,'diagnostics-export.json')});
  await wc.executeJavaScript("window.pet.system({action:'export-diagnostics'})");assert.equal(JSON.parse(await readFile(path.join(out,'diagnostics-export.json'))).version,version);
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});
  await assert.rejects(wc.executeJavaScript("window.pet.system({action:'install-update'})"));
  assert.equal((await wc.executeJavaScript("window.pet.system({action:'status'})")).update.phase,'error','invalid package leaves recoverable error state');
  await wc.executeJavaScript("document.getElementById('openAppSettings').click();document.getElementById('refreshDiagnostics').click();document.querySelector('.system-panel').scrollIntoView({block:'center'})");await pause(150);
  await writeFile(path.join(out,'application.png'),(await wc.capturePage()).toPNG());
  await wc.executeJavaScript("document.getElementById('openMarket').onclick()");
  await wc.executeJavaScript("document.querySelector('[data-market-tab=installed]').onclick()");
  assert.equal(await wc.executeJavaScript("document.querySelectorAll('#installedLibrary option').length"),2,'two local versions visible');
  assert.equal((await wc.executeJavaScript("window.pet.market({action:'library',checkUpdates:true})")).groups[0].update.version,'3.0.0','approved same-repository update offered');
  for(const version of ['2-0-0','1-0-0']){
   await wc.executeJavaScript(`(async()=>{const s=document.querySelector('#installedLibrary select');s.value='fixture-jade-${version}';await document.querySelector('#installedLibrary button').onclick();})()`);
   const value=await wc.executeJavaScript('window.pet.get()');assert.equal(value.settings.appearance,'fixture-jade-'+version);assert.equal(value.pets.find(p=>p.id==='other-test-pet').appearance,'classic');
  }
  await writeFile(path.join(out,'versions.png'),(await wc.capturePage()).toPNG());
  const painted=await wc.executeJavaScript(`(async()=>{
   const {readyInteraction,paintInteraction}=await import('./interaction-actions.js');await readyInteraction('custom:fixture-jade-1-0-0','pet','original');
   const c=document.createElement('canvas');c.width=c.height=192;const ctx=c.getContext('2d'),frames=new Set();let ink=0,clear=0;
   for(const t of [0,500,1000,1500,2000]){ctx.clearRect(0,0,192,192);if(!paintInteraction(ctx,'custom:fixture-jade-1-0-0','pet',t,192,192,'original','review'))throw new Error('custom interaction playback missing');frames.add(c.toDataURL());}
   const p=ctx.getImageData(0,0,192,192).data;for(let i=3;i<p.length;i+=4)p[i]?ink++:clear++;
   return {frames:frames.size,ink,clear,url:c.toDataURL()};
  })()`);assert.ok(painted.frames>2&&painted.ink>1000&&painted.clear>1000,'custom dedicated interaction moves on transparent canvas');
  await writeFile(path.join(out,'corrected-jade-render.png'),Buffer.from(painted.url.split(',')[1],'base64'));
  dialog.showSaveDialog=async()=>({canceled:false,filePath:path.join(out,'interaction-export.petpack')});
  await wc.executeJavaScript("window.pet.market({action:'export',details:{id:'jade-qa-export',author:'local QA',license:'Local QA',version:'1.0.0'}})");
  const pack=await readPetpack(await readFile(path.join(out,'interaction-export.petpack')));assert.equal(pack.manifest.clips.pet.loop,false);assert.equal(pack.manifest.clips.click.loop,false);
  await wc.executeJavaScript(`(async()=>{await window.pet.settings(${JSON.stringify(original.settings)});document.getElementById('showMyPets').click();document.querySelector('.system-panel').open=false;window.scrollTo(0,0);})()`);
  return ['interaction preferences and sensitivity save independently','version, diagnostics export and invalid-update recovery work','installed versions update detection, switching and offline rollback preserve other pets','custom dedicated animation renders and re-exports both interactions'];
 }finally{dialog.showSaveDialog=oldSave;dialog.showOpenDialog=oldOpen;await new Promise(r=>server.close(r));}
}
