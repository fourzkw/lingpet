import {cp,mkdir,readFile,writeFile,rename,access,realpath} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {describeRelease} from './release.js';
import {PACKAGE_ROOT} from './paths.js';
import {withInstallLock} from './install-lock.js';
import {publishDirectory} from './atomic-directory.js';
import {readEndpoint,request} from './bridge-client.js';

// Electron's patched fs treats *.asar as directories. Installer copies must use
// the raw filesystem, otherwise copying Electron's own distribution can stall.
let copyTree=cp;
if(process.versions.electron){
  const original=createRequire(import.meta.url)('original-fs');copyTree=original.promises.cp.bind(original.promises);
}

export const SHARED_PROTOCOL=1;
export function compareVersions(a,b){
  const parse=v=>{if(!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(v))throw new Error('无效的运行时版本');return v.split('-')[0].split('.').map(Number);};
  const x=parse(a),y=parse(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;
  const ap=a.includes('-'),bp=b.includes('-');if(ap!==bp)return ap?-1:1;return a===b?0:a.localeCompare(b);
}
function managedPath(base,name){
  if(typeof name!=='string'||!/^[\w.-]+$/.test(name))throw new Error('无效的共享运行时目录');
  const root=path.resolve(base,'releases',name);if(path.dirname(root)!==path.resolve(base,'releases'))throw new Error('运行时目录越界');return root;
}
async function readManifest(base){try{return JSON.parse(await readFile(path.join(base,'active.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function commit(base,value){const temp=path.join(base,'active-'+randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(value,null,2));await rename(temp,path.join(base,'active.json'));}
async function liveRelease(dir){
  const endpoint=await readEndpoint(dir);if(!endpoint)return null;
  try{
    const health=await request(endpoint,'/health',undefined,1500),root=health.release?.root;
    if(typeof root!=='string')return null;
    const release=await describeRelease(root),base=path.resolve(dir,'shared/releases');
    if(path.dirname(release.root)!==base||release.backendHash!==health.release.backendHash||release.frontendHash!==health.release.frontendHash||release.version!==health.release.version)return null;
    return release;
  }catch{return null;}
}
async function reconcileLive(dir,manifest){
  const running=await liveRelease(dir);if(!running)return {manifest,running:null};
  const base=path.join(dir,'shared'),name=path.basename(running.root);
  // A healthy older process must not undo a newer installation still starting.
  if(manifest&&compareVersions(manifest.version,running.version)>0)return {manifest,running};
  if(manifest?.active===name&&!manifest.blocked?.includes(name))return {manifest,running};
  const next={protocol:SHARED_PROTOCOL,active:name,previous:manifest?.active!==name?manifest?.active??null:manifest?.previous??null,blocked:(manifest?.blocked??[]).filter(n=>n!==name),version:running.version,backendHash:running.backendHash,frontendHash:running.frontendHash};
  await commit(base,next);return {manifest:next,running};
}
export async function confirmRunningSharedRuntime(dir){
  const base=path.join(dir,'shared');
  return withInstallLock(path.join(base,'install.lock'),async()=>{const {running}=await reconcileLive(dir,await readManifest(base));return running;});
}
export async function activeSharedRelease(dir){
  const base=path.join(dir,'shared'),manifest=await readManifest(base);if(!manifest)return null;
  if(manifest.protocol!==SHARED_PROTOCOL)throw new Error('共享桌宠协议不兼容，请升级接入插件');
  const release=await describeRelease(managedPath(base,manifest.active));
  if(release.backendHash!==manifest.backendHash||release.frontendHash!==manifest.frontendHash)throw new Error('共享运行时校验失败');
  return release;
}

async function copyElectronDependencies(from,to){
  const installed=new Map();
  async function copy(name,parentPackage,targetModules,optional=false){
    let pkgFile;
    try{
      const require=createRequire(parentPackage);
      try{pkgFile=require.resolve(name+'/package.json');}catch{
        let cursor=path.dirname(require.resolve(name));
        while(true){try{const file=path.join(cursor,'package.json');if(JSON.parse(await readFile(file,'utf8')).name===name){pkgFile=file;break;}}catch{}
          const next=path.dirname(cursor);if(next===cursor)throw new Error('依赖缺少 package.json: '+name);cursor=next;}
      }
    }catch(error){if(optional)return;throw error;}
    const source=await realpath(path.dirname(pkgFile)),pkg=JSON.parse(await readFile(path.join(source,'package.json'),'utf8'));
    let target=path.join(to,'node_modules',name);
    if(installed.has(name)){
      if(installed.get(name)===source)return;
      target=path.join(targetModules,name);
    }else installed.set(name,source);
    await copyTree(source,target,{recursive:true,filter:file=>file===source||path.basename(file)!=='node_modules'});
    for(const dependency of Object.keys(pkg.dependencies||{}))await copy(dependency,path.join(source,'package.json'),path.join(target,'node_modules'));
    for(const dependency of Object.keys(pkg.optionalDependencies||{}))await copy(dependency,path.join(source,'package.json'),path.join(target,'node_modules'),true);
  }
  for(const name of ['electron','pngjs','yauzl','yazl'])
    await copy(name,path.join(from,'package.json'),path.join(to,'node_modules'));
}

export async function prepareSharedRuntime(dir,{root=PACKAGE_ROOT,copyDependencies=copyElectronDependencies}={}){
  const candidate=await describeRelease(root),pkg=JSON.parse(await readFile(path.join(candidate.root,'package.json'),'utf8'));
  if((pkg.boardPetProtocol??1)!==SHARED_PROTOCOL)throw new Error('安装包协议不兼容');
  const base=path.join(dir,'shared');
  return withInstallLock(path.join(base,'install.lock'),async()=>{
    const {manifest}=await reconcileLive(dir,await readManifest(base));let current=null;
    if(manifest){try{current=await activeSharedRelease(dir);}catch{/* Repair from a valid candidate; preserve previous files. */}}
    if(current){
      const order=compareVersions(candidate.version,current.version);
      if(order<0)return current;
      if(order===0&&candidate.backendHash===current.backendHash&&candidate.frontendHash===current.frontendHash)return current;
      // A version is immutable. First successfully installed content wins, preventing
      // two adapters carrying different same-version bundles from oscillating.
      if(order===0)return {...current,conflict:true};
    }
    const name=candidate.version+'-'+candidate.backendHash.slice(0,12)+'-'+candidate.frontendHash.slice(0,12);
    if(manifest?.blocked?.includes(name)&&current)return {...current,blocked:true};
    const target=managedPath(base,name);let release;
    try{release=await describeRelease(target);}catch{}
    if(!release){
      const staging=managedPath(base,name+'-staging-'+randomUUID());await mkdir(staging,{recursive:true});
      for(const file of ['src','desktop','bin','assets','package.json'])await copyTree(path.join(candidate.root,file),path.join(staging,file),{recursive:true});
      // Keep the runtime package identity readable by already-installed legacy
      // adapters. Public npm distribution uses lingpet; protocol/data stay stable.
      const packageFile=path.join(staging,'package.json'),runtimePackage=JSON.parse(await readFile(packageFile,'utf8'));
      if(runtimePackage.name==='lingpet'){runtimePackage.name='dsh-board-pet';runtimePackage.lingpetDistribution=true;await writeFile(packageFile,JSON.stringify(runtimePackage,null,2));}
      await copyDependencies(candidate.root,staging);
      const check=await describeRelease(staging);
      if(check.backendHash!==candidate.backendHash||check.frontendHash!==candidate.frontendHash)throw new Error('共享运行时复制校验失败，保留原版本');
      await publishDirectory(staging,target);release=await describeRelease(target);
    }
    if(release.backendHash!==candidate.backendHash||release.frontendHash!==candidate.frontendHash)throw new Error('已安装运行时内容不一致');
    await commit(base,{protocol:SHARED_PROTOCOL,active:name,previous:manifest?.active??null,blocked:manifest?.blocked??[],version:release.version,backendHash:release.backendHash,frontendHash:release.frontendHash});
    return release;
  });
}

export async function rollbackSharedRuntime(dir,failedRoot){
  const base=path.join(dir,'shared');
  return withInstallLock(path.join(base,'install.lock'),async()=>{
    const manifest=await readManifest(base);if(!manifest?.previous||managedPath(base,manifest.active)!==path.resolve(failedRoot))return null;
    const running=await liveRelease(dir);
    if(running&&compareVersions(running.version,manifest.version)>=0){await reconcileLive(dir,manifest);return null;}
    const root=managedPath(base,manifest.previous),previous=await describeRelease(root);
    await commit(base,{protocol:SHARED_PROTOCOL,active:manifest.previous,previous:null,blocked:[...new Set([...(manifest.blocked??[]),manifest.active])],version:previous.version,backendHash:previous.backendHash,frontendHash:previous.frontendHash});return previous;
  });
}
