import {cp,mkdir,readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {withInstallLock} from './install-lock.js';
import {compareVersions} from './shared-runtime.js';
import {describeRelease} from './release.js';
import {readEndpoint,request} from './bridge-client.js';
import {publishDirectory as rename} from './atomic-directory.js';

export async function syncCursorPlugin(source,target,{dir}={}){
  source=path.resolve(source);target=path.resolve(target);
  if(path.basename(target)!=='board-pet'||path.basename(path.dirname(target))!=='local')throw Error('无效 Cursor 本地插件目录');
  const offered=JSON.parse(await readFile(path.join(source,'.cursor-plugin/plugin.json'),'utf8'));
  if(offered.name!=='board-pet')throw Error('不是灵伴 Cursor 插件');
  const incoming=await describeRelease(path.join(source,'runtime'));
  const base=path.resolve(target,'../..');
  return withInstallLock(path.join(base,'board-pet-install.lock'),async()=>{
    let current,owned=false;
    try{const installed=JSON.parse(await readFile(path.join(target,'.cursor-plugin/plugin.json'),'utf8'));if(installed.name!=='board-pet')throw Error('本地插件目录已被其他插件占用');
      // Refuse to update a junction into an unrelated checkout.
      owned=true;const resolved=await realpath(target);if(process.platform==='win32'?resolved.toLowerCase()!==target.toLowerCase():resolved!==target)throw Error('本地插件目录是链接，请先备份并移除旧链接');
      current=await describeRelease(path.join(target,'runtime'));
    }catch(error){if(error.code!=='ENOENT')throw error;}
    if(current&&(compareVersions(current.version,incoming.version)>0||current.version===incoming.version&&current.backendHash===incoming.backendHash&&current.frontendHash===incoming.frontendHash))return {changed:false,version:current.version,target};
    const staging=path.join(base,'board-pet-staging',randomUUID()),backup=path.join(base,'board-pet-backups',Date.now()+'-'+randomUUID());
    await mkdir(path.dirname(staging),{recursive:true});await cp(source,staging,{recursive:true,errorOnExist:true,force:false});
    const checked=await describeRelease(path.join(staging,'runtime'));if(checked.backendHash!==incoming.backendHash||checked.frontendHash!==incoming.frontendHash)throw Error('Cursor 插件复制校验失败，旧版保留');
    await mkdir(path.dirname(target),{recursive:true});
    if(owned){await mkdir(path.dirname(backup),{recursive:true});try{await rename(target,backup);}catch(error){
      if(dir&&['EPERM','EBUSY','EACCES'].includes(error.code)){
        const endpoint=await readEndpoint(path.join(dir,'cursor'));if(endpoint)try{const health=await request(endpoint,'/health');if(health.name==='board-ai-pet'){await request(endpoint,'/quit',{});await new Promise(r=>setTimeout(r,500));}}catch{}
        try{await rename(target,backup);}catch(cause){throw new Error('旧 Cursor 插件仍被占用，请退出 Cursor 后重新安装；旧版未修改',{cause});}
      }else throw new Error('旧 Cursor 插件仍被占用，请退出 Cursor 后重新安装；旧版未修改',{cause:error});
    }}
    try{await rename(staging,target);}catch(error){if(owned)await rename(backup,target);throw error;}
    return {changed:true,version:incoming.version,target,...(owned?{backup}:{})};
  });
}
