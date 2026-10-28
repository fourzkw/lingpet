export const CURSOR_HOOKS=['sessionStart','sessionEnd','beforeSubmitPrompt','preToolUse','postToolUse','postToolUseFailure','stop'];
const id=value=>typeof value==='string'&&value.length>0&&value.length<=256?value:null;

// Whitelist before IPC: no prompt, tool input/output, paths, transcript or email.
export function normalizeCursorEvent(raw){
  if(!raw||typeof raw!=='object')return null;
  const hook=raw.hook_event_name,sessionId=id(raw.conversation_id)||id(raw.session_id);
  if(!CURSOR_HOOKS.includes(hook)||!sessionId)return null;
  const generationId=id(raw.generation_id),toolId=id(raw.tool_use_id);
  if(!['sessionStart','sessionEnd'].includes(hook)&&!generationId)return null;
  if(['preToolUse','postToolUse','postToolUseFailure'].includes(hook)&&!toolId)return null;
  if(hook==='stop'&&!['completed','error','aborted'].includes(raw.status))return null;
  return {hook_event_name:hook,conversation_id:sessionId,...(generationId?{generation_id:generationId}:{}),...(toolId?{tool_use_id:toolId}:{}),...(hook==='stop'?{status:raw.status}:{})};
}

export class CursorObserver{
  constructor(emit,{instanceId,now=Date.now,maxSessions=200}={}){
    this.emit=emit;this.instanceId=instanceId;this.now=now;this.maxSessions=maxSessions;this.sessions=new Map();this.seq=0;
  }
  publish(s,state){
    s.state=state;s.updatedAt=this.now();
    const event={version:1,source:'cursor',scopeId:'cursor-local',instanceId:this.instanceId,sessionId:s.id,seq:++this.seq,turn:s.turn,state};
    s.event=event;this.emit(event);return true;
  }
  accept(raw){
    const e=normalizeCursorEvent(raw);if(!e)return false;
    let s=this.sessions.get(e.conversation_id);
    if(!s){
      if(e.hook_event_name==='sessionEnd')return false;
      if(this.sessions.size>=this.maxSessions){const oldest=[...this.sessions.values()].sort((a,b)=>a.updatedAt-b.updatedAt)[0];this.publish(oldest,'offline');this.sessions.delete(oldest.id);}
      s={id:e.conversation_id,turn:0,generation:null,seen:new Set(),tools:new Set(),finishedTools:new Set(),terminal:false,ended:false,updatedAt:this.now()};this.sessions.set(s.id,s);
    }
    const hook=e.hook_event_name;
    if(hook==='sessionEnd'){if(s.ended)return false;s.ended=true;s.tools.clear();return this.publish(s,'offline');}
    if(hook==='sessionStart'){if(s.event)return false;return this.publish(s,'idle');}
    if(e.generation_id!==s.generation){
      if(s.seen.has(e.generation_id)||s.ended&&hook!=='beforeSubmitPrompt')return false;
      // A result for an unknown generation must never replace an active turn.
      if(s.generation&&hook!=='beforeSubmitPrompt')return false;
      s.generation=e.generation_id;s.seen.add(s.generation);s.turn++;s.tools.clear();s.finishedTools.clear();s.terminal=false;s.ended=false;s.submitted=false;
    }
    if(s.terminal)return false;
    if(hook==='beforeSubmitPrompt'){
      if(s.submitted)return false;s.submitted=true;
      return this.publish(s,s.tools.size?'working':'thinking');
    }
    if(hook==='preToolUse'){
      if(s.tools.has(e.tool_use_id)||s.finishedTools.has(e.tool_use_id))return false;
      s.tools.add(e.tool_use_id);return this.publish(s,'working');
    }
    if(hook==='postToolUse'||hook==='postToolUseFailure'){
      if(s.finishedTools.has(e.tool_use_id))return false;
      s.finishedTools.add(e.tool_use_id);s.tools.delete(e.tool_use_id);
      return this.publish(s,s.tools.size?'working':'thinking');
    }
    if(hook==='stop'){
      s.terminal=true;s.tools.clear();return this.publish(s,{completed:'done',error:'error',aborted:'interrupted'}[e.status]);
    }
    return false;
  }
  replay(){for(const s of this.sessions.values())if(s.event)this.publish(s,s.state==='done'?'idle':s.state);}
}
