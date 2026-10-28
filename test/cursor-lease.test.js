import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {cursorLeaseAllowed,acquireCursorLease} from '../src/cursor-lease.js';
test('Cursor extension windows share a lease and last disable stops only Cursor event forwarding',async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),'.test-data-lease-'));let a,b;
  try{
    assert.equal(await cursorLeaseAllowed(dir),true);
    a=await acquireCursorLease(dir);b=await acquireCursorLease(dir);assert.equal(await cursorLeaseAllowed(dir),true);
    await a.dispose();assert.equal(await cursorLeaseAllowed(dir),true);
    assert.equal(await cursorLeaseAllowed(dir,{now:Date.now()+31000}),false);
    await b.dispose();assert.equal(await cursorLeaseAllowed(dir),false);
  }finally{await a?.dispose();await b?.dispose();await rm(dir,{recursive:true,force:true});}
});
