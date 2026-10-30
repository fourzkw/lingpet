const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();
const file=path.resolve('desktop/.integrations-layout-smoke.html'),out=path.resolve('artifacts/integrations-layout'),baseline=process.argv.includes('--baseline');
const targets=['codex','cursor','dsh'].map(source=>({source,config:'C:/Users/fourzkw/Environments/agent-workspace-with-a-long-name/.'+source,executable:source==='cursor'?'':'C:/Users/fourzkw/AppData/Roaming/npm/'+source+'.cmd'}));
const state={desktop:true,targets,items:[{id:'codex-main',source:'codex',config:targets[0].config,state:'installed',version:'0.7.24'},{id:'cursor-main',source:'cursor',config:targets[1].config,state:'partial',error:'接入文件已准备，请重新加载 Cursor 窗口后发送消息。'},{id:'dsh-main',source:'dsh',config:targets[2].config,profile:'web',state:'installed',version:'0.7.23',updateAvailable:true,availableVersion:'0.7.24'}]};
const calls=[];
app.whenReady().then(async()=>{
 await fs.mkdir(out,{recursive:true});
 await fs.writeFile(file,(await fs.readFile('desktop/settings.html','utf8')).replace('<script type="module" src="settings.js"></script>',''));
 ipcMain.handle('pet:integrations',(_e,b)=>{calls.push(b);if(b.action==='list')return state;if(b.action==='plan')return {steps:['检查宿主配置','安装接入文件','完成注册']};if(b.action==='choose')return {path:'D:/Agent/Custom'};return {filesReady:true,registered:true};});
 const win=new BrowserWindow({show:false,width:1280,height:960,webPreferences:{preload:path.resolve('desktop/preload.cjs'),contextIsolation:true,sandbox:true}});
 const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message);});
 await win.loadFile(file);
 const run=code=>win.webContents.executeJavaScript(code);
 await run(`import('./integrations-ui.js').then(({initIntegrationsUI})=>{initIntegrationsUI({toast:()=>{},snapshot:()=>({connections:[{source:'cursor',channel:'management'},{source:'dsh',channel:'events'}],sessions:[{scopeId:'dsh-main',source:'dsh',connected:true,state:'idle'}]})});document.getElementById('openIntegrations').click();})`);
 for(let i=0;i<100;i++){if(await run("document.querySelectorAll('#integrationList article').length===3"))break;await new Promise(r=>setTimeout(r,30));}
 await new Promise(r=>setTimeout(r,900));
 for(const width of baseline?[1280]:[1280,900,640,480]){
  win.setSize(width,960);await new Promise(r=>setTimeout(r,200));
  if(!baseline){assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'horizontal overflow at '+width);assert.equal(await run("document.getElementById('integrationAdvanced').open"),false);}
  await fs.writeFile(path.join(out,(baseline?'before':'after')+'-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
 }
 if(!baseline){
  await run("document.getElementById('integrationSource').value='dsh';document.getElementById('integrationSource').dispatchEvent(new Event('change'));document.getElementById('integrationAdvanced').open=true");
  assert.equal(await run("document.getElementById('integrationProfileRow').hidden"),false);
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
  await run("document.getElementById('integrationSource').value='cursor';document.getElementById('integrationSource').dispatchEvent(new Event('change'))");
  assert.equal(await run("document.getElementById('integrationExecutableRow').hidden"),true);
  await run("document.getElementById('integrationSource').value='codex';document.getElementById('integrationSource').dispatchEvent(new Event('change'));document.getElementById('integrationForm').requestSubmit()");
  for(let i=0;i<100;i++){if(await run("document.getElementById('integrationComplete').open"))break;await new Promise(r=>setTimeout(r,30));}
  assert.equal(await run("document.getElementById('integrationComplete').open"),true);
  assert.deepEqual(calls.find(b=>b.action==='install').target,{source:'codex'});
  assert.deepEqual(errors,[]);
 }
 win.destroy();await fs.unlink(file);console.log('Integration layout smoke passed'+(baseline?' (baseline)':''));app.quit();
}).catch(async e=>{console.error(e);await fs.unlink(file).catch(()=>{});app.exit(1);});
