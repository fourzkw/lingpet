import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PetRegistry,migratePetConfig} from '../src/pet-registry.js';
import {characterInfo,appearanceInfo} from '../src/characters.js';
import {StateStore} from '../src/state-store.js';
import {resolveFollow} from '../src/follow-resolver.js';
import {clipFrame,clipDuration} from '../desktop/action-clips.js';
import browserManifest from '../assets/chatgpt-dragon/actions-v1/manifest.js';

test('new dragon and legacy GPT coexist and survive settings migration',()=>{
  const registry=new PetRegistry({});
  const old=registry.create({character:'chatgpt',name:'原 GPT',follow:{mode:'source',source:'codex'}});
  const fresh=registry.create({character:'chatgpt-dragon',name:'云羽龙姬'});
  registry.update(fresh.id,{scale:1.25,follow:{mode:'source',source:'cursor'}});
  const migrated=migratePetConfig(registry.config);
  assert.deepEqual(migrated.pets.find(p=>p.id===old.id),old);
  assert.equal(migrated.pets.find(p=>p.id===fresh.id).character,'chatgpt');
  assert.equal(migrated.pets.find(p=>p.id===fresh.id).appearance,'cloud-dragon');
  assert.notEqual(appearanceInfo(old).name,appearanceInfo(fresh).name);
});
test('full dragon celebration expires independently of legacy pets and yields to new events',()=>{
  let now=100;const store=new StateStore({now:()=>now});
  const event={version:1,instanceId:'codex',sessionId:'a',seq:1,turn:1,state:'done'};store.accept(event);
  const opts={doneMs:characterInfo('chatgpt-dragon').doneMs};now+=2000;
  assert.equal(resolveFollow(store).state,'idle');assert.equal(resolveFollow(store,undefined,null,opts).state,'done');
  now+=3400;assert.equal(resolveFollow(store,undefined,null,opts).state,'idle');
  store.accept({...event,seq:2,turn:2,state:'working'});assert.equal(resolveFollow(store,undefined,null,opts).state,'working');
});
test('dragon has eight independent RGBA video sheets with safe playback clocks',async()=>{
  const root=new URL('../assets/chatgpt-dragon/actions-v1/',import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
  assert.deepEqual(browserManifest,manifest);
  assert.deepEqual(Object.keys(manifest.clips),['idle','thinking','working','input','approval','done','error','sleep']);
  assert.equal(manifest.tileSize,192);
  for(const [state,clip] of Object.entries(manifest.clips)){
    const png=await readFile(new URL(clip.file,root));assert.equal(png.readUInt32BE(16),1536);assert.equal(png.readUInt32BE(20),1536);assert.equal(png[25],6);
    const original=await readFile(new URL('original/'+clip.file,root));assert.equal(original.readUInt32BE(16),3072);assert.equal(original.readUInt32BE(20),3072);assert.equal(original[25],6);
    assert.equal(clip.sourceFrames,63);assert.ok(clip.frames.every(n=>n>=0&&n<63));assert.equal(clip.frames.length,clip.durations.length);assert.ok(clip.durations.every(n=>n>0));
    if(['done','error'].includes(state))assert.equal(clipFrame(clip,60000),clip.frames.at(-1));
    if(state==='sleep'){const allowed=new Set(clip.frames.slice(clip.loopFrom));for(let t=clipDuration(clip);t<30000;t+=137)assert.ok(allowed.has(clipFrame(clip,t)));}
  }
  assert.ok(clipDuration(manifest.clips.done)<=characterInfo('chatgpt-dragon').doneMs);
  const provenance=JSON.parse(await readFile(new URL('provenance.json',root),'utf8'));assert.equal(provenance.reusedPreviousPetAssets,false);
});
