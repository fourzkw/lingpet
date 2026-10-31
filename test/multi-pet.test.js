import test from 'node:test';
import assert from 'node:assert/strict';
import {PetRegistry,migratePetConfig} from '../src/pet-registry.js';
import {StateStore} from '../src/state-store.js';
import {resolveFollow,bindingFor} from '../src/follow-resolver.js';

test('old settings migrate once without losing shape, size, visibility or position',()=>{
  const config=migratePetConfig({character:'deepseek',scale:1.25,x:-300,y:150,petVisible:false,alwaysOnTop:false});
  assert.equal(config.schemaVersion,2);assert.equal(config.pets.length,1);const pet=config.pets[0];
  assert.equal(pet.character,'deepseek');assert.equal(pet.x,-300);assert.equal(pet.scale,1.25);assert.equal(pet.petVisible,false);
  assert.deepEqual(migratePetConfig(config),config);
  assert.equal(migratePetConfig({schemaVersion:2,pets:[]}).pets.length,0);
});
test('pet creation, copying and pausing have independent settings and stable IDs',()=>{
  const registry=new PetRegistry({});const first=registry.pets[0],second=registry.duplicate(first.id);
  registry.update(second.id,{character:'deepseek',enabled:false,follow:{mode:'source',source:'cursor'}});
  assert.notEqual(first.id,second.id);assert.equal(first.character,'claude');assert.equal(first.enabled,true);assert.deepEqual(first.follow,{mode:'none',autoConnect:true});
  registry.remove(second.id);assert.equal(registry.pets.length,1);
  assert.throws(()=>registry.update(first.id,{follow:{mode:'source',source:'unknown'}}));assert.throws(()=>registry.require(second.id));
});
test('global, DSH and Cursor automatic follow resolve independently with no source fallback',()=>{
  let now=100;const store=new StateStore({now:()=>now});
  const emit=(source,sessionId,state)=>store.accept({version:1,source,scopeId:source+'-scope',instanceId:source,sessionId,state,seq:now,turn:1});
  emit('dsh','a','approval');now++;emit('cursor','b','working');
  assert.equal(resolveFollow(store,{mode:'global'}).sessionId,'a');
  assert.equal(resolveFollow(store,{mode:'source',source:'cursor'}).sessionId,'b');
  assert.equal(resolveFollow(store,{mode:'source',source:'dsh'}).sessionId,'a');
  store.disconnect('cursor');assert.equal(resolveFollow(store,{mode:'source',source:'cursor'}).state,'offline');
  const empty=new StateStore();empty.accept({version:1,source:'dsh',instanceId:'one',sessionId:'x',state:'working',seq:1,turn:1});
  assert.equal(resolveFollow(empty,{mode:'source',source:'cursor'}).key,null);
});
test('session binding survives connection ID changes and refuses ambiguous matches',()=>{
  let now=100;const store=new StateStore({now:()=>now});
  const event={version:1,source:'cursor',scopeId:'stable',instanceId:'old',sessionId:'task',state:'working',seq:1,turn:1};
  store.accept(event);const binding=bindingFor(store.current());store.disconnect('old');now++;
  store.accept({...event,instanceId:'new',state:'thinking'});
  assert.equal(resolveFollow(store,binding).instanceId,'new');
  now++;store.accept({...event,instanceId:'collision'});assert.match(resolveFollow(store,binding).label,/歧义/);
  store.disconnect('collision');store.disconnect('new');assert.equal(resolveFollow(store,binding).state,'offline');
  assert.equal(resolveFollow(new StateStore(),binding).state,'offline');
});
test('legacy session binding can acquire a stable scope from the same existing connection',()=>{
  const store=new StateStore();store.accept({version:1,source:'dsh',scopeId:'stable-profile',instanceId:'legacy-connection',sessionId:'task',state:'working',seq:1,turn:1});
  const legacy={mode:'session',source:'dsh',scopeId:'legacy-connection',sessionId:'task'};
  assert.equal(resolveFollow(store,legacy).scopeId,'stable-profile');
});
test('completion expires independently and unchanged timestamps keep the current automatic target',()=>{
  let now=100;const store=new StateStore({now:()=>now});
  for(const id of ['a','b'])store.accept({version:1,instanceId:'one',sessionId:id,state:'thinking',seq:1,turn:1});
  assert.equal(resolveFollow(store,{mode:'global'},'one:b').sessionId,'b');
  now++;store.accept({version:1,instanceId:'one',sessionId:'b',state:'done',seq:2,turn:1});assert.equal(resolveFollow(store).state,'done');
  now+=1900;assert.equal(resolveFollow(store).state,'idle');
});

