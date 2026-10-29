import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {CODEX_HOOKS} from './codex-observer.js';

export function mergeCodexHooks(existing,script){
  if(!existing||typeof existing!=='object'||Array.isArray(existing))throw new Error('Codex hooks.json 必须是对象');
  if(existing.hooks!==undefined&&(!existing.hooks||typeof existing.hooks!=='object'||Array.isArray(existing.hooks)))throw new Error('Codex hooks 字段无效');
  script=script.replaceAll('\\','/');
  if(/["%`$\r\n]/.test(script))throw new Error('不支持的接入脚本路径');
  const hooks={...existing.hooks};
  for(const name of CODEX_HOOKS){
    const groups=hooks[name]??[];if(!Array.isArray(groups))throw new Error('Codex Hook 配置必须是数组');
    const command=`node "${script}" ${name}`;
    const kept=groups.map(group=>{
      if(!Array.isArray(group?.hooks))throw new Error('Codex Hook 处理器必须是数组');
      return {...group,hooks:group.hooks.filter(h=>h.command!==command)};
    }).filter(g=>g.hooks.length);
    hooks[name]=[...kept,{hooks:[{type:'command',command,commandWindows:command,timeout:3}]}];
  }
  return {...existing,hooks};
}

export function disableCodexPluginHooks(text){
  const names=['session_start','session_end','user_prompt_submit','pre_tool_use','permission_request','post_tool_use','stop','interrupt'];
  const ids=new Set(names.map(n=>`board-pet@board-pet-local:hooks/hooks.json:${n}:0:0`));
  const seen=new Set();let active=null,hasEnabled=false;const lines=[];
  const finish=()=>{if(active&&!hasEnabled)lines.push('enabled = false');active=null;hasEnabled=false;};
  for(const line of text.split(/\r?\n/)){
    if(/^\s*\[/.test(line)){
      finish();const match=line.match(/^\s*\[hooks\.state\."([^"]+)"\]\s*(?:#.*)?$/);
      if(match&&ids.has(match[1])){active=match[1];seen.add(active);}
    }
    if(active&&/^\s*enabled\s*=/.test(line)){lines.push('enabled = false');hasEnabled=true;}else lines.push(line);
  }
  finish();for(const id of ids)if(!seen.has(id))lines.push('',`[hooks.state."${id}"]`,'enabled = false');
  return lines.join('\n');
}

export function removeCodexUserHooks(existing,script){
  if(!existing||typeof existing!=='object'||Array.isArray(existing)||existing.hooks&&(typeof existing.hooks!=='object'||Array.isArray(existing.hooks)))throw Error('Codex Hooks 配置无效');
  script=script.replaceAll('\\','/');const hooks={...existing.hooks};let removed=0;
  for(const event of CODEX_HOOKS){
    if(!Array.isArray(hooks[event]))continue;
    hooks[event]=hooks[event].map(group=>{
      if(!Array.isArray(group.hooks))return group;
      const next=group.hooks.filter(handler=>{const commands=[handler.command,handler.commandWindows].filter(c=>typeof c==='string'),owned=commands.length&&commands.every(c=>c.replaceAll('\\','/')===`node "${script}" ${event}`);if(owned)removed++;return !owned;});
      return next.length===group.hooks.length?group:{...group,hooks:next};
    }).filter(g=>!Array.isArray(g.hooks)||g.hooks.length);
    if(!hooks[event].length)delete hooks[event];
  }
  return {value:removed?{...existing,hooks}:existing,removed};
}

// Remove our migration overrides; retain all trust hashes and third-party state.
export function removeCodexPluginOverrides(text){
  const ids=new Set(['session_start','session_end','user_prompt_submit','pre_tool_use','permission_request','post_tool_use','stop','interrupt'].map(n=>`board-pet@board-pet-local:hooks/hooks.json:${n}:0:0`));
  let owned=false,removed=false;
  const lines=text.split(/\r?\n/).filter(line=>{
    if(/^\s*\[/.test(line)){const match=line.match(/^\s*\[hooks\.state\."([^"]+)"\]\s*(?:#.*)?$/);owned=!!match&&ids.has(match[1]);}
    const drop=owned&&/^\s*enabled\s*=\s*false\s*(?:#.*)?$/.test(line);if(drop)removed=true;return !drop;
  });return removed?lines.join('\n'):text;
}

// Only the tiny launcher lives in the user hook directory. Assets and Electron
// remain in the existing immutable shared release, outside the plugin cache.
export const CODEX_USER_LAUNCHER=`const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const dir=path.resolve(__dirname,'..'),base=path.join(dir,'shared');
 const m=JSON.parse(fs.readFileSync(path.join(base,'active.json'),'utf8'));
 if(m.protocol!==1||typeof m.active!=='string'||!/^[-\\w.]+$/.test(m.active))throw new Error('Invalid shared release');
 const root=path.resolve(base,'releases',m.active);
 if(path.dirname(root)!==path.resolve(base,'releases'))throw new Error('Invalid release path');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 if(!['lingpet','dsh-board-pet'].includes(pkg.name))throw new Error('Invalid runtime');
 process.env.BOARD_PET_DATA_DIR=dir;
 await import(pathToFileURL(path.join(root,'bin','codex-hook.js')).href);
})().catch(()=>{process.stderr.write('[lingpet] Shared runtime unavailable; start LingPet first.\\n');process.stdout.write('{}\\n');});
`;

async function readOptional(file){try{return await readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function replace(file,old,next,backups){
  if(old===next)return;
  await mkdir(path.dirname(file),{recursive:true});
  if(old!==null){const backup=file+'.lingpet-backup-'+Date.now();await writeFile(backup,old,{flag:'wx'});backups.push(backup);}
  const temp=file+'.lingpet-'+process.pid+'.tmp';await writeFile(temp,next,{mode:0o600});await rename(temp,file);
}
export async function installCodexUserHooks(codexDir,dir){
  const active=JSON.parse(await readFile(path.join(dir,'shared/active.json'),'utf8'));
  if(active.protocol!==1||typeof active.active!=='string'||!/^[-\w.]+$/.test(active.active))throw new Error('共享桌宠运行时不可用，请先启动桌宠');
  const releases=path.resolve(dir,'shared/releases'),root=path.resolve(releases,active.active);
  if(path.dirname(root)!==releases)throw new Error('无效的运行时目录');
  const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  if(!['lingpet','dsh-board-pet'].includes(pkg.name))throw new Error('不是灵伴运行时');
  await readFile(path.join(root,'bin/codex-hook.js'));
  const script=path.join(dir,'codex/user-hook.cjs'),hooksFile=path.join(codexDir,'hooks.json'),configFile=path.join(codexDir,'config.toml');
  const oldHooks=await readOptional(hooksFile),oldConfig=await readOptional(configFile),oldScript=await readOptional(script);
  const existing=oldHooks?JSON.parse(oldHooks.replace(/^\uFEFF/,'')):{};
  const hooks=JSON.stringify(mergeCodexHooks(existing,script),null,2)+'\n';
  const config=disableCodexPluginHooks(oldConfig??'');const backups=[];
  await replace(script,oldScript,CODEX_USER_LAUNCHER,backups);
  await replace(hooksFile,oldHooks,hooks,backups);
  await replace(configFile,oldConfig,config,backups);
  return {script,hooksFile,changed:oldHooks!==hooks||oldConfig!==config||oldScript!==CODEX_USER_LAUNCHER,backups,reviewRequired:oldHooks!==hooks||oldScript!==CODEX_USER_LAUNCHER};
}
