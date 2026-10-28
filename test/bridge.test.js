import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {StateStore} from '../src/state-store.js';
import {startLocalServer} from '../src/local-server.js';
import {BridgeClient,readEndpoint,request} from '../src/bridge-client.js';

test('authenticated local transport, hostile browser rejection, reconnect and clean disconnect',async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),'.test-data-'));
  const s=new StateStore(),server=await startLocalServer(s,dir);let client;
  try{
    const endpoint=await readEndpoint(dir);assert.equal((await request(endpoint,'/health')).version,1);
    assert.equal((await fetch(endpoint.url+'/health')).status,401);
    assert.equal((await fetch(endpoint.url+'/health',{headers:{Origin:'https://example.com',Authorization:`Bearer ${endpoint.token}`}})).status,403);
    client=new BridgeClient({dir,instanceId:'one'});await client.flush();
    client.enqueue({version:1,instanceId:'one',sessionId:'s',turn:1,state:'approval',seq:1});
    for(let i=0;i<30&&s.current().state!=='approval';i++)await new Promise(r=>setTimeout(r,10));
    assert.equal(s.current().state,'approval');
    await client.close();assert.equal(s.current().state,'offline');
  }finally{await client?.close();await server.close();await rm(dir,{recursive:true,force:true});}
});
test('bounded offline queue coalesces sessions, invalid endpoint never contacts external address',async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),'.test-data-'));
  try{
    await writeFile(path.join(dir,'endpoint.json'),JSON.stringify({version:1,url:'https://example.com',token:'a'.repeat(64)}));assert.equal(await readEndpoint(dir),null);
    const client=new BridgeClient({dir,instanceId:'one',maxQueue:2});
    client.flushing=true;
    for(let i=0;i<100;i++)client.enqueue({sessionId:'s',seq:i});
    assert.equal(client.queue.length,1);assert.equal(client.queue[0].seq,99);await client.close();
  }finally{await rm(dir,{recursive:true,force:true});}
});
