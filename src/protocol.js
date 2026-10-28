export const PROTOCOL_VERSION = 1;
export const STATES = ['idle', 'thinking', 'working', 'input', 'approval', 'done', 'error', 'sleep', 'interrupted', 'offline'];
export const ANIMATIONS = ['idle', 'thinking', 'working', 'input', 'approval', 'done', 'error', 'sleep'];
export const LABELS = { idle: '空闲', thinking: '处理中', working: '执行工具', input: '等待输入', approval: '等待批准', done: '本轮完成', error: '出错', sleep: '休眠', interrupted: '已中断', offline: '连接断开' };
export function animationFor(state) { return ANIMATIONS.includes(state) ? state : 'idle'; }
export function validateEvent(value) {
  if (!value || typeof value !== 'object' || value.version !== PROTOCOL_VERSION) throw new Error('事件协议版本不兼容');
  for (const field of ['instanceId', 'sessionId']) {
    if (typeof value[field] !== 'string' || !value[field] || value[field].length > 256) throw new Error(`无效的 ${field}`);
  }
  if (!STATES.includes(value.state)) throw new Error('无效的会话状态');
  if(value.source!==undefined&&!['dsh','cursor','codex'].includes(value.source))throw new Error('无效的事件来源');
  if(value.scopeId!==undefined&&(typeof value.scopeId!=='string'||!value.scopeId||value.scopeId.length>256))throw new Error('无效的来源标识');
  if (!Number.isSafeInteger(value.seq) || value.seq < 0) throw new Error('无效的事件序号');
  if (value.turn !== null && (!Number.isSafeInteger(value.turn) || value.turn < 0)) throw new Error('无效的回合编号');
  // Intentionally whitelist metadata: prompts, tool arguments and outputs never cross this boundary.
  return { version: 1, source: value.source??'dsh', scopeId:value.scopeId??value.instanceId, instanceId: value.instanceId, sessionId: value.sessionId, state: value.state, seq: value.seq, turn: value.turn, time: Date.now(), subagent: Boolean(value.subagent) };
}
