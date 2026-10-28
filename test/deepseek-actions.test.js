import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEEPSEEK_CLIPS} from '../desktop/deepseek-actions.js';
import {clipFrame,clipDuration} from '../desktop/action-clips.js';

test('all eight DeepSeek states select valid authored poses at exact timing boundaries',()=>{
  const used=new Set();
  assert.equal(Object.keys(DEEPSEEK_CLIPS).length,8);
  for(const clip of Object.values(DEEPSEEK_CLIPS)){
    assert.equal(clip.frames.length,clip.durations.length);
    let time=0;
    for(let i=0;i<clip.frames.length;i++){
      assert.ok(clip.durations[i]>0);
      assert.ok(Number.isInteger(clip.frames[i])&&clip.frames[i]>=0&&clip.frames[i]<64);
      assert.equal(clipFrame(clip,time),clip.frames[i]);
      assert.equal(clipFrame(clip,time+clip.durations[i]-1),clip.frames[i]);
      time+=clip.durations[i];used.add(clip.frames[i]);
    }
  }
  assert.deepEqual(Array.from({length:64},(_,i)=>i).filter(i=>!used.has(i)),[51,52,53]);
});

test('DeepSeek error pauses upright and lowers its hands without alternating tilts or slumping',()=>{
  const clip=DEEPSEEK_CLIPS.error;
  assert.equal(clip.loop,false);
  // 49 is hands at the chest, 50 covers the mouth, 54/55 are upright recovery.
  assert.deepEqual(clip.frames,[48,49,50,49,54,55]);
  assert.equal(clipFrame(clip,400),50);
  assert.equal(clipFrame(clip,790),50);
  assert.equal(clipFrame(clip,900),49);
  for(let time=0;time<30000;time+=17)assert.ok(![51,52,53].includes(clipFrame(clip,time)));
});
test('DeepSeek approval/thinking/sleep keep only their settled loop after entrance',()=>{
  for(const state of ['approval','thinking','sleep']){
    const clip=DEEPSEEK_CLIPS[state],allowed=new Set(clip.frames.slice(clip.loopFrom));
    assert.equal(clipFrame(clip,clipDuration(clip)),clip.frames[clip.loopFrom]);
    for(let time=clipDuration(clip);time<30000;time+=37)assert.ok(allowed.has(clipFrame(clip,time)));
  }
});
test('DeepSeek celebrations and startled entrances play once, then hold recovery',()=>{
  for(const state of ['done','error']){
    const clip=DEEPSEEK_CLIPS[state];
    for(const time of [clipDuration(clip),5000,30000])assert.equal(clipFrame(clip,time),clip.frames.at(-1));
    for(const time of [-100,NaN,Infinity])assert.equal(clipFrame(clip,time),clip.frames[0]);
  }
  const typing=DEEPSEEK_CLIPS.working;
  assert.deepEqual(typing.frames,[16,17,18,19,20,21,22,23]);
  assert.equal(clipFrame(typing,clipDuration(typing)),16);
});
test('DeepSeek authored atlas is transparent 8 by 8 and preserves original reference',async()=>{
  const atlas=await readFile(new URL('../assets/deepseek/actions-v1/atlas.png',import.meta.url));
  assert.equal(atlas.toString('hex',0,8),'89504e470d0a1a0a');
  assert.equal(atlas.readUInt32BE(16),1024);assert.equal(atlas.readUInt32BE(20),1024);assert.equal(atlas[25],6);
  const original=await readFile(new URL('../assets/deepseek/states.png',import.meta.url));
  assert.equal(original.readUInt32BE(16),1536);assert.equal(original.readUInt32BE(20),1024);
});
