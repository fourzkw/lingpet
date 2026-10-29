import {HOSTS} from './connection-status.js';

export function hasAgentIntegration(snapshot={},items=[]){
 return items.some(item=>HOSTS[item.source]&&item.state==='installed'&&item.enabled!==false)
  ||(snapshot.connections||[]).some(item=>HOSTS[item.source])
  ||(snapshot.sessions||[]).some(item=>HOSTS[item.source]&&item.connected&&item.state!=='offline');
}

// Only a new, connected host event can verify live integration. Preview state is never evidence.
export function onboardingStatus(snapshot,source,baseline=new Map()){
 const pet=snapshot.pets?.find(p=>p.id===snapshot.activePetId);
 const follow=pet?.follow||snapshot.settings?.follow||{mode:'global'};
 const automatic=follow.mode==='global'||follow.mode==='source'&&follow.source===source;
 const sessions=(snapshot.sessions||[]).filter(s=>s.source===source&&s.connected);
 const event=sessions.find(s=>['thinking','working','input','approval','done','error'].includes(s.state)&&(!baseline.has(s.key)||s.seq>baseline.get(s.key)));
 const visible=Boolean(pet&&pet.enabled!==false&&pet.petVisible!==false);
 return {visible,automatic,connected:sessions.length>0,verified:Boolean(visible&&automatic&&!snapshot.current?.demo&&event),event};
}