test('standalone ignores active and disconnected sessions without exposing session identity',()=>{
 const store=new StateStore();store.accept({version:1,source:'codex',instanceId:'host',sessionId:'s',state:'approval',seq:1,turn:1});
 for(const disconnected of [false,true]){if(disconnected)store.disconnect('host');const current=resolveFollow(store,{mode:'none'},'host:s');assert.equal(current.state,'idle');assert.equal(current.sessionId,null);assert.equal(current.key,null);assert.equal(current.connected,false);assert.match(current.label,/不跟随/);}
});

test('fresh setup auto-connects once, explicit standalone and saved follow modes survive future events',()=>{
 for(const source of ['dsh','cursor','codex']){
  let registry=new PetRegistry({}),pet=registry.pets[0];assert.equal(pet.follow.mode,'none');
  registry=new PetRegistry(JSON.parse(JSON.stringify(registry.config)));pet=registry.pets[0];
  assert.equal(registry.connectAgent(source),true);assert.deepEqual(pet.follow,{mode:'source',source});
  registry.update(pet.id,{follow:{mode:'none'}});assert.equal(registry.connectAgent(source),false);assert.deepEqual(pet.follow,{mode:'none'});
  registry=new PetRegistry(JSON.parse(JSON.stringify(registry.config)));assert.equal(registry.connectAgent('cursor'),false);
  assert.equal(registry.connectAgent(source,{petId:pet.id,installed:true}),true);assert.deepEqual(registry.get(pet.id).follow,{mode:'source',source});
 }
 const registry=new PetRegistry({}),first=registry.pets[0],other=registry.create({follow:{mode:'session',source:'dsh',scopeId:'scope',sessionId:'fixed'}});
 registry.connectAgent('codex',{petId:first.id,installed:true});assert.equal(other.follow.mode,'session');
 registry.update(first.id,{follow:{mode:'global'}});assert.equal(registry.connectAgent('cursor',{petId:first.id,installed:true}),false);
 const fresh=registry.create();assert.equal(registry.connectAgent('codex',{installed:true}),false);assert.deepEqual(fresh.follow,{mode:'none'});assert.equal(registry.connectAgent('codex'),false);
 assert.deepEqual(migratePetConfig({scale:1}).pets[0].follow,{mode:'global'});
 const legacy={schemaVersion:2,pets:[{id:'old'}]};assert.deepEqual(migratePetConfig(legacy).pets[0].follow,{mode:'global'});
});

test('status labels default off for standalone and on when following an agent',()=>{
 const registry=new PetRegistry({}),pet=registry.pets[0];
 assert.equal(pet.showLabel,false);assert.equal(registry.create().showLabel,false);
 assert.equal(registry.connectAgent('codex'),true);assert.equal(pet.showLabel,true);
 registry.update(pet.id,{follow:{mode:'none'}});assert.equal(pet.showLabel,false);
 registry.update(pet.id,{showLabel:true});
 assert.equal(new PetRegistry(registry.config).get(pet.id).showLabel,true);
 registry.update(pet.id,{follow:{mode:'global'},showLabel:false});assert.equal(pet.showLabel,false);
 registry.update(pet.id,{follow:{mode:'source',source:'cursor'}});assert.equal(pet.showLabel,false);
 registry.update(pet.id,{follow:{mode:'none'}});assert.equal(pet.showLabel,false);
 registry.update(pet.id,{follow:{mode:'global'}});assert.equal(pet.showLabel,true);
 for(const mode of ['none','global']){
  const loaded=migratePetConfig({schemaVersion:2,pets:[{id:mode,follow:{mode}}]}).pets[0];
  assert.equal(loaded.showLabel,mode!=='none');
  const explicit=migratePetConfig({schemaVersion:2,pets:[{id:mode,follow:{mode},showLabel:mode==='none'}]}).pets[0];
  assert.equal(explicit.showLabel,mode==='none');
 }
});
