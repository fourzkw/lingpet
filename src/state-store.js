import { EventEmitter } from 'node:events';
import { validateEvent } from './protocol.js';

export class StateStore extends EventEmitter {
  constructor({ now = Date.now, staleMs = 45000, maxSessions = 200 } = {}) {
    super(); this.now = now; this.staleMs = staleMs; this.maxSessions = maxSessions;
    this.sessions = new Map(); this.instances = new Map(); this.selected = null; this.follow = 'attention'; this.focused = null;
  }
  register(id) {
    if (typeof id !== 'string' || !id || id.length > 256) throw new Error('无效的来源实例');
    this.instances.set(id, this.now());
    this.emit('change', this.snapshot());
  }
  heartbeat(id) { if (!this.instances.has(id)) return false; this.instances.set(id, this.now()); return true; }
  disconnect(id) {
    this.instances.delete(id);
    for (const session of this.sessions.values()) if (session.instanceId === id) session.connected = false;
    this.emit('change', this.snapshot());
  }
  accept(raw) {
    const event = validateEvent(raw), key = `${event.instanceId}:${event.sessionId}`;
    const previous = this.sessions.get(key);
    if (previous && event.seq <= previous.seq) return false;
    if (previous && previous.turn !== null && event.turn !== null && event.turn < previous.turn) return false;
    const session = { ...event, key, connected: true, updatedAt: this.now() };
    this.instances.set(event.instanceId, this.now());
    this.sessions.set(key, session);
    if (!previous || event.state !== previous.state || event.turn !== previous.turn) this.focused = key;
    if (this.sessions.size > this.maxSessions) {
      const oldest = [...this.sessions.values()].filter(s => s.key !== key && s.key !== this.selected).sort((a,b) => a.updatedAt-b.updatedAt)[0];
      if (oldest) this.sessions.delete(oldest.key);
    }
    this.emit('change', this.snapshot()); return true;
  }
  select(key) { if (key !== null && !this.sessions.has(key)) throw new Error('会话不存在'); this.selected = key; this.emit('change', this.snapshot()); }
  filterSubagents(id,include){
    if(typeof include!=='boolean'||!this.instances.has(id))throw new Error('无效的来源筛选');
    if(include)return;
    for(const [key,session] of this.sessions)if(session.instanceId===id&&session.subagent){
      this.sessions.delete(key);if(this.selected===key)this.selected=null;if(this.focused===key)this.focused=null;
    }
    this.emit('change',this.snapshot());
  }
  tick() {
    let changed = false;
    for (const [id, time] of this.instances) if (this.now() - time > this.staleMs) {
      this.instances.delete(id); changed = true;
      for (const s of this.sessions.values()) if (s.instanceId === id) s.connected = false;
    }
    if (changed) this.emit('change', this.snapshot());
  }
  current() {
    const list = [...this.sessions.values()];
    const pinned = this.selected && this.sessions.get(this.selected);
    const attention = list.filter(s => s.connected && ['approval', 'input'].includes(s.state)).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
    const target = pinned || attention || this.sessions.get(this.focused) || list.at(-1);
    if (!target) return { state: 'idle', key: null, sessionId: null, connected: false, label: '等待 Agent 连接' };
    let state = target.connected ? target.state : 'offline';
    if (state === 'done' && this.now()-target.updatedAt > 1800) state = 'idle';
    return { ...target, state };
  }
  snapshot() { return { current: this.current(), sessions: [...this.sessions.values()].sort((a,b)=>b.updatedAt-a.updatedAt), selected: this.selected, instances: this.instances.size }; }
  restore(snapshot){
    if(!snapshot||!Array.isArray(snapshot.sessions))return;
    for(const session of snapshot.sessions.slice(-this.maxSessions)){
      try{this.accept({...session,state:session.state==='done'?'idle':session.state});if(!session.connected)this.disconnect(session.instanceId);}catch{}
    }
    if(this.sessions.has(snapshot.selected))this.selected=snapshot.selected;
  }
}
