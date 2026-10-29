import test from 'node:test';
import assert from 'node:assert/strict';
import {integerDurations} from '../src/market/package.js';

test('fractional frame timing remains within half a millisecond at every exported boundary',()=>{
 const source=Array(63).fill(83.3065),before=[...source],result=integerDurations(source);
 assert.deepEqual(source,before);assert.ok(result.every(d=>Number.isInteger(d)&&d>0));
 let original=0,exported=0;
 for(let i=0;i<source.length;i++){original+=source[i];exported+=result[i];assert.ok(Math.abs(original-exported)<=0.500000001);}
 assert.equal(exported,Math.round(original));assert.ok(new Set(result).size>1);
});
test('integer timing is unchanged and invalid timing cannot be disguised by rounding',()=>{
 const source=[1,80,90,10000];assert.deepEqual(integerDurations(source),source);
 assert.deepEqual(integerDurations([1.1,1.1,1.1,1.1,1.1]),[1,1,1,1,2]);
 for(const value of [null,[NaN],[Infinity],[-1],[0],[0.4],[10000.1]])assert.throws(()=>integerDurations(value),/帧时长/);
});
