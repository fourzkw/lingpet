import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireHotState} from '../src/hot-state.js';
import {StateStore} from '../src/state-store.js';
import {describeRelease} from '../src/release.js';

test('HMR handoff keeps instance and sequence and cancels obsolete disconnect',async()=>{
  const root={},first=acquireHotState(root,'test');first.record.seq=40;
  let obsolete=false;first.release(async()=>{obsolete=true;});
  const next=acquireHotState(root,'test');
  assert.equal(next.record.instanceId,first.record.instanceId);assert.equal(next.record.seq,40);
  await new Promise(r=>setTimeout(r,1600));assert.equal(obsolete,false);
  let disconnected=false;next.release(async()=>{disconnected=true;});
  await new Promise(r=>setTimeout(r,1600));assert.equal(disconnected,true);
});
test('desktop restart restores pinned waiting state without replaying completion',()=>{
  const first=new StateStore();
  first.accept({version:1,instanceId:'dsh',sessionId:'a',turn:1,seq:1,state:'approval'});
  first.accept({version:1,instanceId:'dsh',sessionId:'b',turn:2,seq:2,state:'done'});first.select('dsh:a');
  const next=new StateStore();next.restore(first.snapshot());
  assert.equal(next.current().state,'approval');assert.equal(next.selected,'dsh:a');assert.equal(next.sessions.get('dsh:b').state,'idle');
});
test('release identity is reproducible and rejects arbitrary directories',async()=>{
  const a=await describeRelease(),b=await describeRelease();assert.equal(a.backendHash,b.backendHash);assert.equal(a.frontendHash,b.frontendHash);
  await assert.rejects(()=>describeRelease('relative'));
});
