export const CODEX_HOOKS=['SessionStart','SessionEnd','UserPromptSubmit','PreToolUse','PermissionRequest','PostToolUse','Stop','Interrupt'];
const id=value=>typeof value==='string'&&value.length>0&&value.length<=256?value:null;
// No prompts, transcripts, command arguments, results or working directories leave the hook.
export function normalizeCodexEvent(raw){
  if(!raw||!CODEX_HOOKS.includes(raw.hook_event_name)||!id(raw.session_id))return null;
  const hook=raw.hook_event_name,turn=id(raw.turn_id),tool=id(raw.tool_use_id);
  if(!['SessionStart','SessionEnd'].includes(hook)&&!turn)return null;
  if(['PreToolUse','PostToolUse'].includes(hook)&&!tool)return null;
  return {hook_event_name:hook,session_id:raw.session_id,...(turn?{turn_id:turn}:{}),...(tool?{tool_use_id:tool}:{}),...(hook==='PreToolUse'?{waitingInput:raw.waitingInput===true||raw.tool_name==='mcp__user__request_user_input'||raw.tool_name==='request_user_input'}:{})};
}
export class CodexObserver{
  constructor(emit,{instanceId,now=Date.now,maxSessions=200}={}){Object.assign(this,{emit,instanceId,now,maxSessions});this.sessions=new Map();this.seq=0;}
  publish(s,state){s.state=state;s.updatedAt=this.now();s.event={version:1,source:'codex',scopeId:'codex-local',instanceId:this.instanceId,sessionId:s.id,turn:s.turn,seq:++this.seq,state};this.emit(s.event);return true;}
  accept(raw){
    const e=normalizeCodexEvent(raw);if(!e)return false;const hook=e.hook_event_name;let s=this.sessions.get(e.session_id);
    if(!s){
      if(hook==='SessionEnd')return false;
      if(this.sessions.size>=this.maxSessions){const oldest=[...this.sessions.values()].sort((a,b)=>a.updatedAt-b.updatedAt)[0];this.publish(oldest,'offline');this.sessions.delete(oldest.id);}
      s={id:e.session_id,turn:0,turnId:null,seen:new Set(),tools:new Map(),finished:new Set(),terminal:false,ended:false};this.sessions.set(s.id,s);
    }
    if(hook==='SessionEnd'){if(s.ended)return false;s.ended=true;s.tools.clear();return this.publish(s,'offline');}
    if(hook==='SessionStart'){if(s.event&&!s.ended)return false;s.ended=false;return this.publish(s,'idle');}
    if(e.turn_id!==s.turnId){
      if(s.seen.has(e.turn_id)||s.turnId&&hook!=='UserPromptSubmit')return false;
      s.turnId=e.turn_id;s.seen.add(e.turn_id);s.turn++;s.tools.clear();s.finished.clear();s.terminal=false;s.ended=false;s.submitted=false;
    }
    if(s.terminal||s.ended)return false;
    if(hook==='UserPromptSubmit'){if(s.submitted)return false;s.submitted=true;return this.publish(s,s.tools.size?'working':'thinking');}
    if(hook==='PermissionRequest')return this.publish(s,'approval');
    if(hook==='PreToolUse'){
      if(s.finished.has(e.tool_use_id)||s.tools.has(e.tool_use_id))return false;
      s.tools.set(e.tool_use_id,e.waitingInput);return this.publish(s,e.waitingInput?'input':'working');
    }
    if(hook==='PostToolUse'){
      if(s.finished.has(e.tool_use_id))return false;s.finished.add(e.tool_use_id);s.tools.delete(e.tool_use_id);
      return this.publish(s,[...s.tools.values()].includes(true)?'input':s.tools.size?'working':'thinking');
    }
    if(hook==='Stop'||hook==='Interrupt'){s.terminal=true;s.tools.clear();return this.publish(s,hook==='Stop'?'done':'interrupted');}
    return false;
  }
  replay(){for(const s of this.sessions.values())if(s.event)this.publish(s,s.state==='done'?'idle':s.state);}
}
