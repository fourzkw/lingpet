import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {clipFrame,createClipSelector,validClipSet} from '../desktop/action-clips.js';
import {createVideoPlayer} from '../desktop/video-player.js';
import {readPetpack,installPetpack,exportPetpack,resourceFiles} from '../src/market/package.js';
import {appearanceSheet,loadCustomAppearances} from '../src/creation/catalog.js';
import {appearanceFingerprint} from '../src/creation/appearance-identity.js';
import {setCustomAppearances} from '../src/characters.js';
import {creationSchemas} from '../src/creation/tools.js';
import pngjs from 'pngjs';
import yazl from 'yazl';
const clip=(duration=100,loop=true)=>({file:'idle.png',sourceFrames:2,frames:[0,1],durations:[duration/2,duration/2],loop,loopFrom:0});
const group=(selection='round-robin',loop=true)=>({...clip(100,loop),selection,alternatives:[{...clip(200,loop),file:'idle-1.png'},{...clip(300,loop),file:'idle-2.png'}]});
test('round-robin honors unequal durations, entry, one-shots and single-clip entrances',()=>{
 const select=createClipSelector(),g=group();
 for(const [time,index,elapsed] of [[0,0,0],[99,0,99],[100,1,0],[299,1,199],[300,2,0],[600,0,0]]){const actual=select('idle',g,time);assert.equal(actual.index,index);assert.equal(actual.elapsed,elapsed);}
 select('working',clip(),0);assert.equal(select('idle',g,0).index,1);
 const done=group('round-robin',false);assert.equal(select('done',done,0).index,0);assert.equal(select('done',done,10000).index,0);assert.equal(clipFrame(select('done',done,10001).clip,10001),1);
 assert.equal(select('done',done,0).index,1);
 assert.equal(select('done',done,0,'next-turn').index,2);
 const single={...clip(),frames:[0,1,2],durations:[30,40,50],loopFrom:1};assert.equal(clipFrame(single,120),1);assert.equal(clipFrame(single,210),1);
});
test('random avoids repeats across cycles and state reentry; pixel/original share a choice',()=>{
 const select=createClipSelector({random:()=>0}),g=group('random');
 assert.equal(select('idle',g,0).index,0);assert.equal(select('idle',g,0).index,0);
 assert.equal(select('idle',g,100).index,1);assert.equal(select('idle',g,300).index,0);
 select('input',clip(),0);assert.equal(select('idle',g,0).index,1);
});
test('player requests the correct candidate through the image loader',async t=>{
 const old=globalThis.Image;t.after(()=>globalThis.Image=old);globalThis.Image=class {async decode(){}};
 const calls=[],painted=[],manifest={variants:['pixel'],columns:2,tileSize:16,clips:{idle:group()}};
 const player=createVideoPlayer(null,manifest,{loadImage:async(state,variant,index)=>{calls.push([state,variant,index]);return 'sheet-'+index;}});
 await player.ready();const ctx={drawImage(image){painted.push(image.src);}};
 player.paint(ctx,'idle',0,16,16);player.paint(ctx,'idle',100,16,16);await new Promise(resolve=>setImmediate(resolve));player.paint(ctx,'idle',101,16,16);
 assert.deepEqual(calls,[['idle','pixel',0],['idle','pixel',1]]);assert.equal(painted.at(-1),'sheet-1');
 const preview={drawImage(){}};player.paint(preview,'idle',0,16,16);player.paint(ctx,'idle',102,16,16);assert.equal(painted.at(-1),'sheet-1');
});
async function zip(files){const archive=new yazl.ZipFile(),chunks=[];const done=new Promise((resolve,reject)=>{archive.outputStream.on('data',b=>chunks.push(b));archive.outputStream.on('error',reject);archive.outputStream.on('end',()=>resolve(Buffer.concat(chunks)));});for(const [name,bytes]of files)archive.addBuffer(bytes,name);archive.end();return done;}
function fixture(){const image=pngjs.PNG.sync.write(new pngjs.PNG({width:32,height:16})),manifest={schemaVersion:1,columns:2,tileSize:16,variants:['pixel'],clips:{}};
 for(const state of ['idle','thinking','working','input','approval','done','error','sleep'])manifest.clips[state]={...clip(100,!['done','error'].includes(state)),file:`sprites/${state}.png`};
 manifest.clips.idle={...group(),file:'sprites/idle.png',alternatives:group().alternatives.map((c,i)=>({...c,file:`sprites/idle-${i+1}.png`}))};
 const pet={formatVersion:1,id:'test-multiple',name:'测试',author:'tester',license:'CC0',description:'',version:'1.0.0',minAppVersion:'0.4.9'};
 const files=new Map([...resourceFiles(manifest)].map(name=>[name,name==='pet.json'?Buffer.from(JSON.stringify(pet)):name==='manifest.json'?Buffer.from(JSON.stringify(manifest)):image]));return {manifest,files};}
test('multiple candidates install, serve, export and deduplicate with playback policy preserved',async t=>{
 const dir=await mkdtemp(path.join(process.cwd(),'.test-data-candidates-'));t.after(async()=>{setCustomAppearances([]);await rm(dir,{recursive:true,force:true});});
 const {manifest,files}=fixture(),bytes=await zip(files),pack=await readPetpack(bytes);assert.equal(pack.manifest.clips.idle.alternatives.length,2);
 const installed=await installPetpack(dir,bytes),entries=await loadCustomAppearances(dir);assert.equal(entries.length,1);
 assert.match(await appearanceSheet(entries,{appearanceId:installed.appearance.id,state:'idle',variant:'pixel',candidate:2}),/^data:image\/png/);
 await assert.rejects(appearanceSheet(entries,{appearanceId:installed.appearance.id,state:'idle',variant:'pixel',candidate:-1}),/候选/);
 setCustomAppearances(entries);const result=await exportPetpack({dataDir:dir,pet:{character:installed.appearance.character,appearance:installed.appearance.id},details:pack.pet});const restored=await readPetpack(result.bytes);assert.deepEqual(restored.manifest.clips.idle,manifest.clips.idle);assert.equal(restored.pet.minAppVersion,'0.4.9');assert.equal((await installPetpack(dir,result.bytes)).existing,true);
 const changed=structuredClone(manifest);changed.clips.idle.selection='random';assert.notEqual(await appearanceFingerprint(manifest,n=>files.get(n)),await appearanceFingerprint(changed,n=>files.get(n)));
 changed.clips.idle.alternatives[0].file='../escape.png';assert.throws(()=>resourceFiles(changed),/无效动作/);
 const bad=structuredClone(manifest);bad.clips.idle.alternatives=Array(8).fill(clip());assert.throws(()=>resourceFiles(bad),/候选/);assert.equal(validClipSet({...clip(),selection:'invalid'}),false);assert.equal(validClipSet({...clip(),alternatives:[{...clip(),loop:false}]}),false);
});
test('creation tool accepts candidate rules while retaining the original single rule',()=>{
 const schema=creationSchemas.board_pet_process_assets;
 const result=schema.parse({projectId:'project',clips:{idle:{assetId:'first',selection:'random',alternatives:[{assetId:'second'}]},done:{assetId:'done'}}});assert.equal(result.clips.idle.alternatives[0].assetId,'second');assert.equal(result.clips.done.assetId,'done');
 assert.throws(()=>schema.parse({projectId:'project',clips:{idle:{assetId:'first',alternatives:Array(8).fill({assetId:'other'})}}}));
});
