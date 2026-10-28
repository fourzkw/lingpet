import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {clipDuration} from '../desktop/action-clips.js';
import {PNG} from 'pngjs';

// Input: reviewed partial bundles produced by board_pet_process_assets.
// The pipeline's idle/done slots become dedicated click/pet playback channels.
const records=JSON.parse(await readFile('output/interaction-v1/projects.json','utf8'));
for(const record of records){
  if(!record.bundle)throw new Error('Missing reviewed bundle for '+record.asset);
  const source=JSON.parse(await readFile(path.join(record.bundle,'manifest.json'),'utf8'));
  const target=path.resolve('assets/interactions',record.asset);await mkdir(target,{recursive:true});
  const clips={};
  for(const [kind,state]of [['click','idle'],['pet','done']]){
    const clip=source.clips[state];if(!clip||clip.loop)throw new Error('Interaction must be a complete one-shot: '+kind);
    clips[kind]={...clip,file:kind+'.png'};
    for(const variant of source.variants){
      const directory=variant==='original'?source.original.directory:'';
      await mkdir(path.join(target,directory),{recursive:true});
      await cp(path.join(record.bundle,directory,clip.file),path.join(target,directory,kind+'.png'));
    }
  }
  // Keep the fallback first pose tiny instead of decoding the click atlas twice.
  for(const variant of source.variants){
    const directory=variant==='original'?source.original.directory:'',tile=variant==='original'?source.original.tileSize:source.tileSize;
    const image=PNG.sync.read(await readFile(path.join(target,directory,'click.png'))),idle=new PNG({width:tile*source.columns,height:tile});
    const first=clips.click.frames[0];PNG.bitblt(image,idle,first%source.columns*tile,Math.floor(first/source.columns)*tile,tile,tile,0,0);
    await writeFile(path.join(target,directory,'idle.png'),PNG.sync.write(idle));
  }
  clips.idle={file:'idle.png',sourceFrames:1,frames:[0],durations:[100],loop:true,loopFrom:0};
  const manifest={...source,character:record.asset,clips};
  await writeFile(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2));
  await writeFile(path.join(target,'manifest.js'),'export default '+JSON.stringify(manifest)+';\n');
  const provenance=JSON.parse(await readFile(path.join(record.bundle,'provenance.json'),'utf8'));
  await writeFile(path.join(target,'provenance.json'),JSON.stringify({...provenance,usage:'Dedicated click and head-pat clips; original session animations are unchanged.',tasks:record.tasks},null,2));
  console.log(JSON.stringify({asset:record.asset,clickMs:clipDuration(clips.click),petMs:clipDuration(clips.pet),variants:source.variants}));
}
