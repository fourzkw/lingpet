import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {IntegrationManager} from '../src/integrations/manager.js';
import {createAdapterPackage} from '../src/integrations/packages.js';

async function fixture(t){
 const base=path.resolve('.test-data-adapter-updates');await mkdir(base,{recursive:true});const folder=await mkdtemp(path.join(base,'case-'));t.after(()=>rm(folder,{recursive:true,force:true}));
 const root=path.join(folder,'template'),dir=path.join(folder,'data'),bridge=path.join(folder,'LingPetBridge.exe');
 await mkdir(path.join(root,'skills'),{recursive:true});await writeFile(path.join(root,'skills/guide.md'),'skill v1');
 await mkdir(path.join(root,'adapters/dsh'),{recursive:true});await writeFile(path.join(root,'adapters/dsh/package.json'),JSON.stringify({name:'lingpet-agent',version:'0.7.0'}));await writeFile(path.join(root,'adapters/dsh/index.js'),'export const revision=1;');
 const calls=[],markets=new Map();let fail=false;
 const execute=async(_file,args)=>{calls.push(args);
  if(args[1]==='marketplace'){
   if(args[2]==='list')return {stdout:JSON.stringify({marketplaces:[...markets].map(([name,root])=>({name,root}))})};
   if(args[2]==='remove')markets.delete(args[3]);
   if(args[2]==='add'){const meta=JSON.parse(await readFile(path.join(args[3],'.agents/plugins/marketplace.json'),'utf8'));markets.set(meta.name,args[3]);}
  }
  if(fail&&args[1]==='add'){fail=false;throw Error('host refused update');}
  return {stdout:''};
 };
 const make=(version='0.7.27')=>new IntegrationManager({dir,root,bridge,version,home:path.join(folder,'home'),execute});
 const install=(manager,source)=>manager.install({source,config:path.join(folder,source),...(source==='cursor'?{}:{executable:path.join(folder,source+'.exe')}),profile:'custom'});
 return {folder,root,dir,bridge,calls,markets,make,install,setFail:()=>{fail=true;}};
}

test('desktop-only upgrades keep adapter versions, registration and credentials unchanged',async t=>{
 const f=await fixture(t),first=f.make();for(const source of ['codex','cursor','dsh'])await f.install(first,source);
 const before=await first.records();f.calls.length=0;const upgraded=f.make('0.8.0');await upgraded.sync();
 assert.deepEqual(await upgraded.records(),before);assert.deepEqual(f.calls,[]);
 const list=await upgraded.discover();assert.ok(list.items.every(item=>!item.updateAvailable&&item.version.startsWith('1.0.0-content.')));
 assert.ok(list.items.every(item=>!('token' in item)&&!('controlToken' in item)));
});

test('a DSH payload change updates only DSH and keeps the other hosts untouched',async t=>{
 const f=await fixture(t),first=f.make();for(const source of ['codex','cursor','dsh'])await f.install(first,source);const before=await first.records();
 await writeFile(path.join(f.root,'adapters/dsh/index.js'),'export const revision=2;');f.calls.length=0;const next=f.make('0.8.0');await next.sync();const after=await next.records();
 for(const source of ['codex','cursor'])assert.deepEqual(after.find(i=>i.source===source),before.find(i=>i.source===source));
 const old=before.find(i=>i.source==='dsh'),updated=after.find(i=>i.source==='dsh');assert.notEqual(updated.version,old.version);assert.equal(updated.id,old.id);assert.equal(updated.token,old.token);assert.equal(updated.controlToken,old.controlToken);assert.equal(updated.profile,'custom');assert.equal(updated.autoUpdate.status,'updated');assert.equal(updated.state,'installed');assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].slice(0,4),['plugin','--profile','custom','add']);
 f.calls.length=0;await f.make('0.8.1').sync();assert.deepEqual(f.calls,[]);
});

test('changed skills refresh all installed hosts once and concurrent sync calls share one queue',async t=>{
 const f=await fixture(t),first=f.make();for(const source of ['codex','cursor','dsh'])await f.install(first,source);
 await writeFile(path.join(f.root,'skills/guide.md'),'skill v2');f.calls.length=0;const next=f.make();const a=next.sync(),b=next.sync();assert.equal(a,b);await a;
 const rows=await next.records();assert.ok(rows.every(row=>row.autoUpdate.status==='updated'));assert.equal(rows.length,3);assert.equal(f.calls.filter(args=>args[0]==='plugin'&&args[1]==='add').length,1);assert.equal(f.calls.filter(args=>args[1]==='--profile').length,1);assert.equal(next.syncState.running,false);
});

