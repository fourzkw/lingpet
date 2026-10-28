import Schema from '@deepseek-ai/schemastery';
import { DshObserver } from './dsh-observer.js';
import { BridgeClient } from './bridge-client.js';
import { dataDirectory } from './paths.js';
import { ensureRuntime } from './bootstrap.js';
import { createPetControl } from './pet-control.js';
import { createControlHandler } from './control-route.js';
import {acquireHotState} from './hot-state.js';
import {describeRelease} from './release.js';
import {createHash} from 'node:crypto';
import {CreationService} from './creation/service.js';
import {registerDshCreationTools} from './creation/dsh-tools.js';
import {registerCreationSkill} from './creation/skill.js';

export const name='board-ai-pet';
export const inject=['agents','sessions'];
export const Config=Schema.object({
  autoStart:Schema.boolean().default(true).description('插件启用时自动启动本机桌宠').volatile(),
  includeSubagents:Schema.boolean().default(false).description('同时显示子Agent').volatile(),
  dataDir:Schema.string().default('').description('桌宠数据目录，留空使用当前用户目录'),
  sourceId:Schema.string().default('').description('来源稳定标识；同一路径多 profile 时可分别指定'),
});

export function apply(ctx,config={}) {
  const read=(value,fallback)=>value&&typeof value.get==='function'?value.get():value??fallback;
  ctx.inject(['settings'],child=>child.effect(()=>child.settings.configure({auto:false},ctx.fiber)));
  let bridge,active=true;
  const dir=dataDirectory(config.dataDir||undefined);
  ctx.inject(['tools'],child=>registerDshCreationTools(child,new CreationService(dir)));
  ctx.inject(['skills'],child=>registerCreationSkill(child));
  const profileIndex=process.argv.indexOf('--profile');
  const profile=process.env.DSH_PROFILE||(profileIndex>=0?process.argv[profileIndex+1]:'')||process.argv.find(arg=>arg.startsWith('--profile='))?.slice(10)||'default';
  // The DSH settings page calls these routes same-origin; they are the only
  // control channel that can start, stop or reveal the desktop pet.
  const control=createPetControl({dir,ensure:()=>ensureRuntime(dir,{explicit:true})});
  ctx.inject(['webServer'],child=>child.effect(()=>child.webServer.register({kind:'prefix',path:'/board-pet',handler:createControlHandler(control)})));
  const lease=acquireHotState(ctx.root,dir);
  const observer=new DshObserver(event=>{if(active){lease.record.seq=event.seq;bridge?.enqueue(event);}}, {
    instanceId:lease.record.instanceId,
    scopeId:'dsh-'+createHash('sha256').update(config.sourceId||process.cwd()+':'+profile).digest('hex').slice(0,24),
    includeSubagents:read(config.includeSubagents,false),
    isSubagent:id=>{const agent=ctx.agents.get(id);return Boolean(agent&&[...ctx.agents.list()].some(parent=>parent!==agent&&ctx.agents.isOwnedBy(id,parent)));},
  });
  Object.defineProperty(observer,'includeSubagents',{get:()=>read(config.includeSubagents,false)});
  observer.seq=lease.record.seq;
  const release=describeRelease();release.catch(()=>{});
  bridge=new BridgeClient({dir,instanceId:observer.instanceId,release,getIncludeSubagents:()=>read(config.includeSubagents,false),ensureRuntime:()=>read(config.autoStart,true)?ensureRuntime(dir):undefined});
  bridge.onReconnect=()=>observer.resync();
  ctx.on('session/event',(session,event)=>{
    try{observer.observe(String(session.id),event);}catch(error){console.warn('[board-ai-pet] 状态观察失败:',error.message);}
  });
  ctx.on('agent/status',({agent,status})=>observer.status(String(agent.id),status));
  ctx.on('agent/disposed',({agent})=>observer.dispose(String(agent.id)));
  ctx.on('agent/created',({agent})=>{observer.publish(String(agent.id),agent.status==='running'?'thinking':'idle',true);});
  // Snapshot only live state when enabled during an existing session; no transcript is sent.
  for(const agent of ctx.agents.list())observer.hydrate(String(agent.id),agent.session,agent.status);
  ctx.on('settings/document-updated',ns=>{
    if(ns===ctx.fiber.entry?.options?.id||ns==='board-ai-pet'){
      bridge.nextStart=0;void bridge.flush();
      for(const agent of ctx.agents.list())observer.hydrate(String(agent.id),agent.session,agent.status);
    }
  });
  ctx.effect(()=>{
    bridge.start();
    return ()=>{active=false;lease.release(()=>bridge.disconnect());return bridge.close({disconnect:false});};
  });
}
