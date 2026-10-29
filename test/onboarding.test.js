import test from 'node:test';
import assert from 'node:assert/strict';
import {onboardingStatus,hasAgentIntegration} from '../src/onboarding-status.js';
import {nodeSupported,startupHelp} from '../src/startup-help.js';

const pet={id:'p',enabled:true,petVisible:true,follow:{mode:'source',source:'codex'}};
const event={key:'i:s',source:'codex',connected:true,state:'working',seq:3};
const snapshot=()=>({pets:[pet],activePetId:'p',sessions:[event],current:{demo:false}});
test('first-connection entry hides for installed agents even while the host is offline',()=>{
 assert.equal(hasAgentIntegration({}),false);
 assert.equal(hasAgentIntegration({current:{demo:true},instances:1}),false);
 for(const source of ['dsh','cursor','codex']){
  assert.equal(hasAgentIntegration({},[{source,state:'installed',enabled:true}]),true);
  for(const state of ['partial','removed','remove-pending'])assert.equal(hasAgentIntegration({},[{source,state,enabled:false}]),false);
  assert.equal(hasAgentIntegration({connections:[{source,channel:'events'}]}),true);
  assert.equal(hasAgentIntegration({sessions:[{source,connected:true,state:'working'}]}),true);
 }
 assert.equal(hasAgentIntegration({sessions:[{source:'dsh',connected:false,state:'offline'}]}),false);
});
test('onboarding requires a new real event and does not accept preview or mere connections',()=>{
 const baseline=new Map([['i:s',3]]),s=snapshot();
 assert.equal(onboardingStatus(s,'codex',baseline).verified,false);
 s.sessions=[{...event,seq:4}];assert.equal(onboardingStatus(s,'codex',baseline).verified,true);
 s.current.demo=true;assert.equal(onboardingStatus(s,'codex',baseline).verified,false);
 s.current.demo=false;s.sessions=[];s.instances=1;assert.equal(onboardingStatus(s,'codex',baseline).verified,false);
});
test('wrong source, idle, disconnects, hidden pets and pinned follow cannot pass setup',()=>{
 for(const patch of [{source:'cursor'},{state:'idle'},{connected:false}]){
  const s=snapshot();s.sessions=[{...event,...patch}];assert.equal(onboardingStatus(s,'codex').verified,false);
 }
 for(const patch of [{petVisible:false},{enabled:false},{follow:{mode:'session',source:'codex'}}]){
  const s=snapshot();s.pets=[{...pet,...patch}];assert.equal(onboardingStatus(s,'codex').verified,false);
 }
 const s=snapshot();s.pets=[];assert.equal(onboardingStatus(s,'codex').verified,false);
});
test('startup guidance covers Node, proxy, permissions, preparation and rollback without exposing error URLs',()=>{
 assert.equal(nodeSupported('22.18.0'),false);assert.equal(nodeSupported('22.19.0'),true);assert.equal(nodeSupported('24.0.0'),true);
 const network=startupHelp(new Error('ECONNREFUSED https://secret:token@example.org'),'C:/pets');
 assert.match(network,/代理/);assert.doesNotMatch(network,/secret|token/);assert.match(network,/doctor/);
 assert.match(startupHelp({code:'EPERM'},'C:/pets'),/写入权限/);
 assert.match(startupHelp(new Error('运行时仍在准备'),'C:/pets'),/另一实例/);
 assert.match(startupHelp(new Error('已恢复上一版桌宠'),'C:/pets'),/确认恢复结果/);
});
