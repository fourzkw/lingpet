import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { readFile, mkdir, open, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PACKAGE_ROOT } from './paths.js';
import {prepareSharedRuntime,rollbackSharedRuntime,confirmRunningSharedRuntime,compareVersions} from './shared-runtime.js';
import {withInstallLock} from './install-lock.js';
import {readEndpoint,request} from './bridge-client.js';
import {nodeSupported,startupHelp} from './startup-help.js';
import {runtimeProgress} from './runtime-progress.js';
import {startInstalledDesktop} from './desktop-installation.js';

const require=createRequire(import.meta.url);
let pending;
export async function runtimeExecutable(dir,{preferUserCache=false,root=PACKAGE_ROOT}={}) {
  const runtimeRequire=createRequire(path.join(root,'package.json'));
  const electronRoot=path.dirname(runtimeRequire.resolve('electron/package.json'));
  const {version}=JSON.parse(await readFile(path.join(electronRoot,'package.json'),'utf8'));
  const relative=process.platform==='win32'?'electron.exe':process.platform==='darwin'?'Electron.app/Contents/MacOS/Electron':'electron';
  const installed=path.join(electronRoot,'dist',relative);
  if(existsSync(installed)&&!preferUserCache)return installed;
  // Keep downloaded binaries in per-user storage, not in pnpm's shared/possibly read-only package store.
  const runtime=path.join(dir,'runtime',`electron-${version}-${process.platform}-${process.arch}`),executable=path.join(runtime,relative);
  await mkdir(dir,{recursive:true});
  const lockfile=path.join(dir,'runtime-prepare.lock');let lock;
  const deadline=Date.now()+180000;
  while(!lock){
    if(existsSync(executable))return executable;
    try{lock=await open(lockfile,'wx');}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      try{if(Date.now()-(await stat(lockfile)).mtimeMs>240000)await unlink(lockfile);}catch{}
      if(Date.now()>deadline)throw new Error('运行时仍在准备，请稍后重试');
      await new Promise(resolve=>setTimeout(resolve,500));
    }
  }
  const progress=runtimeProgress(dir,version);
  try{
    if(existsSync(executable))return executable;
    await progress.stage('downloading',`首次启动需要下载 Electron ${version}，正在连接下载服务，请稍候…`);
    const electronRequire=createRequire(path.join(electronRoot,'package.json'));
    const {downloadArtifact}=electronRequire('@electron/get');
    const {extract}=electronRequire('@electron-internal/extract-zip');
    const checksums=JSON.parse(await readFile(path.join(electronRoot,'checksums.json'),'utf8'));
    const artifact=await downloadArtifact({version,artifactName:'electron',platform:process.platform,arch:process.arch,cacheRoot:path.join(dir,'runtime-cache'),checksums,downloadOptions:{quiet:true,getProgressCallback:value=>progress.progress(value).catch(()=>{})}});
    await progress.flush();
    await progress.stage('extracting','Electron 下载及校验完成，正在解压…');
    await mkdir(runtime,{recursive:true});await extract(artifact,{dir:runtime});
    if(!existsSync(executable))throw new Error('运行时解压后缺少可执行文件');
    await progress.stage('ready','Electron 已准备就绪，正在启动桌宠…');
    return executable;
  }catch(error){await progress.flush().catch(()=>{});await writeFile(path.join(dir,'runtime-status.json'),JSON.stringify({phase:'error',message:startupHelp(error,dir),version,time:Date.now()}));console.error('[灵伴] Electron 准备失败：'+startupHelp(error,dir));throw error;}
  finally{await lock.close();await unlink(lockfile).catch(()=>{});}
}
export async function ensureRuntime(dir,{demo=false,dashboard=false,explicit=false,hotRestart=false}={}) {
  // Desktop installations own their lifecycle. Legacy callers may explicitly
  // reveal the app, but an event must never reinstall or wake it after exit.
  if(await startInstalledDesktop(dir,{dashboard,explicit}))return;
  const paused=path.join(dir,'runtime.paused');
  if(existsSync(paused)) {
    if(explicit||demo||dashboard)unlinkSync(paused);else return;
  }
  if(pending)return pending;
  pending=withInstallLock(path.join(dir,'runtime-start.lock'),async()=>{
    if(!nodeSupported())throw new Error('需要 Node.js 22.19 或更高版本');
    const release=await prepareSharedRuntime(dir);
    const existing=await readEndpoint(dir);
    if(existing)try{
      const health=await request(existing,'/health');
      if(health.release&&compareVersions(health.release.version,release.version)>0){await confirmRunningSharedRuntime(dir);if(dashboard)await request(existing,'/dashboard',{},3000);return;}
      if(health.release?.backendHash!==release.backendHash||health.release?.frontendHash!==release.frontendHash){const update=await request(existing,'/runtime/update',{root:release.root},30000);if(update.action==='restarting')return;}
      if(dashboard)await request(existing,'/dashboard',{},3000);
      return;
    }catch{}
    const executable=await runtimeExecutable(dir,{root:release.root});
    const env={...process.env,BOARD_PET_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
    const child=spawn(executable,[path.join(release.root,'desktop','main.js'),...(hotRestart?['--hot-restart']:[]),...(demo?['--demo']:[]),...(dashboard?['--dashboard']:[])],{env,detached:true,windowsHide:true,stdio:'ignore'});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
    // A failed new release must not replace a working previous installation.
    for(let i=0;i<300;i++){
      await new Promise(resolve=>setTimeout(resolve,200));
      try{const endpoint=await readEndpoint(dir);if(endpoint){const health=await request(endpoint,'/health');if(health.release?.backendHash===release.backendHash&&health.release?.frontendHash===release.frontendHash){await confirmRunningSharedRuntime(dir);return;}}}catch{}
    }
    const previous=await rollbackSharedRuntime(dir,release.root);
    if(!previous){const live=await confirmRunningSharedRuntime(dir);if(live&&compareVersions(live.version,release.version)>=0)return;}
    child.kill();await new Promise(resolve=>setTimeout(resolve,300));
    if(previous){
      const fallback=spawn(await runtimeExecutable(dir,{root:previous.root}),[path.join(previous.root,'desktop/main.js'),'--hot-restart',...(dashboard?['--dashboard']:[])],{env,detached:true,windowsHide:true,stdio:'ignore'});fallback.unref();
    }
    throw new Error(previous?'新版启动失败，已恢复上一版桌宠':'桌宠启动超时，请查看运行时诊断');
  }).catch(async error=>{const message=startupHelp(error,dir);await writeFile(path.join(dir,'runtime-status.json'),JSON.stringify({phase:'error',message,time:Date.now()})).catch(()=>{});throw new Error(message,{cause:error});}).finally(()=>{pending=null;});
  return pending;
}
