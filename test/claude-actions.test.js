import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CLAUDE_CLIPS,clipFrame,clipDuration} from '../desktop/claude-actions.js';

test('all eight Claude states cover 64 authored key poses with explicit frame timing',()=>{
  const used=new Set();
  for(const clip of Object.values(CLAUDE_CLIPS)){
    assert.equal(clip.frames.length,clip.durations.length);
    assert.ok(clip.durations.every(ms=>Number.isFinite(ms)&&ms>0));
    let time=0;
    for(let i=0;i<clip.frames.length;i++){
      assert.equal(clipFrame(clip,time),clip.frames[i]);
      assert.equal(clipFrame(clip,time+clip.durations[i]-1),clip.frames[i]);
      used.add(clip.frames[i]);time+=clip.durations[i];
    }
  }
  assert.equal(Object.keys(CLAUDE_CLIPS).length,8);
  assert.equal(used.size,64);
});
test('typing/waving loop; jump lands and holds without starting another jump',()=>{
  for(const state of ['working','input']){
    const clip=CLAUDE_CLIPS[state];
    assert.equal(clipFrame(clip,clipDuration(clip)),clip.frames[0]);
  }
  const jump=CLAUDE_CLIPS.done;
  for(const time of [clipDuration(jump),5000,50000])assert.equal(clipFrame(jump,time),23);
  for(const time of [-200,NaN,Infinity])assert.equal(clipFrame(jump,time),16);
});
test('sleep and approval never replay their entrance while the state remains active',()=>{
  for(const state of ['sleep','approval','thinking']){
    const clip=CLAUDE_CLIPS[state],allowed=new Set(clip.frames.slice(clip.loopFrom));
    assert.equal(clipFrame(clip,clipDuration(clip)),clip.frames[clip.loopFrom]);
    for(let time=clipDuration(clip);time<30000;time+=37)assert.ok(allowed.has(clipFrame(clip,time)));
  }
  const error=CLAUDE_CLIPS.error;
  for(const time of [clipDuration(error),3000,20000])assert.equal(clipFrame(error,time),55);
});
test('typing only cycles the eight low-hand typing poses',()=>{
  const clip=CLAUDE_CLIPS.working;
  assert.deepEqual(clip.frames,[8,9,10,11,12,13,14,15]);
  for(let time=0;time<15000;time+=23)assert.ok(clipFrame(clip,time)>=8&&clipFrame(clip,time)<=15);
});
test('authored atlas is a separate transparent 8 by 8 grid; original atlas preserved',async()=>{
  const atlas=await readFile(new URL('../assets/claude/actions-v2/atlas.png',import.meta.url));
  assert.equal(atlas.toString('hex',0,8),'89504e470d0a1a0a');
  assert.equal(atlas.readUInt32BE(16),1024);assert.equal(atlas.readUInt32BE(20),1024);
  assert.equal(atlas[25],6);
  const original=await readFile(new URL('../assets/claude/states.png',import.meta.url));
  assert.equal(original.readUInt32BE(16),1536);assert.equal(original.readUInt32BE(20),1024);
});
