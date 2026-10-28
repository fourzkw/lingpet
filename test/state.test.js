import test from 'node:test';
import assert from 'node:assert/strict';
import {StateStore} from '../src/state-store.js';
import {DshObserver} from '../src/dsh-observer.js';

test('disabling subagent display removes only this source subagents and releases its pin',()=>{
  const store=new StateStore();
  for(const [instanceId,sessionId,subagent] of [['one','parent',false],['one','child',true],['two','child',true]])store.accept({version:1,instanceId,sessionId,subagent,seq:1,turn:1,state:'approval'});
  store.select('one:child');store.filterSubagents('one',false);
  assert.equal(store.selected,null);assert.equal(store.sessions.size,2);assert.ok(store.sessions.has('one:parent'));assert.ok(store.sessions.has('two:child'));
  assert.throws(()=>store.filterSubagents('unknown',false));
});

test('DSH turn, parallel tools, approvals and result message IDs map without leaking contents',()=>{
  const events=[],o=new DshObserver(e=>events.push(e),{instanceId:'one'});
  const emit=(type,data)=>o.observe('s',{type,data});
  emit('turn/start',{turn:1});emit('tool/call',{callId:'a',name:'bash',arguments:'SECRET'});emit('tool/call',{callId:'b',name:'read_file'});
  emit('approval/asked',{id:'q1',reason:'SECRET'});emit('approval/asked',{id:'q2'});emit('approval/decided',{id:'q1'});
  assert.equal(events.at(-1).state,'approval');emit('approval/decided',{id:'q2'});assert.equal(events.at(-1).state,'working');
  emit('tool/result',{message:{toolCallId:'a',content:'SECRET'}});assert.equal(events.at(-1).state,'working');
  emit('tool/result',{message:{toolCallId:'b'}});assert.equal(events.at(-1).state,'thinking');
  emit('turn/end',{turn:1,reason:{kind:'completed'}});o.status('s','idle');assert.equal(events.at(-1).state,'done');
  assert.ok(!JSON.stringify(events).includes('SECRET'));
});
test('ask-user tool is input, tool failure alone is not whole-turn failure, interrupted is distinct',()=>{
  const events=[],o=new DshObserver(e=>events.push(e));
  o.observe('s',{type:'turn/start',data:{turn:1}});
  o.observe('s',{type:'tool/call',data:{callId:'q',name:'ask_user_question'}});assert.equal(events.at(-1).state,'input');
  o.observe('s',{type:'tool/result',data:{message:{toolCallId:'q',isError:true}}});assert.equal(events.at(-1).state,'thinking');
  o.observe('s',{type:'turn/end',data:{turn:1,reason:{kind:'aborted'}}});assert.equal(events.at(-1).state,'interrupted');
  o.observe('s',{type:'turn/start',data:{turn:2}});o.observe('s',{type:'turn/end',data:{turn:1,reason:{kind:'completed'}}});assert.equal(events.at(-1).state,'thinking');
});
test('subagents are excluded by default',()=>{
  const events=[],o=new DshObserver(e=>events.push(e),{isSubagent:()=>true});o.observe('s',{type:'turn/start',data:{turn:1}});assert.equal(events.length,0);
});
test('hot activation restores a pending approval without replaying transcript or historical completion',()=>{
  const events=[],o=new DshObserver(e=>events.push(e));
  const history=[{type:'turn/start',data:{turn:4}},{type:'tool/call',data:{callId:'c',name:'bash',arguments:'secret'}},{type:'approval/asked',data:{id:'q'}}];
  o.hydrate('s',{seq:history.length,eventAt:i=>history[i]},'running');
  assert.equal(events.length,1);assert.equal(events[0].state,'approval');assert.ok(!JSON.stringify(events).includes('secret'));
});
test('store rejects reordered events, protects new turns and expires one-shot completion',()=>{
  let now=1000;const s=new StateStore({now:()=>now});
  const e={version:1,instanceId:'one',sessionId:'s',turn:2,state:'thinking',seq:2};assert.equal(s.accept(e),true);
  assert.equal(s.accept({...e,state:'done',turn:1,seq:3}),false);assert.equal(s.accept({...e,state:'error',seq:1}),false);
  s.accept({...e,state:'done',seq:4});assert.equal(s.current().state,'done');now+=2000;assert.equal(s.current().state,'idle');
});
test('attention follows approval/input, pinning wins, heartbeat loss is offline not success',()=>{
  let now=1000;const s=new StateStore({now:()=>now,staleMs:100});
  const e={version:1,instanceId:'one',sessionId:'a',turn:1,state:'approval',seq:1};s.accept(e);now++;
  s.accept({...e,sessionId:'b',state:'working',seq:2});assert.equal(s.current().sessionId,'a');s.select('one:b');assert.equal(s.current().sessionId,'b');
  now+=101;s.tick();assert.equal(s.current().state,'offline');assert.equal(s.heartbeat('one'),false);
});
