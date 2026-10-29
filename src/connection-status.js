import {CODEX_INSTALL_HINT} from './integrations/guidance.js';
export const HOSTS={dsh:'DSH',cursor:'Cursor',codex:'Codex'};

// Transport registration and real session events are separate evidence.
export function connectionStatus(snapshot={},source){
 const channels=(snapshot.connections||[]).filter(c=>c.source===source);
 const sessions=(snapshot.sessions||[]).filter(s=>s.source===source&&s.connected&&s.state!=='offline');
 const events=channels.some(c=>c.channel==='events');
 const connected=channels.length>0;
 const state=sessions.length?'active':events?'waiting':connected?'management':'disconnected';
 const label={active:'已连接，已收到会话事件',waiting:'事件桥接已连接，等待会话事件',management:'管理通道已连接，等待 Hooks 事件',disconnected:'未连接'}[state];
 const hint=state==='management'||state==='disconnected'?{codex:CODEX_INSTALL_HINT,cursor:'请确认扩展已启用，重新加载窗口后新建 Agent 会话并发送消息。',dsh:'请确认插件已启用且 profile 与当前 DSH 一致，重启 DSH 后发送消息。'}[source]:'';
 return {source,name:HOSTS[source],connected,events,sessions:sessions.length,state,label,hint};
}
