import {hasAgentIntegration} from '../src/onboarding-status.js';
import {navigate} from './navigation.js';

export function initOnboarding({snapshot,integrations}){
 const panel=document.createElement('section');panel.className='onboarding';panel.hidden=true;
 const button=document.createElement('button');button.className='button secondary';button.id='onboardingConnect';button.textContent='让伙伴跟上你的第一次会话';button.onclick=()=>navigate('integrations');panel.append(button);
 document.querySelector('#petView header').after(panel);
 function render(){const state=integrations();panel.hidden=!state||hasAgentIntegration(snapshot(),state.items);}
 return {render};
}
