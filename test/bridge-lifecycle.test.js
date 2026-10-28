import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {BridgeClient,readEndpoint} from '../src/bridge-client.js';
import {StateStore} from '../src/state-store.js';
import {startLocalServer} from '../src/local-server.js';

const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function directory(t){const dir=await mkdtemp(path.join(process.cwd(),'.test-data-bridge-lifecycle-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}

test('close waits for pending runtime preparation and ignores later events',async t=>{
  const dir=await directory(t),started=gate(),finish=gate();
  const client=new BridgeClient({dir,instanceId:'test',ensureRuntime:async()=>{started.resolve();await finish.promise;}});
  const flushing=client.flush();await started.promise;
  assert.equal(client.flush(),flushing);
  let closed=false;const closing=client.close().then(()=>closed=true);
  await new Promise(r=>setImmediate(r));assert.equal(closed,false);
  client.enqueue({sessionId:'late'});assert.equal(client.queue.length,0);
  finish.resolve();await closing;assert.equal(closed,true);assert.equal(client.flushing,false);
  client.start();assert.equal(client.timer,undefined);
});

test('close during registration waits then disconnects; duplicate start owns one timer',async t=>{
  const dir=await directory(t),registered=gate(),release=gate();let connected=false,events=0;
  const server=http.createServer(async(req,res)=>{
    req.resume();
    if(req.url==='/register'){connected=true;registered.resolve();await release.promise;}
    if(req.url==='/disconnect')connected=false;
    if(req.url==='/event')events++;
    res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
  await writeFile(path.join(dir,'endpoint.json'),JSON.stringify({version:1,url:'http://127.0.0.1:'+server.address().port,token:'a'.repeat(64)}));
  const client=new BridgeClient({dir,instanceId:'test'});t.after(()=>client.close());
  client.start();const timer=client.timer;client.start();assert.equal(client.timer,timer);
  await registered.promise;const closing=client.close();release.resolve();await closing;
  assert.equal(connected,false);assert.equal(events,0);assert.equal(client.endpoint,null);
});

test('restart replaces endpoint safely and reconnect replays the current session',async t=>{
  const dir=await directory(t);let store=new StateStore(),server=await startLocalServer(store,dir),sequence=0;
  const client=new BridgeClient({dir,instanceId:'test',logger:{warn(){}}});
  client.onReconnect=()=>client.enqueue({version:1,instanceId:'test',sessionId:'session',turn:1,seq:++sequence,state:'working'});
  t.after(async()=>{await client.close();await server.close();});
  await client.flush();assert.equal(store.current().state,'working');
  const old=server;store=new StateStore();server=await startLocalServer(store,dir);
  await Promise.all([old.close(),old.close()]);
  assert.equal((await readEndpoint(dir)).token,server.endpoint.token);
  await client.flush();await client.flush();
  assert.equal(store.current().state,'working');assert.equal(store.instances.size,1);
  await client.close();assert.equal(store.current().state,'offline');assert.equal(store.instances.size,0);
});
