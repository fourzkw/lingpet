import path from 'node:path';
import {mkdir,readdir,realpath,lstat,cp,symlink,unlink,rmdir,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {json,atomic,inside} from '../integrations/files.js';
import {atomicRename} from '../atomic-directory.js';
import {readEndpoint,request} from '../bridge-client.js';
import {withInstallLock} from '../install-lock.js';

const same=(a,b)=>process.platform==='win32'?path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase():path.resolve(a)===path.resolve(b);
export async function desktopStorage(dir){return {path:await realpath(dir),logicalPath:path.resolve(dir)};}
export async function validateStorageTarget({root,dir,target}){
  if(typeof target!=='string'||!path.isAbsolute(target))throw Error('请选择完整的内容目录');
  root=await realpath(root);dir=path.resolve(dir);target=path.resolve(target);
  const source=await realpath(dir);
  if(same(target,source))return {unchanged:true,source,target};
  if(same(target,path.parse(target).root)||same(target,root)||same(target,dir)||inside(dir,target)||inside(target,dir))throw Error('内容目录不能是磁盘根目录，也不能包含或位于当前数据目录中');
  if(inside(root,target)&&['versions','maintenance'].includes(path.relative(root,target).split(path.sep)[0].toLowerCase()))throw Error('内容目录不能放进程序文件夹');
  await mkdir(path.dirname(target),{recursive:true});
  target=path.join(await realpath(path.dirname(target)),path.basename(target));
  if(same(target,source)||inside(source,target)||inside(target,source))throw Error('内容目录不能与当前数据目录重叠');
  try{if((await lstat(target)).isSymbolicLink())throw Error('请选择普通的空文件夹');if((await readdir(target)).length)throw Error('请选择空文件夹，避免覆盖已有文件');}catch(error){if(error.code!=='ENOENT')throw error;}
  return {source,target,unchanged:false};
}
async function stopDesktop(dir){
  const endpoint=await readEndpoint(dir);if(!endpoint)return;
  let health;try{health=await request(endpoint,'/health');}catch{return;}
  if(health.name!=='board-ai-pet')throw Error('数据目录中的服务不属于灵伴，未停止');
  await request(endpoint,'/quit',{},5000);
  for(let attempt=0;attempt<200;attempt++){try{process.kill(endpoint.pid,0);}catch(error){if(error.code==='ESRCH')return;}await new Promise(resolve=>setTimeout(resolve,100));}
  throw Error('灵伴尚未退出，未迁移数据。请关闭相关窗口后重试');
}
// The logical path remains stable for Agent registrations and stored asset paths.
// Switch it to the copied storage using a Windows junction (no admin required).
export async function relocateDesktopData({root,dir,target,stop=stopDesktop}){
  root=path.resolve(root);dir=path.resolve(dir);
  const location=await json(path.join(root,'desktop-location.json'),null);
  if(!location||!same(location.dataDir,dir))throw Error('安装记录与数据目录不一致，请先修复本体安装');
  const checked=await validateStorageTarget({root,dir,target});if(checked.unchanged)return {unchanged:true,path:checked.source};
  await stop(dir);
  return withInstallLock(path.join(root,'maintenance.lock'),async()=>{
    const checked=await validateStorageTarget({root,dir,target});
    const id=randomUUID(),staging=path.join(path.dirname(checked.target),'.lingpet-data-'+id),link=dir+'.link-'+id,backup=dir+'.backup-'+Date.now()+'-'+id;
    let published=false,switched=false;
    try{
      await cp(checked.source,staging,{recursive:true,dereference:false});
      try{await rmdir(checked.target);}catch(error){if(error.code!=='ENOENT')throw error;}
      await atomicRename(staging,checked.target);published=true;
      await symlink(checked.target,link,process.platform==='win32'?'junction':'dir');
      await atomicRename(dir,backup);
      try{await atomicRename(link,dir);switched=true;}catch(error){await atomicRename(backup,dir);throw error;}
      await atomic(path.join(root,'desktop-location.json'),JSON.stringify({...location,storageDir:checked.target}));
      return {moved:true,path:checked.target,logicalPath:dir,backup};
    }catch(error){
      if(switched){await unlink(dir);await atomicRename(backup,dir);}
      throw Error('内容目录未切换：'+error.message+(published?'；复制出的内容已保留在目标目录':''));
    }finally{
      try{await unlink(link);}catch(error){if(error.code!=='ENOENT')throw error;}
      await rm(staging,{recursive:true,force:true});
    }
  });
}
