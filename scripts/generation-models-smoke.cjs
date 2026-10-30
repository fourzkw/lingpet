const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
app.disableHardwareAcceleration();
const root=process.cwd(),file=path.join(root,'desktop','.generation-models-smoke.html'),out=path.join(root,'artifacts','generation-models');
let dataDir,mode='success',release,failSave=false;
app.whenReady().then(async()=>{
 await fs.mkdir(out,{recursive:true});dataDir=await fs.mkdtemp(path.join(out,'data-'));
 const {GenerationAPISettings}=await import(pathToFileURL(path.join(root,'src/creation/generation-api-settings.js')).href);
 const settings=new GenerationAPISettings(dataDir);
 await settings.configure('image',{url:'https://image.example/v1',model:'image-model',apiKey:'private-image'});
 await settings.configure('seedance',{url:'https://seed.example/api/v3',model:'seed-model',apiKey:'private-seed'});
 await fs.writeFile(file,'<html><head><link rel="stylesheet" href="settings.css"></head><body data-page="app"><main class="app-settings-page" id="root"></main></body></html>');
 ipcMain.handle('pet:system',async(_event,body)=>{
  if(body.action==='generation-api-config')return settings.get();
  if(body.action==='generation-preferences')return settings.priorities();
  if(body.action==='generation-preferences-save'){if(failSave)throw Error('test save failed');return settings.setPriorities(body.priorities);}
  if(body.action==='generation-api-configure')return settings.configure(body.kind,body.values);
  if(body.action==='generation-video-save')return settings.saveVideo(body.id,body.values);
  if(body.action==='generation-video-remove')return settings.removeVideo(body.id);
  if(body.action==='generation-api-models'){
   if(mode==='error')throw Error('此服务未提供模型列表接口，请手动填写模型名称');
   if(mode==='empty')return [];
   if(mode==='deferred')await new Promise(resolve=>release=resolve);
   return ['image-model','video-model','<model>'];
  }
  throw Error('unexpected action: '+body.action);
 });
 const win=new BrowserWindow({show:false,width:1200,height:1100,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),contextIsolation:true,sandbox:true}});
 await win.loadFile(file);const run=code=>win.webContents.executeJavaScript(code);
 await run(`(async()=>{const {initGenerationAPISettings}=await import('./generation-api-ui.js');const {initGenerationPriority}=await import('./generation-priority-ui.js');const root=document.getElementById('root');initGenerationPriority(root,{toast:()=>{}});initGenerationAPISettings(root,{toast:()=>{}});})()`);
 async function until(code){for(let i=0;i<100;i++){if(await run(code))return;await new Promise(resolve=>setTimeout(resolve,30));}throw Error('UI did not settle: '+code);}
 await until(`document.querySelectorAll('.generation-priority-list li').length===5&&document.querySelector('.video-api-entry')`);
 assert.equal(await run("document.querySelector('[data-kind=image] [data-provider-id=imagegen] label').textContent"),'Codex ImageGen');
 assert.equal(await run(`document.querySelectorAll('.generation-api-settings details').length`),2);
 assert.equal(await run(`document.querySelector('.video-api-card').open`),false);
 await run(`document.querySelector('.video-api-card').open=true`);
 for(const vendor of ['minimax','grok','gemini','grok']){
  const before=(await settings.get()).videoApis.length;
  await run(`document.querySelector('.video-api-card > button').click()`);
  assert.equal((await settings.priorities()).video.length,before+1,'unsaved drafts do not enter priorities');
  const result=await run(`(async()=>{const form=document.querySelector('.video-api-editor form');form.elements.vendor.value=${JSON.stringify(vendor)};form.elements.vendor.onchange();form.elements.name.value=${JSON.stringify(vendor+' 账号 '+before)};form.elements.apiKey.value='ui-test-key';await form.querySelector('[data-action=models]').onclick();form.elements.availableModel.value='video-model';form.elements.availableModel.onchange();await form.onsubmit({preventDefault(){}});return true;})()`);
  assert.equal(result,true);await until(`document.querySelectorAll('.video-api-entry').length===${before+1}&&document.querySelectorAll('[data-kind=video] li').length===${before+2}`);
 }
 const stored=await settings.get();assert.equal(stored.videoApis.length,5);assert.equal(stored.videoApis.filter(v=>v.vendor==='grok').length,2);assert.ok(!JSON.stringify(stored).includes('ui-test-key'));
 const targetId=stored.videoApis.find(v=>v.vendor==='gemini').id;
 await run(`(()=>{const list=document.querySelector('[data-kind=video]');const source=list.querySelector('[data-provider-id="${targetId}"] .generation-drag-handle');const target=list.firstElementChild;const dataTransfer=new DataTransfer();source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer}));target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer,clientY:target.getBoundingClientRect().top+1}));target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer,clientY:target.getBoundingClientRect().top+1}));})()`);
 await until(`document.querySelector('[data-kind=video] li').dataset.providerId==='${targetId}'&&!document.querySelector('.generation-drag-handle').disabled`);assert.equal((await settings.priorities()).video[0].id,targetId);
 await run(`document.querySelector('[data-kind=video] .generation-drag-handle').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}))`);
 await until(`document.querySelectorAll('[data-kind=video] li')[1].dataset.providerId==='${targetId}'&&!document.querySelector('.generation-drag-handle').disabled`);assert.equal((await settings.priorities()).video[1].id,targetId);
 const savedOrder=await settings.priorities();failSave=true;
 await run(`document.querySelector('[data-kind=video] .generation-drag-handle').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}))`);
 await until(`document.querySelector('.generation-priority [role=status]').textContent.includes('test save failed')&&!document.querySelector('.generation-drag-handle').disabled`);assert.deepEqual(await settings.priorities(),savedOrder);failSave=false;
 const id=stored.videoApis[1].id;
 await run(`document.querySelector('.video-api-entry[data-service-id="${id}"] button').click()`);
 await run(`(async()=>{const form=document.querySelector('.video-api-editor form');form.elements.model.value='updated-model';await form.onsubmit({preventDefault(){}});})()`);
 await until(`document.querySelector('.generation-priority').textContent.includes('updated-model')`);
 assert.equal((await settings.read()).videoApis.find(v=>v.id===id).apiKey,'ui-test-key');
 await run(`(async()=>{const button=document.querySelector('.video-api-entry[data-service-id="${id}"] button:last-child');await button.onclick();await button.onclick();})()`);
 await until(`document.querySelectorAll('.video-api-entry').length===4&&document.querySelectorAll('[data-kind=video] li').length===5`);
 for(const [nextMode,expected] of [['empty','未返回可用模型'],['error','手动填写']]){
  mode=nextMode;await run(`document.querySelector('.video-api-card > button').click()`);
  assert.ok((await run(`(async()=>{const form=document.querySelector('.video-api-editor form');await form.querySelector('[data-action=models]').onclick();return form.querySelector('[role=status]').textContent;})()`)).includes(expected));
 }
 mode='deferred';await run(`window.pendingModels=document.querySelector('.video-api-editor [data-action=models]').onclick();undefined`);
 for(let i=0;!release&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(release);
 await run(`const input=document.querySelector('.video-api-editor input[name=url]');input.value='https://changed.example/v1';input.dispatchEvent(new Event('input'));`);release();await run('window.pendingModels');
 assert.match(await run(`document.querySelector('.video-api-editor [role=status]').textContent`),/配置已变更/);
 await run(`[...document.querySelectorAll('.video-api-editor button')].find(button=>button.textContent==='取消').click()`);
 for(const width of [640,1200]){win.setSize(width,1100);await new Promise(resolve=>setTimeout(resolve,350));assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);await fs.writeFile(path.join(out,'settings-'+width+'.png'),(await win.webContents.capturePage()).toPNG());}
 await fs.unlink(file);await fs.rm(dataDir,{recursive:true,force:true});console.log('PASS: unified video list; four vendors; multiple accounts; draft/save/edit/delete priority sync; drag and keyboard order; failed save rollback; models/error/stale handling; narrow layout.');app.exit(0);
}).catch(async error=>{console.error(error);await fs.unlink(file).catch(()=>{});if(dataDir)await fs.rm(dataDir,{recursive:true,force:true});app.exit(1);});
