import { randomUUID } from 'node:crypto';

/** Metadata-only observer for DSH 0.2.1-rc.2 session/event contracts. */
export class DshObserver {
  constructor(send, { instanceId = randomUUID(), scopeId=instanceId, includeSubagents = false, isSubagent = () => false } = {}) {
    this.send = send; this.instanceId = instanceId; this.scopeId=scopeId; this.includeSubagents = includeSubagents; this.isSubagent = isSubagent; this.sessions = new Map(); this.seq = 0;
  }
  session(id) {
    if (!this.sessions.has(id)) this.sessions.set(id, { turn: null, state: 'idle', pendingApprovals: new Set(), pendingQuestions: new Set(), tools: new Set(), subagent: this.isSubagent(id) });
    return this.sessions.get(id);
  }
  publish(id, state, force = false) {
    const s = this.session(id);
    if (s.subagent && !this.includeSubagents) return;
    if (s.state === state && !force) return;
    s.state = state;
    this.send({ version: 1, instanceId: this.instanceId, scopeId:this.scopeId, source: 'dsh', sessionId: id, turn: s.turn, state, seq: ++this.seq, subagent: s.subagent });
  }
  activeState(s) { return s.pendingApprovals.size ? 'approval' : s.pendingQuestions.size ? 'input' : s.tools.size ? 'working' : 'thinking'; }
  observe(id, event) {
    const s = this.session(id), data = event.data ?? {};
    if (s.subagent && !this.includeSubagents) return;
    if (Number.isSafeInteger(data.turn) && s.turn !== null && data.turn < s.turn) return;
    switch (event.type) {
      case 'turn/start':
        s.turn = data.turn; s.pendingApprovals.clear(); s.pendingQuestions.clear(); s.tools.clear(); this.publish(id, 'thinking', true); break;
      case 'step/start': this.publish(id, this.activeState(s)); break;
      case 'tool/call':
        s.tools.add(data.callId ?? event.seq);
        // Legacy and timed ask-user tools are distinguishable by exact tool name.
        if (['ask_user_question', 'ask_user_question_timed'].includes(data.name)) s.pendingQuestions.add(data.callId ?? event.seq);
        this.publish(id, this.activeState(s)); break;
      case 'tool/result':
        s.tools.delete(data.message?.toolCallId); s.pendingQuestions.delete(data.message?.toolCallId);
        this.publish(id, this.activeState(s)); break;
      case 'approval/asked': s.pendingApprovals.add(data.id); this.publish(id, 'approval'); break;
      case 'approval/decided': s.pendingApprovals.delete(data.id); this.publish(id, this.activeState(s)); break;
      case 'turn/end': {
        s.tools.clear(); s.pendingApprovals.clear(); s.pendingQuestions.clear();
        const reason = data.reason?.kind;
        this.publish(id, reason === 'completed' ? 'done' : ['aborted','interrupted','forked'].includes(reason) ? 'interrupted' : ['error','max-tokens'].includes(reason) ? 'error' : 'idle', true); break;
      }
    }
  }
  status(id, status) {
    const s = this.session(id);
    if (status === 'running' && ['idle','offline'].includes(s.state)) this.publish(id, 'thinking');
    // idle is not success and must not overwrite a durable turn/end settlement.
  }
  dispose(id) { this.publish(id, 'offline'); this.sessions.delete(id); }
  hydrate(id,session,status) {
    const events=[];
    for(let seq=session.seq-1;seq>=Math.max(0,session.seq-2048);seq--){
      const event=session.eventAt(seq);if(!event)continue;events.push(event);if(event.type==='turn/start')break;
    }
    const send=this.send;this.send=()=>{};
    try{for(const event of events.reverse())this.observe(id,event);}finally{this.send=send;}
    const s=this.session(id);
    this.publish(id,status==='running'&&!['done','interrupted','error'].includes(s.state)?this.activeState(s):status==='running'?'thinking':'idle',true);
  }
  resync() { for (const [id,s] of this.sessions) this.publish(id, s.state, true); }
}
