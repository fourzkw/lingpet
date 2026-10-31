import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {MarketService} from '../src/market/service.js';

test('announcements fetch, mark read, and survive market outage',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'lingpet-announcements-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const item={id:'a'.repeat(48),title:'维护通知',body:'今晚维护',level:'important',forceShow:true,link:'https://example.com/notice',linkLabel:'详情',updatedAt:new Date().toISOString()};
  let calls=0;
  const market=new MarketService(dir,{fetcher:async url=>{
    calls+=1;
    if(String(url).includes('/api/announcements'))return {ok:true,headers:new Headers({'content-type':'application/json'}),body:(async function*(){yield Buffer.from(JSON.stringify([item]));})()};
    throw new Error('unexpected '+url);
  }});
  const first=await market.announcements({appVersion:'0.7.32'});
  assert.equal(first.items.length,1);assert.equal(first.items[0].read,false);assert.equal(first.items[0].forceShow,true);
  await market.markAnnouncementRead(item.id);
  const second=await market.announcements({appVersion:'0.7.32'});
  assert.equal(second.items[0].read,true);assert.ok(calls>=2);
  const offline=new MarketService(dir,{fetcher:async()=>{throw new Error('offline');}});
  const failed=await offline.announcements({appVersion:'0.7.32'});
  assert.equal(failed.items.length,0);assert.match(failed.error,/offline/);assert.deepEqual(failed.readIds,[item.id]);
});
