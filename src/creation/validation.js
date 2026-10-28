import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {STATES} from './store.js';
import {inflateSync} from 'node:zlib';
import {clipCandidates,validClipSet} from '../../desktop/action-clips.js';
import {INTERACTION_KINDS} from '../animation-kinds.js';

export async function validateAppearance(root){
  const errors=[];let manifest;
  try{manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));}catch(e){return {valid:false,complete:false,errors:['无法读取 manifest.json: '+e.message]};}
  const variants=manifest.variants||['pixel',...(manifest.original?['original']:[])];
  const integer=n=>Number.isInteger(n)&&n>0;
  if(!integer(manifest.columns)||manifest.columns>16||!integer(manifest.tileSize)||manifest.tileSize>1024)errors.push('无效的图集尺寸');
  if(!variants.length||new Set(variants).size!==variants.length||variants.some(v=>!['pixel','original'].includes(v)))errors.push('无效的显示版本');
  const complete=STATES.every(s=>manifest.clips?.[s]);
  for(const [state,group] of Object.entries(manifest.clips||{})){
    if(![...STATES,...INTERACTION_KINDS].includes(state)){errors.push('未知动作 '+state);continue;}
    if(INTERACTION_KINDS.includes(state)&&group?.loop!==false)errors.push('互动动作需单次播放 '+state);
    if(!validClipSet(group)){errors.push('无效候选动作 '+state);continue;}
    for(const clip of clipCandidates(group)){
    if(!integer(clip.sourceFrames)||clip.sourceFrames>128||!Array.isArray(clip.frames)||!clip.frames.length||clip.frames.length>256||!Array.isArray(clip.durations)||clip.frames.length!==clip.durations.length||clip.frames.some(f=>!Number.isInteger(f)||f<0||f>=clip.sourceFrames)||clip.durations.some(d=>!Number.isFinite(d)||d<=0)||typeof clip.loop!=='boolean'||(clip.loopFrom!==undefined&&(!Number.isInteger(clip.loopFrom)||clip.loopFrom<0||clip.loopFrom>=clip.frames.length)))errors.push('无效动作时序 '+state);
    for(const variant of variants){try{
      const tile=variant==='original'?manifest.original?.tileSize:manifest.tileSize,directory=variant==='original'?manifest.original?.directory||'':'';
      if(!integer(tile)||tile>1024)throw new Error('无效帧尺寸');
      if(typeof clip.file!=='string'||path.isAbsolute(clip.file)||typeof directory!=='string'||path.isAbsolute(directory))throw new Error('无效文件路径');
      const base=await realpath(root),file=await realpath(path.resolve(root,directory,clip.file)),relative=path.relative(base,file);if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('资源路径越界');
      const png=await readFile(file);if(png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png[25]!==6)throw new Error('需要 RGBA PNG');
      if(png.readUInt32BE(16)!==manifest.columns*tile||png.readUInt32BE(20)!==Math.ceil(clip.sourceFrames/manifest.columns)*tile)throw new Error('图集尺寸与清单不符');
      if(png[24]!==8||png[28]!==0)throw new Error('仅支持非交错 8bit RGBA PNG');
      const chunks=[];for(let offset=8;offset+12<=png.length;){const size=png.readUInt32BE(offset),end=offset+size+12;if(end>png.length)throw new Error('PNG 数据截断');if(png.toString('ascii',offset+4,offset+8)==='IDAT')chunks.push(png.subarray(offset+8,offset+8+size));offset=end;}
      const expected=(png.readUInt32BE(16)*4+1)*png.readUInt32BE(20),decoded=inflateSync(Buffer.concat(chunks),{maxOutputLength:expected});if(decoded.length!==expected)throw new Error('PNG 像素数据损坏');
    }catch(e){errors.push(`${state}/${variant}: ${e.message}`);}}
    }
  }
  if(!manifest.clips?.idle&&!INTERACTION_KINDS.some(k=>manifest.clips?.[k]))errors.push('缺少空闲动作');
  return {valid:!errors.length,complete,errors,variants,manifest,visualReviewRequired:true};
}
