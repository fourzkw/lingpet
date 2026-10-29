import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {removeCodexUserHooks,removeCodexPluginOverrides,CODEX_USER_LAUNCHER} from './codex-hook-config.js';
import {removeCursorHooks} from './cursor-hook-config.js';
import {readEndpoint,request} from './bridge-client.js';
import {withInstallLock} from './install-lock.js';
import {publishDirectory as rename} from './atomic-directory.js';

const exec=promisify(execFile),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const optional=async file=>{try{return await readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
async function checkedDirectory(dir){
 const resolved=path.resolve(dir);if(resolved===path.parse(resolved).root||samePath(resolved,path.resolve(os.homedir())))throw Error('拒绝操作根目录或用户主目录');
 try{if(!samePath(await realpath(resolved),resolved))throw Error('卸载目标不能是目录链接');}catch(e){if(e.code!=='ENOENT')throw e;}
 return resolved;
}
async function atomic(file,text){await mkdir(path.dirname(file),{recursive:true});const temp=file+'.lingpet-'+randomUUID()+'.tmp';await writeFile(temp,text,{mode:0o600});await rename(temp,file);}
export async function clearLingPetStartup(dir){
 if(process.platform!=='win32')return {supported:false};
 const key='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';let stdout;
 try{({stdout}=await exec('reg.exe',['query',key,'/v','LingPet'],{windowsHide:true}));}catch(e){if(e.code===1)return {removed:false};throw e;}
 const command=stdout.match(/\bLingPet\s+REG_\w+\s+(.+)/)?.[1];
 if(!command||!command.replaceAll('\\','/').toLowerCase().includes(path.resolve(dir).replaceAll('\\','/').toLowerCase()+'/'))throw Error('同名开机启动项不属于当前灵伴数据目录，未修改');
 await exec('reg.exe',['delete',key,'/v','LingPet','/f'],{windowsHide:true});
 try{await exec('reg.exe',['delete','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run','/v','LingPet','/f'],{windowsHide:true});}catch(e){if(e.code!==1)throw e;}
 return {removed:true};
}
export async function stopOwnedServices(dir){
 for(const folder of [path.join(dir,'codex'),path.join(dir,'cursor'),dir]){
  const endpoint=await readEndpoint(folder);if(!endpoint)continue;
  let health;try{health=await request(endpoint,'/health',undefined,1500);}catch{continue;}
  if(health.name!=='board-ai-pet')throw Error('停止服务时遇到不属于灵伴的端点');
  await request(endpoint,'/quit',{},5000);
  const deadline=Date.now()+20000;
  while(true){let alive=true;try{process.kill(endpoint.pid,0);}catch(e){alive=e.code==='EPERM';}
   if(!alive)break;if(Date.now()>deadline)throw Error('灵伴后台尚未退出，请关闭宿主后重试；未移动用户数据');await sleep(100);
  }
 }
}
export async function uninstallLingPet({dir,codexDir=process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),cursorDir=path.join(os.homedir(),'.cursor'),apply=false,archiveData=false,stopServices=stopOwnedServices,clearStartup=clearLingPetStartup}={}){
 if(!dir)throw Error('缺少用户数据目录');dir=await checkedDirectory(dir);codexDir=path.resolve(codexDir);cursorDir=path.resolve(cursorDir);
 const local=path.join(cursorDir,'plugins/local/board-pet'),script=path.join(dir,'codex/user-hook.cjs');
 const files=[{file:path.join(codexDir,'hooks.json'),clean:text=>{const result=removeCodexUserHooks(JSON.parse(text.replace(/^\uFEFF/,'')),script);return result.removed?JSON.stringify(result.value,null,2)+'\n':text;}},
 {file:path.join(cursorDir,'hooks.json'),clean:text=>{const result=removeCursorHooks(JSON.parse(text.replace(/^\uFEFF/,'')),local);return result.removed?JSON.stringify(result.value,null,2)+'\n':text;}},
 {file:path.join(codexDir,'config.toml'),clean:removeCodexPluginOverrides}];
 for(const item of files){item.before=await optional(item.file);item.after=item.before===null?null:item.clean(item.before);}
 let localPlugin=false;const manifest=await optional(path.join(local,'.cursor-plugin/plugin.json'));
 if(manifest!==null){if(JSON.parse(manifest).name!=='board-pet')throw Error('Cursor 本地目录属于其他插件，未修改');await checkedDirectory(local);localPlugin=true;}
 const launcher=await optional(script),ownedLauncher=launcher===CODEX_USER_LAUNCHER;
 const plan={preview:!apply,mode:archiveData?'archive-data':'keep-data',dataDir:dir,changedFiles:files.filter(f=>f.before!==f.after).map(f=>f.file),removeCursorLocalPlugin:localPlugin,removeUserLauncher:ownedLauncher,stopBackground:true,disableStartup:true,
 remainingHostSteps:['在 DSH 插件管理中卸载灵伴','在 Codex 插件管理中卸载 board-pet','在 Cursor 扩展管理中卸载灵伴并重载窗口；卸载前不要重新启用扩展']};
 if(!apply)return plan;
 const backup=path.join(path.dirname(dir),path.basename(dir)+'-uninstall-backups',Date.now()+'-'+randomUUID());await mkdir(backup,{recursive:true});
 return withInstallLock(path.join(path.dirname(dir),'.'+path.basename(dir)+'-uninstall.lock'),async()=>{
  // Revalidate previews under the lock: never overwrite a concurrent user edit.
  for(const item of files)if(await optional(item.file)!==item.before)throw Error('宿主配置已变化，请重新预览卸载');
  if(await optional(path.join(local,'.cursor-plugin/plugin.json'))!==manifest||await optional(script)!==launcher)throw Error('插件文件已变化，请重新预览卸载');
  for(const [index,item] of files.entries())if(item.before!==null)await writeFile(path.join(backup,index+'-'+path.basename(item.file)),item.before,{mode:0o600,flag:'wx'});
  await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'runtime.paused'),'用户执行卸载，暂停自动唤起');
  // Hooks are detached before stopping bridges, so new events cannot restart them.
  for(const item of files)if(item.before!==item.after)await atomic(item.file,item.after);
  const startup=await clearStartup(dir);await stopServices(dir);
  if(localPlugin){await checkedDirectory(local);await rename(local,path.join(backup,'cursor-local-plugin'));}
  if(ownedLauncher)await rename(script,path.join(backup,'codex-user-hook.cjs'));
  let archived;
  if(archiveData){await checkedDirectory(dir);archived=path.join(backup,'user-data');await rename(dir,archived);await mkdir(dir);await writeFile(path.join(dir,'runtime.paused'),'用户已备份并重置灵伴数据，请在重装后显式启动');}
  const result={...plan,preview:false,completed:true,startup,backup,...(archived?{archived}:{}),dataPreserved:true};
  await writeFile(path.join(backup,'result.json'),JSON.stringify(result,null,2));return result;
 });
}
