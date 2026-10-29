import {ComfySettings} from './creation/comfy-settings.js';
import {GenerationAPISettings} from './creation/generation-api-settings.js';
import {requireTheme,UI_THEMES} from './ui-themes.js';
import {resolveAppearanceAliases} from './creation/appearance-identity.js';
import {githubLinks} from './market/links.js';
import {app,BrowserWindow,ipcMain,Tray,Menu,nativeImage,screen,dialog,shell} from 'electron';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {desktopStorage,validateStorageTarget} from './maintenance/desktop-data.js';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {PACKAGE_ROOT} from './paths.js';
import {StateStore} from './state-store.js';
import {PetRegistry,DEFAULT_PET} from './pet-registry.js';
import {resolveFollow,bindingFor} from './follow-resolver.js';
import {startLocalServer} from './local-server.js';
import {STATES,LABELS} from './protocol.js';
import {describeRelease} from './release.js';
import {prepareSharedRuntime,compareVersions,confirmRunningSharedRuntime} from './shared-runtime.js';
import {runtimeExecutable} from './bootstrap.js';
import {petWindowSize,positionPetWindow,beginPetDrag} from '../desktop/window-geometry.js';
import {liveContents,isWindowSender,loadPaintedWindow,showLoadedWindow} from '../desktop/window-lifecycle.js';
import {petMenuTemplate} from '../desktop/pet-menu.js';
import {quickControlsModel} from '../desktop/quick-controls-model.js';
import {PET_SCALES,visibilityPatch} from './pet-display.js';
import {appearanceInfo,setCustomAppearances,configureBundledAssets} from './characters.js';
import {availableBuiltinAssets,retainExternalAppearances} from './bundled-appearances.js';
import {loadCustomAppearances,publicAppearances,appearanceSheet} from './creation/catalog.js';

