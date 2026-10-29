import {connectionStatus,HOSTS} from './connection-status.js';
export function bindingFor(session){return {mode:'session',source:session.source||'dsh',scopeId:session.scopeId||session.instanceId,sessionId:session.sessionId};}
export function resolveFollow(store,follow={mode:'global'},previousKey=null,{doneMs=1800}={}){
  const all=[...store.sessions.values()],now=store.now();
  let target;
  const missing=(state,label)=>({state,label,connected:false,key:null,sessionId:null});
  if(follow.mode==='session'){
    const matches=all.filter(s=>(s.source||'dsh')===follow.source&&((s.scopeId||s.instanceId)===follow.scopeId||s.instanceId===follow.scopeId)&&s.sessionId===follow.sessionId);
    const live=matches.filter(s=>s.connected&&s.state!=='offline');
    if(live.length>1)return missing('offline','会话身份有歧义，请重新选择');
    target=live[0]||matches.sort((a,b)=>b.updatedAt-a.updatedAt)[0];
    if(!target)return missing('offline','指定会话暂不可用，等待恢复');
  }else{
    const candidates=all.filter(s=>follow.mode!=='source'||(s.source||'dsh')===follow.source);
    const live=candidates.filter(s=>s.connected&&s.state!=='offline');
    const priority=s=>['approval','input'].includes(s.state)?1:0;
    live.sort((a,b)=>priority(b)-priority(a)||b.updatedAt-a.updatedAt||(a.key===previousKey?-1:b.key===previousKey?1:a.key.localeCompare(b.key)));
    target=live[0]||candidates.sort((a,b)=>b.updatedAt-a.updatedAt)[0];
    if(!target){
      const snapshot={connections:[...(store.connections?.values()||[])]};
      const sources=follow.mode==='source'?[follow.source]:Object.keys(HOSTS);
      const connected=sources.map(source=>connectionStatus(snapshot,source)).filter(c=>c.connected);
      return missing('idle',connected.length?connected.map(c=>c.name+'：'+c.label).join('；'):follow.mode==='source'?'等待 '+HOSTS[follow.source]+' 插件连接':'等待插件连接，请查看接入状态');
    }
  }
  let state=target.connected?target.state:'offline';
  if(state==='done'&&now-target.updatedAt>doneMs)state='idle';
  return {...target,state};
}
