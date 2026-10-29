import path from 'node:path';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {CURSOR_HOOKS} from './cursor-observer.js';

export function mergeCursorHooks(existing,pluginRoot){
  if(!existing||typeof existing!=='object'||Array.isArray(existing))throw new Error('Cursor hooks.json 必须是 JSON 对象');
  if(existing.version!==undefined&&existing.version!==1)throw new Error('不支持的 Cursor Hooks 版本');
  if(existing.hooks!==undefined&&(!existing.hooks||typeof existing.hooks!=='object'||Array.isArray(existing.hooks)))throw new Error('Cursor hooks 字段无效');
  const script=path.join(pluginRoot,'scripts/hook.cjs').replaceAll('\\','/');
  if(/["\r\n]/.test(script))throw new Error('不支持的插件路径');
  const hooks={...existing.hooks};
  for(const name of CURSOR_HOOKS){
    const entries=hooks[name]??[];if(!Array.isArray(entries))throw new Error('Cursor Hook 配置必须是数组');
    const command=`node "${script}" ${name}`;
    // Replace only our exact installed script, keeping all other observers/policies.
    hooks[name]=[...entries.filter(entry=>!(typeof entry?.command==='string'&&entry.command.replaceAll('\\','/').includes(`"${script}"`))),{command,timeout:3}];
  }
  return {...existing,version:1,hooks};
}

export async function installCursorUserHooks(file,pluginRoot){
  let raw=null;
  try{raw=await readFile(file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  const existing=raw===null?{}:JSON.parse(raw.replace(/^\uFEFF/,''));
  const next=JSON.stringify(mergeCursorHooks(existing,pluginRoot),null,2)+'\n';
  if(raw===next)return {changed:false};
  await mkdir(path.dirname(file),{recursive:true});
  if(raw!==null)await writeFile(file+'.board-pet-backup-'+Date.now(),raw,{flag:'wx'});
  const temp=file+'.board-pet-'+process.pid+'.tmp';await writeFile(temp,next);await rename(temp,file);
  return {changed:true};
}

export function removeCursorHooks(existing,pluginRoot){
  if(!existing||typeof existing!=='object'||Array.isArray(existing)||existing.hooks&&(typeof existing.hooks!=='object'||Array.isArray(existing.hooks)))throw Error('Cursor Hooks 配置无效');
  const script=path.join(pluginRoot,'scripts/hook.cjs').replaceAll('\\','/');
  const hooks={...existing.hooks};let removed=0;
  for(const event of CURSOR_HOOKS){
    if(!Array.isArray(hooks[event]))continue;
    const expected=`node "${script}" ${event}`;
    hooks[event]=hooks[event].filter(h=>{const owned=typeof h.command==='string'&&h.command.replaceAll('\\','/')===expected;if(owned)removed++;return !owned;});
    if(!hooks[event].length)delete hooks[event];
  }
  return {value:removed?{...existing,hooks}:existing,removed};
}
