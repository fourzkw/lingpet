import test from 'node:test';
import assert from 'node:assert/strict';
import {publishDirectory} from '../src/atomic-directory.js';
test('atomic publication retries transient Windows locks with a finite bound',async()=>{
 let calls=0;const waits=[],busy=Object.assign(new Error('locked'),{code:'EPERM'});
 await publishDirectory('stage','final',{platform:'win32',move:async(a,b)=>{assert.equal(a,'stage');assert.equal(b,'final');if(calls++<2)throw busy;},wait:async ms=>waits.push(ms)});
 assert.equal(calls,3);assert.deepEqual(waits,[50,100]);calls=0;
 await assert.rejects(publishDirectory('stage','final',{platform:'win32',move:async()=>{calls++;throw busy;},wait:async()=>{}}),e=>e===busy);assert.equal(calls,8);
 calls=0;await assert.rejects(publishDirectory('stage','final',{platform:'linux',move:async()=>{calls++;throw busy;}}),e=>e===busy);assert.equal(calls,1);
 const exists=Object.assign(new Error('exists'),{code:'EEXIST'});await assert.rejects(publishDirectory('stage','final',{platform:'win32',move:async()=>{throw exists;},wait:async()=>assert.fail('must not retry collisions')}),e=>e===exists);
});
