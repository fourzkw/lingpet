import {randomUUID} from 'node:crypto';

// Symbol + WeakMap survives ESM replacement, without retaining a disposed DSH root.
const key=Symbol.for('board-ai-pet.hot-state.v1');
const roots=globalThis[key]??=new WeakMap();
export function acquireHotState(root,dir){
  let entries=roots.get(root);if(!entries){entries=new Map();roots.set(root,entries);}
  let record=entries.get(dir);
  if(!record){record={instanceId:randomUUID(),seq:0,generation:0};entries.set(dir,record);}
  clearTimeout(record.timer);record.timer=null;record.generation++;
  const generation=record.generation;
  return {record,release(disconnect){
    record.timer=setTimeout(()=>{
      if(record.generation!==generation)return;
      entries.delete(dir);record.timer=null;void disconnect().catch(()=>{});
    },1500);record.timer.unref?.();
  }};
}