import {CreationService} from './creation/service.js';
import {CreationStore} from './creation/store.js';
import {MarketService} from './market/service.js';
import {loginStartupOptions} from './login-startup.js';
import {diagnosticReport} from './diagnostics.js';
import {installPetpack} from './market/package.js';
import {SettingsStore} from './settings-store.js';
import {IntegrationManager} from './integrations/manager.js';
import {startIntegrationGateway} from './integrations/gateway.js';
import {existsSync} from 'node:fs';
export async function launchDesktop(dir){
  await app.whenReady();await mkdir(dir,{recursive:true});
  const desktop=existsSync(path.join(PACKAGE_ROOT,'desktop-distribution.json'))||process.env.LINGPET_DESKTOP==='1';
  const installRoot=process.env.LINGPET_INSTALL_ROOT||path.resolve(PACKAGE_ROOT,'../../../..');
  if(!desktop&&!process.env.BOARD_PET_SMOKE&&!process.env.BOARD_PET_LIFECYCLE_SMOKE&&!process.env.BOARD_PET_MULTI_SMOKE){
    const managed=await prepareSharedRuntime(dir);
    if(path.resolve(PACKAGE_ROOT)!==path.resolve(managed.root)){
      app.relaunch({execPath:await runtimeExecutable(dir,{root:managed.root}),args:[path.join(managed.root,'desktop/main.js'),...process.argv.slice(2)]});app.quit();return;
    }
  }
  const bundledAssets=await availableBuiltinAssets(PACKAGE_ROOT);
  await retainExternalAppearances(dir,bundledAssets);
  configureBundledAssets(bundledAssets);
  const market=new MarketService(dir);
  let customCharacters=await new CreationStore(dir).list('characters');
  let customAppearances=await loadCustomAppearances(dir);setCustomAppearances(customAppearances,customCharacters);
  const settingsStore=new SettingsStore(dir,raw=>{resolveAppearanceAliases(raw.pets,customAppearances);return new PetRegistry(raw).config;});
  const raw=await settingsStore.load();
  const registry=new PetRegistry(raw),store=new StateStore(),windows=new Map(),views=new Map(),demos=new Map();
  let activePetId=registry.pets[0]?.id??null,settingsWindow,settingsReady,settingsDisplayReady=false,quickWindow,quickPetId,tray,server,quitting=false,updating=false,movingStorage=false;
  let contentRoot=PACKAGE_ROOT,release=await describeRelease(),saveQueue=Promise.resolve();
  const integrations=new IntegrationManager({dir,root:PACKAGE_ROOT,bridge:path.join(installRoot,'LingPetBridge.exe'),version:release.version});let integrationGateway;
  const recentErrors=[],updateFile=path.join(dir,'update-status.json');let updateStatus={phase:'idle',message:'尚未进行本地更新'};
  function recordError(area,error){recentErrors.push({time:new Date().toISOString(),area,message:String(error.message??error).slice(0,500)});if(recentErrors.length>30)recentErrors.shift();}
  if(settingsStore.recovery)recordError('配置恢复',settingsStore.recovery.source==='backup'?'配置损坏或丢失，已从最近有效备份恢复':'配置与备份不可用，已保留损坏文件并使用默认配置');
  async function updateProgress(phase,message,version=release.version){updateStatus={phase,message,version,time:Date.now()};await writeFile(updateFile,JSON.stringify(updateStatus));liveContents(settingsWindow)?.send('pet:system-update',updateStatus);}
  try{updateStatus=JSON.parse(await readFile(updateFile,'utf8'));if(updateStatus.phase==='restarting')await updateProgress(updateStatus.version===release.version?'ready':'error',updateStatus.version===release.version?'更新已完成':'新版启动未完成，已恢复当前版本，可重新选择更新包');else if(['validating','installing'].includes(updateStatus.phase))await updateProgress('error','上次更新未完成，当前版本仍可使用，可重新选择更新包');}catch{}
  function configureLogin(enabled){const options=loginStartupOptions({enabled,executable:desktop?path.join(installRoot,'LingPet.exe'):app.getPath('exe'),root:contentRoot,packaged:desktop||app.isPackaged});app.setLoginItemSettings(options);return app.getLoginItemSettings({path:options.path,args:options.args}).openAtLogin;}
  if(registry.config.global.launchAtLogin)try{configureLogin(true);}catch(error){recordError('开机启动',error);}
  const resumeFile=path.join(dir,'runtime-restart.json');
  if(process.argv.includes('--hot-restart')){
    try{const saved=JSON.parse(await readFile(resumeFile,'utf8'));if(Date.now()-saved.time<30000){store.restore(saved.snapshot);if(registry.get(saved.activePetId))activePetId=saved.activePetId;if(settingsStore.legacy&&store.selected&&registry.pets[0]){const session=store.sessions.get(store.selected);if(session)registry.pets[0].follow=bindingFor(session);}}}catch{}
    await unlink(resumeFile).catch(()=>{});
  }
  function save(){
    saveQueue=settingsStore.save(registry.config);
    void saveQueue.catch(error=>{recordError('配置保存',error);console.warn('配置保存失败',error.message);});return saveQueue;
  }
  function currentFor(id){
    const pet=registry.get(id);if(!pet)return {state:'idle',label:'请新增桌宠',key:null,connected:false};
    const view=views.get(id)||{};let current=resolveFollow(store,pet.follow,view.targetKey,{doneMs:appearanceInfo(pet).doneMs??1800});
    if(pet.follow.mode==='session'&&current.instanceId===pet.follow.scopeId&&current.scopeId&&current.scopeId!==current.instanceId){pet.follow=bindingFor(current);void save();}
    if(current.state==='done'&&(!views.has(id)||view.suppress===`${current.key}:${current.seq}`))current={...current,state:'idle'};
    view.targetKey=current.key;
    const demo=demos.get(id);if(demo)current={...current,state:demo.state,demo:true,label:'演示状态'};
    const key=[id,pet.character,pet.appearance,pet.variant,current.key,current.turn,current.state,demo?.stamp??''].join(':');
    if(view.animationKey!==key){view.animationKey=key;view.startedAt=Date.now();}
    views.set(id,view);return current;
  }
  function silenceHistoricalDone(id){const pet=registry.get(id);if(!pet)return;const current=resolveFollow(store,pet.follow,null,{doneMs:appearanceInfo(pet).doneMs??1800});if(current.state==='done'){const view=views.get(id)||{};view.suppress=`${current.key}:${current.seq}`;views.set(id,view);}}
  function petList(){return registry.pets.map(p=>({...p,current:currentFor(p.id)}));}
  function snapshot(id=activePetId,includeList=true){
    const pet=registry.get(id),current=currentFor(id);
    return {...store.snapshot(),distribution:desktop?'desktop':'plugin',customCharacters,bundledAssets,customAppearances:publicAppearances(customAppearances),current,settings:{...DEFAULT_PET,...pet,launchAtLogin:registry.config.global.launchAtLogin},selected:pet?.follow.mode==='session'?current.key:null,labels:LABELS,pets:includeList?petList():[],activePetId:id,animationKey:views.get(id)?.animationKey,animationStartedAt:views.get(id)?.startedAt??Date.now(),global:registry.config.global};
  }
  function broadcast(){
    if(quitting)return;
    for(const [id,context] of windows)liveContents(context.window)?.send('pet:update',snapshot(id,false));
    liveContents(settingsWindow)?.send('pet:update',snapshot());
    if(quickWindow){const pet=registry.get(quickPetId);if(!pet?.enabled||!pet.petVisible)closeQuickControls();else liveContents(quickWindow)?.send('pet:quick-update');}
  }
  function position(win,pet){
    const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,size=petWindowSize(pet.scale);
    const index=Math.max(0,registry.pets.findIndex(p=>p.id===pet.id)),offset=index*38;
    const x=Number.isFinite(pet.x)?pet.x:area.x+area.width-size.width-30-offset;
    const y=Number.isFinite(pet.y)?pet.y:area.y+area.height-size.height-20-offset;
    const visible=screen.getAllDisplays().some(d=>x+size.width>d.workArea.x+30&&x<d.workArea.x+d.workArea.width-30&&y+size.height>d.workArea.y+30&&y<d.workArea.y+d.workArea.height-30);
    positionPetWindow(win,visible?x:area.x+area.width-size.width-30,visible?y:area.y+area.height-size.height-20,pet.scale);
  }
  function setupContent(win,id){
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
    win.webContents.on('did-finish-load',()=>liveContents(win)?.send('pet:update',snapshot(id??activePetId)));
  }
  function stopDrag(context,persist=true){
    clearInterval(context.dragTimer);context.dragTimer=null;
    if(persist&&registry.get(context.id)&&liveContents(context.window)){
      const [x,y]=context.window.getPosition();registry.update(context.id,{x,y});
    }
  }
  function createWindow(pet){
    const win=new BrowserWindow({...petWindowSize(pet.scale),title:pet.name,icon:path.join(PACKAGE_ROOT,'assets/brand/app.ico'),frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,resizable:false,alwaysOnTop:pet.alwaysOnTop,skipTaskbar:true,show:false,webPreferences:{preload:path.join(contentRoot,'desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    const context={id:pet.id,window:win,dragTimer:null,destroying:false};windows.set(pet.id,context);setupContent(win,pet.id);position(win,pet);
    context.ready=win.loadFile(path.join(contentRoot,'desktop/pet.html'),{query:{theme:registry.config.global.theme}});context.ready.catch(error=>{if(liveContents(win))console.warn('桌宠页面加载失败',error.message);});
    win.once('ready-to-show',()=>{if(liveContents(win)&&registry.get(pet.id)?.petVisible)win.showInactive();});
    win.on('close',event=>{if(!quitting&&!context.destroying){event.preventDefault();registry.update(pet.id,{petVisible:false});}});
    win.on('closed',()=>{stopDrag(context,false);if(windows.get(pet.id)===context)windows.delete(pet.id);});
    return context;
  }
  function syncWindows(){
    for(const [id,context] of windows){const pet=registry.get(id);if(!pet||!pet.enabled){context.destroying=true;stopDrag(context,false);context.window.destroy();}}
    for(const pet of registry.pets){
      if(!pet.enabled)continue;let context=windows.get(pet.id);if(!context)context=createWindow(pet);
      if(!liveContents(context.window))continue;
      context.window.setTitle(pet.name);context.window.setAlwaysOnTop(pet.alwaysOnTop);
      if(!context.dragTimer)position(context.window,pet);
      if(pet.petVisible)context.window.showInactive();else context.window.hide();
    }
    if(!registry.get(activePetId))activePetId=registry.pets[0]?.id??null;
  }
  function openSettings(id){
    if(quitting)return;if(id&&registry.get(id))activePetId=id;
    if(liveContents(settingsWindow)){if(settingsDisplayReady)showLoadedWindow(settingsWindow);broadcast();return;}
    const win=new BrowserWindow({width:1130,height:850,minWidth:850,minHeight:680,title:'灵伴 · 多桌宠工作台',icon:path.join(PACKAGE_ROOT,'assets/brand/app.ico'),show:false,backgroundColor:UI_THEMES.find(t=>t.id===registry.config.global.theme).background,autoHideMenuBar:true,webPreferences:{preload:path.join(contentRoot,'desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    settingsWindow=win;settingsDisplayReady=false;setupContent(win);
    win.once('closed',()=>{if(settingsWindow===win){settingsWindow=null;settingsReady=null;settingsDisplayReady=false;}});
    win.webContents.on('render-process-gone',(_event,details)=>{
      console.warn('工作台渲染进程退出',details.reason,details.exitCode);
      recordError('工作台渲染',new Error(details.reason+' / '+details.exitCode));
      if(!win.isDestroyed())win.destroy();
    });
    settingsReady=loadPaintedWindow(win,path.join(contentRoot,'desktop/settings.html'),{query:{theme:registry.config.global.theme}}).then(()=>{
      if(quitting||settingsWindow!==win||!liveContents(win))return;
      settingsDisplayReady=true;showLoadedWindow(win);
    });
    settingsReady.catch(error=>{
      if(win.isDestroyed())return;
      console.warn('工作台页面加载失败',error.message);win.destroy();
    });
  }
  function senderId(event){for(const [id,c] of windows)if(isWindowSender(event,c.window))return id;return null;}
  function authorized(event){return isWindowSender(event,settingsWindow)||senderId(event)!==null;}
  function targetId(event){if(!authorized(event))throw new Error('无效的窗口');const id=senderId(event)||activePetId;registry.require(id);return id;}
  function clearDemo(id){clearTimeout(demos.get(id)?.timer);demos.delete(id);}
  function closeQuickControls(){if(quickWindow&&!quickWindow.isDestroyed())quickWindow.close();}
  function quickModel(){
    const id=quickPetId,pet=registry.require(id),current=currentFor(id);
    return quickControlsModel(petMenuTemplate(pet,{stateLabel:LABELS[current.state],demo:Boolean(current.demo),update:value=>{if(value.follow){clearDemo(id);silenceHistoricalDone(id);}registry.update(id,value);},openSettings:()=>{closeQuickControls();openSettings(id);},endDemo:()=>{clearDemo(id);broadcast();}}));
  }
  ipcMain.handle('pet:quick-get',event=>{
    if(!isWindowSender(event,quickWindow))throw new Error('无效的快捷栏');
    const pet=registry.require(quickPetId);return {name:pet.name+' · '+LABELS[currentFor(quickPetId).state],scale:pet.scale,theme:registry.config.global.theme,items:quickModel().items};
  });
  ipcMain.handle('pet:quick-action',(event,body)=>{
    if(!isWindowSender(event,quickWindow))throw new Error('无效的快捷栏');
    if(body?.id==='scale'){
      if(!Number.isInteger(body.step)||body.step<0||body.step>=PET_SCALES.length)throw new Error('无效大小档位');
      registry.update(quickPetId,{scale:PET_SCALES[body.step]});
    }else{
      const action=quickModel().actions.get(body?.id);if(!action)throw new Error('无效的快捷操作');
      action({checked:Boolean(body.checked)});
    }
    return {ok:true};
  });
  ipcMain.on('pet:quick-close',event=>{if(isWindowSender(event,quickWindow))closeQuickControls();});
  function showQuickControls(id){
    const context=windows.get(id),pet=registry.get(id);
    if(!pet||!liveContents(context?.window)||context.menuOpen)return;
    closeQuickControls();
    stopDrag(context);context.menuOpen=true;context.window.setIgnoreMouseEvents(false);
    const cursor=screen.getCursorScreenPoint(),area=screen.getDisplayNearestPoint(cursor).workArea,width=Math.min(290,area.width),height=Math.min(540,area.height);
    const win=new BrowserWindow({width,height,x:Math.max(area.x,Math.min(cursor.x,area.x+area.width-width)),y:Math.max(area.y,Math.min(cursor.y,area.y+area.height-height)),title:'桌宠快捷栏',icon:path.join(PACKAGE_ROOT,'assets/brand/app.ico'),frame:false,resizable:false,show:false,alwaysOnTop:true,skipTaskbar:true,backgroundColor:UI_THEMES.find(t=>t.id===registry.config.global.theme).background,autoHideMenuBar:true,webPreferences:{preload:path.join(contentRoot,'desktop/quick-controls-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    quickWindow=win;quickPetId=id;
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
    win.once('closed',()=>{if(quickWindow===win){quickWindow=null;quickPetId=null;}context.menuOpen=false;liveContents(context.window)?.send('pet:quick-controls-closed');});
    win.on('blur',()=>{if(!win.isDestroyed())win.close();});
    loadPaintedWindow(win,path.join(contentRoot,'desktop/quick-controls.html'),{query:{theme:registry.config.global.theme}}).then(()=>{if(quickWindow===win)showLoadedWindow(win);}).catch(error=>{if(!win.isDestroyed())win.close();console.warn('桌宠快捷控制打开失败',error.message);});
  }
  function manage(body){
    const {action,id,value}=body||{};let pet;
    if(action==='create'){pet=registry.create(value||{});activePetId=pet.id;silenceHistoricalDone(pet.id);}
    else if(action==='duplicate'){pet=registry.duplicate(id);activePetId=pet.id;silenceHistoricalDone(pet.id);}
    else if(action==='update'){pet=registry.update(id,value);if(value?.follow){clearDemo(id);silenceHistoricalDone(id);}}
    else if(action==='remove'){clearDemo(id);registry.remove(id);views.delete(id);}
    else if(action==='select'){registry.require(id);activePetId=id;}
    else throw new Error('未知桌宠操作');
    broadcast();return {ok:true,pets:petList(),activePetId};
  }
  async function reloadAppearances(){customCharacters=await new CreationStore(dir).list('characters');customAppearances=await loadCustomAppearances(dir);setCustomAppearances(customAppearances,customCharacters);resolveAppearanceAliases(registry.pets,customAppearances);await save();broadcast();return {synced:true,count:customAppearances.length};}
  ipcMain.handle('pet:system',async(event,body)=>{
    if(!isWindowSender(event,settingsWindow))throw new Error('仅工作台可访问应用管理');
    if(body?.action==='comfy-config')return new ComfySettings(dir).get();
    if(body?.action==='comfy-configure')return new ComfySettings(dir).configure(body.values);
    if(body?.action==='comfy-inspect')return new CreationService(dir).environment({action:'inspect'});
    if(body?.action==='generation-preferences')return new GenerationAPISettings(dir).priorities();
    if(body?.action==='generation-preferences-save')return new GenerationAPISettings(dir).setPriorities(body.priorities);
    if(body?.action==='generation-api-config')return new GenerationAPISettings(dir).get();
    if(body?.action==='generation-api-configure')return new GenerationAPISettings(dir).configure(body.kind,body.values);
    if(body?.action==='status'||body?.action==='diagnostics'){
      const report=diagnosticReport({release,pets:registry.pets,sessions:store.snapshot().sessions,uptime:process.uptime(),memory:process.memoryUsage(),logs:recentErrors,update:updateStatus,platform:process.platform,login:registry.config.global.launchAtLogin});
      return {...report,storage:await desktopStorage(dir),distribution:desktop?'desktop':'plugin',settingsRecovery:settingsStore.recovery,loginSupported:process.platform==='win32'||process.platform==='darwin'&&app.isPackaged};
    }
    if(body?.action==='change-storage'){
      if(!desktop)throw Error('请使用独立本体安装版修改内容目录');
      if(movingStorage||updating)throw Error('正在维护应用，请稍候');
      const tasks=await new CreationStore(dir).list('tasks');
      if(tasks.some(task=>['submitting','submission_unknown','queued','running','processing','finalizing','cancelling'].includes(task.status)))throw Error('请先完成或取消正在进行的创作任务，再修改内容目录');
      const selected=await dialog.showOpenDialog(settingsWindow,{title:'选择新的内容目录（空文件夹）',properties:['openDirectory','createDirectory']});if(selected.canceled)return {cancelled:true};
      const target=await validateStorageTarget({root:installRoot,dir,target:selected.filePaths[0]});if(target.unchanged)return {unchanged:true};
      const answer=await dialog.showMessageBox(settingsWindow,{type:'question',title:'迁移内容目录',message:'迁移现有内容并重新打开灵伴？',detail:'新目录：'+target.target+'\n设置、下载的桌宠、形象和创作内容将复制到新位置。原内容会保留备份，Agent 接入不变。',buttons:['迁移并重启','取消'],defaultId:1,cancelId:1});if(answer.response!==0)return {cancelled:true};
      await save();movingStorage=true;
      try{const child=spawn(path.join(installRoot,'LingPetMaintenance.exe'),['--move-data',target.target],{cwd:installRoot,windowsHide:true,stdio:'ignore',env:{...process.env,BOARD_PET_DATA_DIR:dir,LINGPET_INSTALL_ROOT:installRoot}});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();return {restarting:true};}catch(error){movingStorage=false;throw error;}
    }
    if(body?.action==='open-settings-folder'){const error=await shell.openPath(dir);if(error)throw new Error(error);return {opened:true};}
    if(body?.action==='restore-settings'){
      const answer=await dialog.showMessageBox(settingsWindow,{type:'question',title:'恢复配置备份',message:'恢复上一次保存前的有效配置？',detail:'将恢复桌宠列表、位置、外观与跟随设置，当前配置会另外保留。',buttons:['恢复备份','取消'],defaultId:1,cancelId:1});
      if(answer.response!==0)return {cancelled:true};
      await saveQueue.catch(()=>{});const restored=await settingsStore.restore();
      // Startup registration is an operating-system preference; apply it
      // explicitly when restoring the saved global setting.
      try{configureLogin(restored.global.launchAtLogin);}catch(error){recordError('恢复开机启动',error);restored.global.launchAtLogin=registry.config.global.launchAtLogin;}
      registry.config=restored;for(const id of demos.keys())clearDemo(id);views.clear();activePetId=registry.pets[0]?.id??null;
      syncWindows();trayMenu();broadcast();return {restored:true};
    }
    if(body?.action==='theme'){
      registry.config.global.theme=requireTheme(body.theme);await save();broadcast();return snapshot();
    }
    if(body?.action==='login'){
      if(typeof body.enabled!=='boolean')throw new Error('无效开关');const actual=configureLogin(body.enabled);if(actual!==body.enabled)throw new Error('系统未接受开机启动设置，请重试');registry.config.global.launchAtLogin=actual;await save();broadcast();return {enabled:actual};
    }
    if(body?.action==='export-diagnostics'){
      const report=diagnosticReport({release,pets:registry.pets,sessions:store.snapshot().sessions,uptime:process.uptime(),memory:process.memoryUsage(),logs:recentErrors,update:updateStatus,platform:process.platform,login:registry.config.global.launchAtLogin});
      const selected=await dialog.showSaveDialog(settingsWindow,{title:'导出运行诊断',defaultPath:'lingpet-diagnostics.json',filters:[{name:'运行诊断',extensions:['json']}]});if(selected.canceled)return {cancelled:true};await writeFile(selected.filePath,JSON.stringify(report,null,2));return {path:selected.filePath};
    }
    if(body?.action==='install-update'){
      if(desktop)throw Error('请先从托盘退出灵伴，再运行新版 LingPet 安装程序升级；桌宠配置与形象会保留。');
      if(updating||['validating','installing'].includes(updateStatus.phase))throw new Error('正在更新，请稍候');
      const selected=await dialog.showOpenDialog(settingsWindow,{title:'选择已解压的灵伴更新包目录',properties:['openDirectory']});if(selected.canceled)return {cancelled:true};
      try{await updateProgress('validating','正在校验更新包…');const offered=await describeRelease(selected.filePaths[0]);if(compareVersions(offered.version,release.version)<=0)throw new Error('请选择比当前版本更新的安装包');return await updateRuntime({root:offered.root});}catch(error){recordError('安装更新',error);const message=error.code==='ENOENT'?'所选目录不是完整的灵伴更新包，请选择解压后的程序目录。':error.message;await updateProgress('error',message);throw new Error(message);}
    }
    throw new Error('未知应用管理操作');
  });
  ipcMain.handle('pet:integrations',async(event,body)=>{
    if(!isWindowSender(event,settingsWindow))throw Error('仅工作台可管理 Agent 接入');
    if(body?.action==='list')return {...await integrations.discover(),desktop};
    if(body?.action==='choose'){
      const config=body.kind==='config';const selected=await dialog.showOpenDialog(settingsWindow,{title:config?'选择宿主配置目录':'选择宿主命令文件',properties:[config?'openDirectory':'openFile'],...(!config?{filters:[{name:'命令入口',extensions:['exe','cmd','bat']}]}:{})});
      return {path:selected.canceled?null:selected.filePaths[0]};
    }
    if(!desktop)throw Error('请使用独立本体安装版管理接入');
    if(body?.action==='plan'){const plan=await integrations.plan(body.target);return {steps:plan.steps,changes:plan.changes.map(change=>({file:change.file})),source:plan.source};}
    if(body?.action==='install')return integrations.install(body.target);
    if(body?.action==='inspect')return integrations.inspect(body.id);
    if(body?.action==='remove')return integrations.remove(body.id);
    throw Error('未知接入操作');
  });
  ipcMain.handle('pet:character',async(event,body)=>{if(!isWindowSender(event,settingsWindow))throw new Error('无效的窗口');const result=await new CreationService(dir).character(body||{});await reloadAppearances();return result;});
  ipcMain.handle('pet:market',async(event,body)=>{
    if(!isWindowSender(event,settingsWindow))throw new Error('仅工作台可访问市场管理');
    if(body?.action==='config')return market.config();
    if(body?.action==='library'){const result=await market.library({checkUpdates:Boolean(body.checkUpdates),appearances:customAppearances});return {...result,activeAppearance:registry.get(activePetId)?.appearance};}
    if(body?.action==='uninstall'){
      const entry=customAppearances.find(e=>e.id===body.appearanceId);if(!entry)throw new Error('该形象未安装');
      const ids=new Set([entry.id,...(entry.aliases||[]).map(a=>a.id)]),used=registry.pets.filter(p=>ids.has(p.appearance));
      const answer=await dialog.showMessageBox(settingsWindow,{type:'question',title:'卸载形象',message:'卸载「'+(entry.package?.name||entry.name)+'」？',detail:used.length?'正在使用的桌宠将恢复为默认角色，跟随设置保留。':'将从本机角色库移除此形象，可再次安装。',buttons:['卸载','取消'],defaultId:1,cancelId:1});if(answer.response!==0)return {cancelled:true};
      await market.uninstall(entry.id);for(const pet of used)registry.update(pet.id,{character:DEFAULT_PET.character,appearance:DEFAULT_PET.appearance,variant:DEFAULT_PET.variant});
      await reloadAppearances();return {snapshot:snapshot()};
    }
    if(body?.action==='use-version'){
      const entry=customAppearances.find(e=>e.id===body.appearanceId);if(!entry)throw new Error('该版本未安装');const pet=registry.require(body.petId);manage({action:'update',id:pet.id,value:{character:entry.character,appearance:entry.id,variant:entry.variants.includes(pet.variant)?pet.variant:entry.variants[0]}});await save();return {snapshot:snapshot()};
    }
    if(body?.action==='configure')return market.configure(body.url);
    if(body?.action==='list')return market.list(body.query);
    if(body?.action==='detail')return market.detail(body.versionId);
    if(body?.action==='github'){const links=githubLinks(body.repository,body.tag);if(!['repository','release'].includes(body.target))throw new Error('无效 GitHub 链接类型');await shell.openExternal(links[body.target]);return {opened:true};}
    if(body?.action==='image')return market.image(body);
    if(body?.action==='submit')return market.submit(body.details);
    if(body?.action==='lookup')return market.lookup(body);
    if(body?.action==='receipts')return market.receipts();
    if(body?.action==='receipt-export'){
      const receipt=await market.receiptForExport(body);
      const selected=await dialog.showSaveDialog(settingsWindow,{title:'保存投稿凭证',defaultPath:'lingpet-submission-'+receipt.id.slice(0,8)+'.json',filters:[{name:'投稿凭证',extensions:['json']}]});if(selected.canceled)return {cancelled:true};await writeFile(selected.filePath,JSON.stringify(receipt,null,2),{mode:0o600});return {saved:true,path:selected.filePath};
    }
    if(body?.action==='open'){const {url}=await market.config();const target=new URL('/market',url);if(body.versionId){if(!/^[a-f0-9]{48}$/.test(body.versionId))throw new Error('无效版本编号');target.searchParams.set('version',body.versionId);}await shell.openExternal(target.href);return {opened:true};}
    if(body?.action==='export'){
      const pet=structuredClone(registry.require(body.petId||activePetId));const result=await market.export(pet,body.details||{});const selected=await dialog.showSaveDialog(settingsWindow,{title:'导出桌宠分享包',defaultPath:result.name,filters:[{name:'灵伴桌宠包',extensions:['petpack']}]});if(selected.canceled)return {cancelled:true};await writeFile(selected.filePath,result.bytes);return {exported:true,path:selected.filePath,sha256:result.sha256,size:result.bytes.length};
    }
    let result;
    if(body?.action==='import'){const selected=await dialog.showOpenDialog(settingsWindow,{title:'导入桌宠分享包',properties:['openFile'],filters:[{name:'灵伴桌宠包',extensions:['petpack']}]});if(selected.canceled)return {cancelled:true};const {stat}=await import('node:fs/promises');if((await stat(selected.filePaths[0])).size>200*1024*1024)throw new Error('资源包过大');result=await installPetpack(dir,await readFile(selected.filePaths[0]));}
    else if(body?.action==='install')result=await market.install(body.versionId);
    else throw new Error('未知市场操作');
    await reloadAppearances();const entry=result.appearance,variant=entry.variants.includes('pixel')?'pixel':entry.variants[0];
    if(body.mode==='apply'){registry.require(body.petId);manage({action:'update',id:body.petId,value:{character:entry.character,appearance:entry.id,variant}});}
    else if(body.mode==='new')manage({action:'create',value:{name:entry.package.name,character:entry.character,appearance:entry.id,variant}});
    await save();return {...result,snapshot:snapshot()};
  });
  ipcMain.handle('pet:appearance-sheet',(event,body)=>{if(!authorized(event))throw new Error('无效的窗口');return appearanceSheet(customAppearances,body);});
  ipcMain.handle('pet:get',event=>{if(!authorized(event))throw new Error('无效的窗口');return snapshot(senderId(event)||activePetId);});
  ipcMain.handle('pet:manage',(event,body)=>{if(!isWindowSender(event,settingsWindow))throw new Error('仅工作台可管理其他桌宠');manage(body);return snapshot();});
  ipcMain.handle('pet:settings',async(event,value)=>{
    const id=targetId(event);
    if('launchAtLogin'in(value||{})){
      registry.config.global.launchAtLogin=configureLogin(Boolean(value.launchAtLogin));
    }
    registry.update(id,value);if(value?.follow){clearDemo(id);silenceHistoricalDone(id);}await save();broadcast();return snapshot(id);
  });
  ipcMain.handle('pet:select',(event,key)=>{const id=targetId(event);const session=key&&store.sessions.get(key);if(key&&!session)throw new Error('会话不存在');registry.update(id,{follow:session?bindingFor(session):{mode:'global'}});clearDemo(id);silenceHistoricalDone(id);broadcast();return snapshot(id);});
  ipcMain.handle('pet:demo',(event,state)=>{
    const id=targetId(event);if(state!==null&&!STATES.includes(state))throw new Error('无效演示状态');clearDemo(id);
    if(state!==null){const demo={state,stamp:Date.now()};if(state==='done')demo.timer=setTimeout(()=>{clearDemo(id);broadcast();},appearanceInfo(registry.require(id)).doneMs??1800);demos.set(id,demo);}broadcast();return snapshot(id);
  });
  ipcMain.on('pet:show-settings',event=>{if(authorized(event))openSettings(senderId(event));});
  ipcMain.on('pet:quick-controls',event=>{const id=senderId(event);if(id)showQuickControls(id);});
  ipcMain.on('pet:hide',event=>{if(authorized(event)){const id=senderId(event)||activePetId;if(registry.get(id))registry.update(id,{petVisible:false});}});
  ipcMain.on('pet:ignore-mouse',(event,value)=>{const context=windows.get(senderId(event));if(context&&!context.dragTimer&&!context.menuOpen)context.window.setIgnoreMouseEvents(Boolean(value),{forward:true});});
  ipcMain.on('pet:drag',(event,start)=>{
    const context=windows.get(senderId(event));if(!context)return;
    if(start&&!context.dragTimer){context.window.setIgnoreMouseEvents(false);const move=beginPetDrag(context.window,screen.getCursorScreenPoint(),registry.require(context.id).scale);let ticks=0;
      context.dragTimer=setInterval(()=>{if(!liveContents(context.window)){stopDrag(context,false);return;}move(screen.getCursorScreenPoint());if(++ticks>750)stopDrag(context);},16);
    }else if(!start)stopDrag(context);
  });
  function trayMenu(){if(!tray)return;tray.setContextMenu(Menu.buildFromTemplate([
    {label:'打开多桌宠工作台',click:()=>openSettings()},
    {label:'新增桌宠',click:()=>{manage({action:'create',value:{name:'新桌宠'}});openSettings(activePetId);}},
    {label:'显示所有桌宠',click:()=>{for(const p of registry.pets)registry.update(p.id,visibilityPatch(true));}},
    {type:'separator'},{label:'退出全部桌宠',click:quitAll},
  ]));}
  function quitAll(){if(quitting)return;writeFileSync(path.join(dir,'runtime.paused'),'用户已退出全部桌宠');quitting=true;setTimeout(async()=>{await saveQueue.catch(()=>{});await integrationGateway?.close();await server?.close();app.quit();},50);}
  registry.on('change',()=>{syncWindows();trayMenu();void save();broadcast();});
  store.on('change',broadcast);syncWindows();await save();
  tray=new Tray(nativeImage.createFromPath(path.join(PACKAGE_ROOT,'assets/tray.png')));tray.setToolTip('灵伴 · 多桌宠');trayMenu();tray.on('double-click',()=>openSettings());
  let confirming=false,lastConfirmation=0;
  const tick=setInterval(()=>{store.tick();broadcast();if(!desktop&&!confirming&&Date.now()-lastConfirmation>5000){confirming=true;lastConfirmation=Date.now();void confirmRunningSharedRuntime(dir).catch(error=>recordError('运行版本同步',error)).finally(()=>{confirming=false;});}},1000);
  async function updateRuntime(body){
    if(desktop)throw Error('本体由独立安装程序维护，请运行新版 LingPet 安装程序');
    if(updating)return {action:'restarting'};
    const offered=await describeRelease(body.root);
    if(compareVersions(offered.version,release.version)<0)return {action:'ignored',reason:'older-version'};
    await updateProgress('installing','正在复制更新包并校验文件…',offered.version);
    const next=await prepareSharedRuntime(dir,{root:body.root});
    if(next.conflict||next.blocked){await updateProgress('error',next.blocked?'该更新曾启动失败，保留当前版本':'同版本内容冲突，保留当前版本');return {action:'ignored',reason:next.blocked?'failed-release':'same-version-conflict'};}
    if(next.backendHash===release.backendHash){
      if(next.frontendHash===release.frontendHash){release=next;contentRoot=next.root;await updateProgress('ready','当前版本已就绪');return {action:'unchanged'};}
      closeQuickControls();await Promise.all([...windows.values()].map(c=>c.ready));contentRoot=next.root;release=next;
      await Promise.all([...windows.values()].map(c=>c.ready=c.window.loadFile(path.join(contentRoot,'desktop/pet.html'))));
      if(liveContents(settingsWindow))await settingsWindow.loadFile(path.join(contentRoot,'desktop/settings.html'));await updateProgress('ready','更新已完成');broadcast();return {action:'reloaded'};
    }
    updating=true;await updateProgress('restarting','正在重启桌宠，新版本将自动恢复工作台…',next.version);await save();await writeFile(resumeFile,JSON.stringify({time:Date.now(),snapshot:store.snapshot(),activePetId}));
    setTimeout(async()=>{
      const env={...process.env,BOARD_PET_DATA_DIR:dir,ELECTRON_RUN_AS_NODE:'1'};delete env.NODE_OPTIONS;
      const guardian=spawn(app.getPath('exe'),[path.join(PACKAGE_ROOT,'bin/runtime-guardian.js'),...(liveContents(settingsWindow)?['--dashboard']:[])],{env,detached:true,windowsHide:true,stdio:'ignore'});guardian.unref();
      quitting=true;await server.close();app.quit();
    },150);
    return {action:'restarting'};
  }
  server=await startLocalServer(store,dir,{distribution:desktop?'desktop':'plugin',reloadAppearances,getRelease:()=>release,quitPet:quitAll,showDashboard:body=>{openSettings(body?.petId);return {ok:true};},petManager:{list:()=>({ok:true,pets:petList(),activePetId}),manage},updateRuntime});
  if(desktop){
    const control={async run(action){
      if(!['status','start','stop','settings'].includes(action))throw Error('无效管理操作');
      if(action==='settings')openSettings();
      if(action==='start'){if(!registry.pets.length)manage({action:'create',value:{name:'灵伴'}});for(const pet of registry.pets)registry.update(pet.id,visibilityPatch(true));}
      if(action==='stop')for(const pet of registry.pets)registry.update(pet.id,visibilityPatch(false));
      return {running:true,pets:petList(),runtime:{phase:'ready',message:'灵伴本体已内置运行环境'},state:store.current().state};
    }};
    integrationGateway=await startIntegrationGateway({manager:integrations,store,control,creation:new CreationService(dir)});
  }else await confirmRunningSharedRuntime(dir);
  app.on('second-instance',(_event,args)=>{if(args.includes('--dashboard'))openSettings();else for(const pet of registry.pets)registry.update(pet.id,visibilityPatch(true));});
  if(process.argv.includes('--dashboard')||process.argv.includes('--demo')||settingsStore.recovery)openSettings();
  if(process.argv.includes('--demo')&&activePetId){demos.set(activePetId,{state:'thinking',stamp:Date.now()});broadcast();}
  app.on('window-all-closed',()=>{});
  app.on('before-quit',()=>{quitting=true;clearInterval(tick);for(const c of windows.values())stopDrag(c,false);for(const id of demos.keys())clearDemo(id);void integrationGateway?.close();void server?.close();});
  app.on('will-quit',()=>tray?.destroy());
  const first=windows.values().next().value;
  if(process.env.BOARD_PET_SMOKE==='1'&&first){const {runDesktopSmoke}=await import('../scripts/desktop-smoke.mjs');await runDesktopSmoke({app,petWindow:first.window,openSettings,getSettingsWindow:()=>settingsWindow,store,dir,snapshot});}
  if(process.env.BOARD_PET_LIFECYCLE_SMOKE==='1'&&first){const {runWindowLifecycleSmoke}=await import('../scripts/window-lifecycle-smoke.mjs');await runWindowLifecycleSmoke({app,ipcMain,petWindow:first.window,petReady:first.ready,openSettings,getSettingsWindow:()=>settingsWindow,getSettingsReady:()=>settingsReady});}
  if(process.env.BOARD_PET_MULTI_SMOKE==='1'){const {runMultiPetSmoke}=await import('../scripts/multi-pet-smoke.mjs');await runMultiPetSmoke({app,registry,store,windows,openSettings,getSettingsWindow:()=>settingsWindow,getSettingsReady:()=>settingsReady,dir,snapshot});}
}
