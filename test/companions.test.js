import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PetRegistry,migratePetConfig} from '../src/pet-registry.js';
import {CHARACTER_IDS,nextCharacter,characterInfo} from '../src/characters.js';
import {COMPANION_CLIPS} from '../desktop/companion-actions.js';
import {clipFrame,clipDuration} from '../desktop/action-clips.js';
import {CHATGPT_CLIPS} from '../desktop/chatgpt-motion.js';

test('new companions persist, remain independent and participate in character cycling',()=>{
  const registry=new PetRegistry({});const first=registry.pets[0];
  for(const character of ['chatgpt']){const pet=registry.create({character,name:characterInfo(character).name});assert.equal(migratePetConfig(registry.config).pets.find(p=>p.id===pet.id).character,character);registry.update(pet.id,{follow:{mode:'source',source:'codex'}});assert.equal(first.character,'claude');}
  let current=CHARACTER_IDS[0];const visited=[];for(let i=0;i<CHARACTER_IDS.length;i++){visited.push(current);current=nextCharacter(current);}assert.deepEqual(visited,CHARACTER_IDS);assert.equal(current,CHARACTER_IDS[0]);
  assert.throws(()=>registry.create({character:'unknown'}));
});
test('companion clips stay in their state row, hold completion and do not replay sleep entrance',()=>{
  Object.values(COMPANION_CLIPS).forEach((clip,row)=>{assert.equal(clip.frames.length,clip.durations.length);assert.ok(clip.frames.every(frame=>frame>=row*8&&frame<(row+1)*8));assert.ok(clip.durations.every(ms=>ms>0));});
  for(const name of ['done','error']){const clip=COMPANION_CLIPS[name];assert.equal(clipFrame(clip,clipDuration(clip)+10000),clip.frames.at(-1));}
  for(const name of ['sleep','approval']){const clip=COMPANION_CLIPS[name],allowed=new Set(clip.frames.slice(clip.loopFrom));for(let t=clipDuration(clip);t<30000;t+=113)assert.ok(allowed.has(clipFrame(clip,t)));}
});
test('active companion original generated sheets are RGBA square atlases',async()=>{
  for(const character of ['chatgpt']){const png=await readFile(new URL(`../assets/${character}/actions-v1/atlas.png`,import.meta.url));assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),png.readUInt32BE(20));assert.ok(png.readUInt32BE(16)>=1024);assert.equal(png[25],6);}
});
test('ChatGPT blink is brief and bilateral, and hand/sleep entrances do not replay in their waiting loops',()=>{
  const idle=CHATGPT_CLIPS.idle;assert.deepEqual(idle.frames,[0,4,5,4,0]);
  assert.ok(clipDuration(idle)>=5000);assert.ok(idle.durations[1]+idle.durations[2]+idle.durations[3]<=250);
  for(const name of ['thinking','approval','sleep']){const clip=CHATGPT_CLIPS[name],allowed=new Set(clip.frames.slice(clip.loopFrom));for(let t=clipDuration(clip);t<30000;t+=127)assert.ok(allowed.has(clipFrame(clip,t)));}
  for(const name of ['done','error'])assert.equal(clipFrame(CHATGPT_CLIPS[name],20000),CHATGPT_CLIPS[name].frames.at(-1));
});
