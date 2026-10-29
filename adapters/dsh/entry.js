import Schema from '@deepseek-ai/schemastery';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {DshObserver} from '../../src/dsh-observer.js';
import {integrationRequest,creationProxy} from '../../src/integrations/client.js';
import {registerDshCreationTools} from '../../src/creation/dsh-tools.js';

export const name='board-ai-pet',inject=['agents','sessions'];
export const Config=Schema.object({includeSubagents:Schema.boolean().default(false).description('显示子 Agent')});
export async function apply(ctx,config={}){
  const {id,dir}=JSON.parse(await readFile(new URL('./connection.json',import.meta.url),'utf8'));
  let closed=false,sending=false;const queue=new Map();
  const send=(route,body)=>integrationRequest(dir,id,route,body,{timeout:1000});
  const observer=new DshObserver(event=>{queue.set(event.sessionId,event);if(queue.size>200)queue.delete(queue.keys().next().value);void flush();},{instanceId:randomUUID(),includeSubagents:Boolean(config.includeSubagents)});
  let lastGeneration;
  async function flush(){if(closed||sending)return;sending=true;try{const status=await send('/heartbeat',{instanceId:observer.instanceId});if(lastGeneration!==status.generation||status.resync){lastGeneration=status.generation;observer.resync();}for(const [key,event]of queue){await send('/event',event);if(queue.get(key)===event)queue.delete(key);}}catch{}finally{sending=false;}}
  ctx.inject(['tools'],child=>registerDshCreationTools(child,creationProxy(dir,id)));
  ctx.on('session/event',(session,event)=>observer.observe(String(session.id),event));
  ctx.on('agent/status',({agent,status})=>observer.status(String(agent.id),status));
  ctx.on('agent/disposed',({agent})=>observer.dispose(String(agent.id)));
  ctx.on('agent/created',({agent})=>observer.publish(String(agent.id),agent.status==='running'?'thinking':'idle',true));
  for(const agent of ctx.agents.list())observer.hydrate(String(agent.id),agent.session,agent.status);
  ctx.effect(()=>{const timer=setInterval(()=>void flush(),10000);timer.unref?.();void flush();return()=>{closed=true;clearInterval(timer);void send('/disconnect',{instanceId:observer.instanceId}).catch(()=>{});};});
}