test('legacy records with equal package content migrate without touching host files',async t=>{
 const f=await fixture(t),manager=f.make();for(const source of ['codex','cursor','dsh'])await f.install(manager,source);const records=await manager.records();
 for(const row of records){row.version='0.7.0';delete row.adapterVersion;delete row.adapterFingerprint;delete row.coreVersion;delete row.bridgeProtocol;await createAdapterPackage({...row,destination:row.packageRoot,bridge:f.bridge,templateRoot:f.root,dir:f.dir});}
 await manager.save(records);f.calls.length=0;const next=f.make('0.8.0');await next.sync();assert.deepEqual(f.calls,[]);const rows=await next.records();
 for(const row of rows){assert.equal(row.version,'0.7.0');assert.ok(row.adapterVersion.startsWith('1.0.0-content.'));assert.equal(row.packageRoot,records.find(i=>i.id===row.id).packageRoot);assert.equal((await next.inspect(row.id)).updateAvailable,false);}
});

test('failed automatic Codex updates restore the marketplace and old authorization; retry remains manual',async t=>{
 const f=await fixture(t),first=f.make();const installed=await f.install(first,'codex'),[old]=await first.records();await writeFile(path.join(f.root,'skills/guide.md'),'changed');f.setFail();
 const next=f.make('0.8.0');const result=await next.sync();assert.match(result[0].error,/host refused update/);const [row]=await next.records();assert.equal(row.state,'installed');assert.equal(row.enabled,true);assert.equal(row.packageRoot,old.packageRoot);assert.equal(row.version,old.version);assert.equal(row.autoUpdate.status,'failed');assert.equal(f.markets.get('lingpet-'+row.id),old.packageRoot);assert.equal((await next.authorize(old.token)).id,old.id);assert.equal((await next.authorize(old.controlToken,true)).id,old.id);
 f.calls.length=0;const restarted=f.make('0.8.1');await restarted.sync();assert.deepEqual(f.calls,[]);assert.equal((await restarted.inspect(installed.id)).updateAvailable,true);
 const retried=await restarted.install(row);assert.equal(retried.state,'installed');assert.equal(retried.autoUpdate,undefined);assert.equal(retried.updateAvailable,false);
});

test('automatic sync skips partial, removed and disabled integrations',async t=>{
 const f=await fixture(t),manager=f.make();for(const source of ['codex','cursor','dsh'])await f.install(manager,source);const rows=await manager.records();rows[0].state='partial';rows[1].state='removed';rows[2].enabled=false;await manager.save(rows);await writeFile(path.join(f.root,'skills/guide.md'),'changed');f.calls.length=0;await f.make().sync();assert.deepEqual(await manager.records(),rows);assert.deepEqual(f.calls,[]);
});

test('interrupted attempts become repair notices instead of an automatic reinstall loop',async t=>{
 const f=await fixture(t),manager=f.make();await f.install(manager,'cursor');await writeFile(path.join(f.root,'skills/guide.md'),'changed');const next=f.make(),release=await next.releaseFor('cursor'),rows=await manager.records();rows[0].autoUpdate={status:'updating',attemptFingerprint:release.fingerprint};await manager.save(rows);await next.sync();assert.equal((await manager.records())[0].autoUpdate.status,'failed');assert.match((await manager.records())[0].autoUpdate.error,/中断/);
});

test('interrupted automatic installations recover previous credentials and remain manually repairable',async t=>{
 const f=await fixture(t),manager=f.make();await f.install(manager,'cursor');const [old]=await manager.records();await writeFile(path.join(f.root,'skills/guide.md'),'changed');const next=f.make(),release=await next.releaseFor('cursor');
 const transaction=path.join(f.folder,'interrupted-transaction');await mkdir(transaction);await writeFile(path.join(transaction,'transaction.json'),JSON.stringify({plan:{previous:old,changes:[]}}));
 await manager.save([{...old,state:'installing',transaction,packageRoot:path.join(f.folder,'incomplete-package'),adapterFingerprint:release.fingerprint,autoUpdate:{status:'updating',attemptFingerprint:release.fingerprint}}]);
 await next.sync();const [restored]=await manager.records();assert.equal(restored.state,'installed');assert.equal(restored.packageRoot,old.packageRoot);assert.equal(restored.autoUpdate.status,'failed');assert.equal((await next.authorize(old.token)).id,old.id);assert.equal((await next.inspect(old.id)).updateAvailable,true);
});

test('a pre-install failure records an error and does not disable the working connection',async t=>{
 const f=await fixture(t),manager=f.make();await f.install(manager,'codex');const [old]=await manager.records();await writeFile(path.join(f.root,'skills/guide.md'),'changed');const next=f.make();next.plan=async()=>{throw Error('planning unavailable');};await next.sync();const [row]=await manager.records();assert.equal(row.enabled,true);assert.equal(row.state,'installed');assert.equal(row.autoUpdate.status,'failed');assert.match(row.autoUpdate.error,/planning unavailable/);
});
