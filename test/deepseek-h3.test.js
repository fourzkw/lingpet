import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateAppearance} from '../src/creation/validation.js';
import {STATES} from '../src/creation/store.js';
import {appearanceInfo} from '../src/characters.js';
import {PetRegistry,migratePetConfig} from '../src/pet-registry.js';
import {clipFrame} from '../desktop/action-clips.js';
test('DeepSeek H3 has eight valid original/pixel actions derived from the confirmed image',async()=>{
  const root=new URL('../assets/deepseek-h3/actions-v1/',import.meta.url),report=await validateAppearance(fileURLToPath(root));
  assert.equal(report.valid,true,report.errors.join(';'));assert.equal(report.complete,true);assert.deepEqual(report.variants,['original','pixel']);
  const manifest=report.manifest,browser=(await import(new URL('manifest.js',root))).default;assert.deepEqual(browser,manifest);assert.equal(manifest.character,'deepseek-h3');assert.equal(manifest.tileSize,192);assert.equal(manifest.original.tileSize,384);
  const provenance=JSON.parse(await readFile(new URL('provenance.json',root),'utf8'));const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha(await readFile(new URL('../base.png',root))),provenance.visualInputSha256);assert.equal(provenance.imageGeneration,false);assert.equal(provenance.reusedPreviousAnimationAssets,false);
  for(const state of STATES){const clip=manifest.clips[state];assert.equal(clip.sourceFrames,63);if(state==='working'){assert.equal(clip.frames[0],20);assert.equal(clip.loopFrom,0);}assert.match(provenance.videos[state].model,/minimax_h3/);assert.equal(provenance.videos[state].sha256,sha(await readFile(new URL('../output/video/deepseek-h3-v1/'+state+'/video.mp4',import.meta.url))));
    if(['done','error'].includes(state)){assert.equal(clip.loop,false);assert.equal(clipFrame(clip,60000),clip.frames.at(-1));}
    if(['thinking','approval','sleep'].includes(state)){assert.equal(clip.loopFrom,42);const loopFrames=new Set(clip.frames.slice(clip.loopFrom));assert.ok(loopFrames.has(clipFrame(clip,60000)));}
  }
  for(const [file,hash]of Object.entries(provenance.legacyAssets))assert.equal(sha(await readFile(new URL('../'+file,import.meta.url))),hash);
});
test('existing DeepSeek selections use new pixel artwork and can switch to originals while retired legacy selections migrate',()=>{
  const raw={schemaVersion:2,pets:[{id:'existing',name:'我的鲸鱼娘',character:'deepseek',appearance:'whale',variant:'pixel',x:10,y:20,scale:1.25,follow:{mode:'source',source:'codex'}}]};
  const migrated=migratePetConfig(raw),pet=migrated.pets[0];for(const key of ['id','name','character','appearance','variant','x','y','scale','follow'])assert.deepEqual(pet[key],raw.pets[0][key]);
  assert.equal(appearanceInfo(pet).asset,'deepseek-h3');const registry=new PetRegistry(migrated);registry.update(pet.id,{variant:'original'});assert.equal(registry.get(pet.id).appearance,'whale');assert.deepEqual(registry.get(pet.id).follow,raw.pets[0].follow);
  assert.throws(()=>registry.update(pet.id,{appearance:'whale-classic',variant:'pixel'}));const legacy=migratePetConfig({...raw,pets:[{...raw.pets[0],appearance:'whale-classic'}]});assert.equal(legacy.pets[0].appearance,'whale');assert.equal(appearanceInfo(legacy.pets[0]).asset,'deepseek-h3');
});
