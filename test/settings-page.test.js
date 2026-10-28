import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('settings page registers one scoped settings section, edits the native form and disposes on unload',async()=>{
  let definition,registration,component,disposed=0,saved=[];
  const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useSyncExternalStore:(_subscribe,get)=>get(),useState:initial=>[initial,()=>{}],useEffect:()=>{}};
  const form={getSnapshot:()=>({status:'ready',writable:true,value:{autoStart:false,includeSubagents:true}}),subscribe:()=>()=>{},set:async(...args)=>{saved.push(args);return true;},mutate:async ops=>{saved.push(ops);return true;}};
  const context={window:{__ModuleLoader__:{load:value=>{definition=value;}}}};
  vm.runInNewContext(await readFile(new URL('../client/client.js',import.meta.url),'utf8'),context);
  assert.equal(definition.id,'lingpet');
  const plugin=definition.factory(name=>{assert.equal(name,'react');return React;});
  const effects=[];plugin.apply({effect:callback=>effects.push(callback()),configForms:{get:id=>{assert.equal(id,'board-ai-pet');return form;},whileServed:(ids,register)=>{assert.deepEqual(Array.from(ids),['board-ai-pet']);return register();}},slots:{inject:(name,register)=>{assert.equal(name,'settings.section');return register();},register:(options,view)=>{registration=options;component=view;return()=>disposed++;}}});
  assert.equal(registration.id,'board-ai-pet');assert.equal(registration.label(),'桌宠');
  const nodes=[];function walk(node){if(!node||typeof node!=='object')return;nodes.push(node);node.children?.flat().forEach(walk);}
  walk(component(registration.inject()));
  const toggles=nodes.filter(n=>n.type==='input');assert.equal(toggles.length,2);
  assert.equal(toggles[0].props.checked,false);assert.equal(toggles[1].props.checked,true);
  const actions=nodes.filter(n=>n.type==='button'&&n.props['data-pet-action']);
  assert.deepEqual(actions.map(n=>n.props['data-pet-action']),['start','stop','dashboard']);
  // The first paint has no status yet, so only "start" is available.
  assert.deepEqual(actions.map(n=>n.props.disabled),[false,true,true]);
  await toggles[0].props.onChange({target:{checked:true}});await new Promise(r=>setImmediate(r));
  assert.deepEqual(saved[0],['autoStart',true]);
  form.getSnapshot=()=>({status:'ready',writable:false,value:{}});nodes.length=0;walk(component({form}));
  assert.ok(nodes.filter(n=>n.type==='input'||(n.type==='button'&&!n.props['data-pet-action'])).every(n=>n.props.disabled));
  effects.reverse().forEach(dispose=>dispose());assert.equal(disposed,1);
});
