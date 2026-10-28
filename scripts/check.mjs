import {readFile,readdir,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {PACKAGE_ROOT} from '../src/paths.js';
import {CHARACTERS} from '../src/characters.js';
import {validateAppearance} from '../src/creation/validation.js';
let count=0;
async function walk(dir){for(const name of await readdir(dir)){const file=path.join(dir,name),info=await stat(file);if(info.isDirectory())await walk(file);else if(/\.(m?js|cjs)$/.test(name)){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error(r.stderr);count++;}}}
for(const dir of ['src','desktop','bin','client','cursor-extension','cursor-plugin'])await walk(path.join(PACKAGE_ROOT,dir));
const frames=JSON.parse(await readFile(path.join(PACKAGE_ROOT,'assets','claude','frames.json'),'utf8'));
const clawd=await readFile(path.join(PACKAGE_ROOT,'assets','claude','states.png'));
if(clawd.toString('hex',0,8)!=='89504e470d0a1a0a'||clawd.readUInt32BE(16)!==1536||clawd.readUInt32BE(20)!==1024||clawd[25]!==6)throw new Error('Clawd桌面资源需要1536×1024 RGBA状态图');
for(const n of ['16','32'])for(const state of ['idle','thinking','working','input','approval','done','error','sleep']){
  const s=frames.states[n][state];if(s.frames.length!==8||s.durationMs.length!==8)throw new Error('缺少动画帧');
}
const png=await readFile(path.join(PACKAGE_ROOT,'assets','deepseek','states.png'));
if(png.toString('hex',0,8)!=='89504e470d0a1a0a')throw new Error('DeepSeek 资源不是PNG');
const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
if(width%4||height%2)throw new Error('DeepSeek 状态图无法按4×2切片');
const actions=await readFile(path.join(PACKAGE_ROOT,'assets','claude','actions-v2','atlas.png'));
if(actions.toString('hex',0,8)!=='89504e470d0a1a0a'||actions.readUInt32BE(16)!==1024||actions.readUInt32BE(20)!==1024||actions[25]!==6)throw new Error('Claude 完整动作需要 8×8 格的128px RGBA图集');
const deepseekActions=await readFile(path.join(PACKAGE_ROOT,'assets','deepseek','actions-v1','atlas.png'));
if(deepseekActions.toString('hex',0,8)!=='89504e470d0a1a0a'||deepseekActions.readUInt32BE(16)!==1024||deepseekActions.readUInt32BE(20)!==1024||deepseekActions[25]!==6)throw new Error('DeepSeek 完整动作需要 8×8 格的128px RGBA图集');
for(const character of ['chatgpt']){
  const png=await readFile(path.join(PACKAGE_ROOT,'assets',character,'actions-v1','atlas.png'));
  if(png.toString('hex',0,8)!=='89504e470d0a1a0a'||png.readUInt32BE(16)!==png.readUInt32BE(20)||png.readUInt32BE(16)<1024||png[25]!==6)throw new Error(`${character} needs a square RGBA 8×8 action sheet`);
}
const dragon=JSON.parse(await readFile(path.join(PACKAGE_ROOT,'assets/chatgpt-dragon/actions-v1/manifest.json'),'utf8'));
for(const state of ['idle','thinking','working','input','approval','done','error','sleep']){
  const clip=dragon.clips[state];if(!clip||clip.sourceFrames!==63||clip.frames.length!==clip.durations.length)throw new Error('云羽龙姬缺少完整视频动作：'+state);
  const sheet=await readFile(path.join(PACKAGE_ROOT,'assets/chatgpt-dragon/actions-v1',clip.file));
  if(sheet.readUInt32BE(16)!==1536||sheet.readUInt32BE(20)!==1536||sheet[25]!==6)throw new Error('云羽龙姬动作图集损坏：'+state);
  const original=await readFile(path.join(PACKAGE_ROOT,'assets/chatgpt-dragon/actions-v1/original',clip.file));
  if(original.readUInt32BE(16)!==3072||original.readUInt32BE(20)!==3072||original[25]!==6)throw new Error('云羽龙姬原图动作损坏：'+state);
}
console.log(`Checked ${count} scripts, active character sheets and archived DeepSeek artwork and eight new dragon video sheets.`);
for(const asset of ['chatgpt-q-v2','gemini-q-v2'].filter(asset=>CHARACTERS.some(c=>c.appearances.some(a=>a.asset===asset)))){
  const root=path.join(PACKAGE_ROOT,'assets',asset,'actions-v1'),manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
  for(const state of ['idle','thinking','working','input','approval','done','error','sleep']){
    const clip=manifest.clips[state];if(!clip||clip.sourceFrames!==63||clip.frames.length!==clip.durations.length)throw new Error('新形象缺少完整动作：'+asset+' '+state);
    for(const [directory,size] of [['',1536],['original',3072]]){const png=await readFile(path.join(root,directory,clip.file));if(png.readUInt32BE(16)!==size||png.readUInt32BE(20)!==size||png[25]!==6)throw new Error('新形象资源损坏：'+asset+' '+state);}
  }
}
console.log('Unpublished Q v2 drafts are excluded from release checks.');
const deepseekVideo=await validateAppearance(path.join(PACKAGE_ROOT,'assets/deepseek-h3/actions-v1'));
if(!deepseekVideo.valid||!deepseekVideo.complete)throw new Error('DeepSeek H3 原图/像素资源不完整：'+deepseekVideo.errors.join('; '));
console.log('Checked DeepSeek H3: eight actions, original and pixel variants, retained legacy artwork.');

const whiteDragonVideo=await validateAppearance(path.join(PACKAGE_ROOT,'assets/chatgpt-white-dragon-h3/actions-v1'));
if(!whiteDragonVideo.valid||!whiteDragonVideo.complete)throw new Error('白羽龙姬八动作资源不完整：'+whiteDragonVideo.errors.join('; '));
console.log('Checked white dragon H3: eight actions, original/pixel variants.');
