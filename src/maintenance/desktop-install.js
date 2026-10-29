import path from 'node:path';
import {mkdir,cp,access,readFile,rm,readdir,lstat} from 'node:fs/promises';
import {atomicRename} from '../atomic-directory.js';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {json,atomic,inside,optional} from '../integrations/files.js';
import {withInstallLock} from '../install-lock.js';
import {readEndpoint,request} from '../bridge-client.js';
import {compareVersions} from '../shared-runtime.js';
import {stopDesktopForUpgrade} from './desktop-stop.js';
import {replaceDesktopLaunchers} from './desktop-launchers.js';

export async function installDesktop({payload,root,dir,healthCheck=true,launchArguments=[]}){
  root=path.resolve(root);payload=path.resolve(payload);dir=path.resolve(dir??path.join(root,'data'));
  if(root===path.parse(root).root||root===payload||inside(root,payload)||inside(payload,root))throw Error('无效本体安装目录');
  const dataWithinRoot=inside(root,dir),dataTop=dataWithinRoot?path.relative(root,dir).split(path.sep)[0]:null;
  const ownedNames=new Set(['versions','maintenance','LingPet.exe','LingPetBridge.exe','LingPetMaintenance.exe','active.json','desktop-location.json','storage-move-result.json','maintenance.lock'].map(name=>name.toLowerCase()));
  if(root===dir||inside(dir,root)||dir===path.parse(dir).root||dataTop&&ownedNames.has(dataTop.toLowerCase()))throw Error('数据目录不能覆盖程序文件或包含安装目录');
  try{if((await lstat(root)).isSymbolicLink())throw Error('安装目录不能是目录链接');}catch(error){if(error.code!=='ENOENT')throw error;}
  const app=path.join(payload,'resources/app'),pkg=await json(path.join(app,'package.json'),null);
  if(!pkg?.lingpetDesktop||!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(pkg.version))throw Error('不是独立本体安装包');
  const manifest=await json(path.join(payload,'desktop-manifest.json'),null);
  if(manifest?.format!==1||manifest.version!==pkg.version||!Array.isArray(manifest.files))throw Error('安装包缺少文件校验清单');
  for(const entry of manifest.files){const file=path.resolve(payload,entry.file);if(!inside(payload,file)||createHash('sha256').update(await readFile(file)).digest('hex')!==entry.sha256)throw Error('安装文件校验失败：'+entry.file);}
  for(const file of ['electron.exe','node.exe','LingPet.exe','LingPetBridge.exe','LingPetMaintenance.exe'])await access(path.join(payload,file));
  await mkdir(root,{recursive:true});await mkdir(dir,{recursive:true});
  return withInstallLock(path.join(root,'maintenance.lock'),async()=>{
    const previous=await json(path.join(root,'active.json'),null);
    const locationBefore=await optional(path.join(root,'desktop-location.json'));
    const location=locationBefore?JSON.parse(locationBefore):null;
    if(location?.dataDir&&path.resolve(location.dataDir)!==dir)throw Error('升级须沿用已有数据目录，更换目录前请先卸载并备份数据');
    const installationBefore=await optional(path.join(dir,'desktop-install.json'));
    const installation=installationBefore?JSON.parse(installationBefore):null;
    if(installation?.root&&path.resolve(installation.root)!==root){try{await access(path.join(installation.root,'active.json'));throw Error('已在其他目录安装灵伴，请先卸载原安装再更换位置');}catch(error){if(error.code!=='ENOENT')throw error;}}
    if(!previous)for(const name of await readdir(root)){
      if(name==='maintenance.lock'||name===dataTop)continue;
      if(dataTop&&name.startsWith(dataTop+'.backup-')){const backup=await json(path.join(root,name,'desktop-install.json'),null).catch(()=>null);if(backup?.root&&path.resolve(backup.root)===root)continue;}
      throw Error('安装目录非空，请选择独立的空文件夹');
    }
    if(previous&&(!installation||path.resolve(installation.root)!==root))throw Error('安装目录缺少匹配的灵伴安装记录，请选择空文件夹');
    if(previous&&compareVersions(previous.active,pkg.version)>0)throw Error('请使用不低于已安装版本的本体安装包');
    const target=path.join(root,'versions',pkg.version);
    let existing=false;try{await access(target);existing=true;}catch{}
    if(existing&&await optional(path.join(target,'desktop-manifest.json'))!==await optional(path.join(payload,'desktop-manifest.json')))throw Error('已存在同版本的不同内容，请使用新的版本号构建升级包');
    await stopDesktopForUpgrade(dir);
    const staging=path.join(root,'versions','.staging-'+randomUUID());await mkdir(staging,{recursive:true});
    const settingsBefore=await optional(path.join(dir,'settings.json'));
    let launchers;
    try{
      if(!existing){await cp(payload,staging,{recursive:true});await atomicRename(staging,target);}
      launchers=await replaceDesktopLaunchers(payload,root);
      const next={format:1,active:pkg.version,previous:previous?.active??null};await atomic(path.join(root,'active.json'),JSON.stringify(next));
      await atomic(path.join(root,'desktop-location.json'),JSON.stringify({...location,format:1,root,dataDir:dir,version:pkg.version}));
      await atomic(path.join(dir,'desktop-install.json'),JSON.stringify({...(installationBefore?JSON.parse(installationBefore):{}),format:1,root,dataDir:dir,version:pkg.version}));
      if(healthCheck){
        const env={...process.env,BOARD_PET_DATA_DIR:dir,LINGPET_INSTALL_ROOT:root};delete env.NODE_OPTIONS;delete env.ELECTRON_RUN_AS_NODE;
        const child=spawn(path.join(root,'LingPet.exe'),launchArguments,{env,detached:true,windowsHide:true,stdio:'ignore'});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
        let healthy=false;
        for(let i=0;i<100;i++){await new Promise(resolve=>setTimeout(resolve,200));const current=await readEndpoint(dir);if(current)try{const health=await request(current,'/health',undefined,500),gateway=await json(path.join(dir,'integrations/endpoint.json'),null);if(health.distribution==='desktop'&&health.release?.version===pkg.version&&gateway?.pid===current.pid){healthy=true;await request(current,'/quit',{});for(let tick=0;tick<50;tick++){await new Promise(resolve=>setTimeout(resolve,100));try{await request(current,'/health',undefined,200);}catch{break;}}break;}}catch{}}
        if(!healthy)throw Error('新版本启动检查失败');
      }
      await launchers.commit();
      return {installed:true,root,version:pkg.version,previous:previous?.active??null};
    }catch(error){
      const current=await readEndpoint(dir);if(current)try{const health=await request(current,'/health');if(health.distribution==='desktop'&&health.release?.version===pkg.version)await request(current,'/quit',{});}catch{}
      if(settingsBefore!==null)await atomic(path.join(dir,'settings.json'),settingsBefore);
      if(locationBefore!==null)await atomic(path.join(root,'desktop-location.json'),locationBefore);else await rm(path.join(root,'desktop-location.json'),{force:true});
      if(previous){await atomic(path.join(root,'active.json'),JSON.stringify(previous));if(installationBefore!==null)await atomic(path.join(dir,'desktop-install.json'),installationBefore);}
      else {await rm(path.join(root,'active.json'),{force:true});await rm(path.join(dir,'desktop-install.json'),{force:true});}
      if(launchers)try{await launchers.rollback();}catch(restoreError){throw Error(error.message+'；启动入口恢复失败：'+restoreError.message);}
      throw Error(error.message+(error.launcherRestoreFailed?'':previous?'；已恢复上一版本入口':'；未激活新版本，安装文件已保留以便诊断'));
    }
  });
}
