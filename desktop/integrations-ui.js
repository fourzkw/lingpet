import {navigate} from './navigation.js';
import {HOSTS,connectionStatus} from '../src/connection-status.js';
import {CODEX_INSTALL_HINT,INSTALLATION_STEPS} from '../src/integrations/guidance.js';

const names={codex:'Codex',cursor:'Cursor',dsh:'DSH'};
const statuses={installed:'已安装',installing:'安装中',partial:'安装未完成',removed:'已卸载', 'remove-pending':'已停用，宿主待清理'};
export function initIntegrationsUI({toast,snapshot,onChange}){
  const nav=document.createElement('button');nav.id='openIntegrations';nav.className='workspace-nav';nav.textContent='Agent 接入';nav.onclick=()=>{navigate('integrations');void refresh();};document.getElementById('openAppSettings').before(nav);
  const view=document.createElement('section');view.id='integrationsView';view.hidden=true;
  view.innerHTML='<header><div><div class="eyebrow">灵伴 / Agent 接入</div><h1>连接你的 Agent</h1><p class="sub">本体统一运行，按需接入不同应用的会话。</p></div><button class="button secondary" id="refreshIntegrations">刷新状态</button></header><p id="integrationHint" role="status"></p><section class="panel"><h2>安装接入插件</h2><form id="integrationForm" class="market-form"><label>应用<select id="integrationSource"><option value="codex">Codex</option><option value="cursor">Cursor</option><option value="dsh">DSH</option></select></label><p id="integrationDetection" class="section-description" hidden></p><details id="integrationAdvanced"><summary>高级选项（多套环境）</summary><label>配置目录<input id="integrationConfig" readonly><button type="button" class="text-button" id="integrationChooseConfig">选择目录</button></label><label id="integrationExecutableRow">宿主命令文件<input id="integrationExecutable" readonly><button type="button" class="text-button" id="integrationChooseExecutable">选择 exe / cmd / bat</button><span class="quiet">如 npm 安装的宿主，请选择安装目录中的 codex.cmd 或 dsh.cmd。</span></label><label id="integrationProfileRow" hidden>DSH profile<input id="integrationProfile" value="web" pattern="[a-zA-Z0-9_-]{1,64}"></label></details><p class="section-description">安装会保留其他插件和 Hooks。宿主要求的启用、信任和重载步骤仍需在宿主中完成。</p><button class="button primary" id="installIntegration">安装接入插件</button></form><ol id="integrationPlan"></ol></section><section class="panel"><h2>已管理的接入</h2><div id="integrationList"></div></section>';
  const connections=document.createElement('section');connections.className='panel';connections.innerHTML='<h2>连接状态</h2><div id="hostConnections" aria-live="polite"></div>';view.querySelector('header').after(connections);
  document.querySelector('main').append(view);const $=id=>document.getElementById(id);let state,busy=false;const hints=new Map();
  const complete=document.createElement('dialog');complete.id='integrationComplete';complete.className='remove-pet-dialog integration-complete';complete.setAttribute('aria-labelledby','integrationCompleteTitle');complete.setAttribute('aria-describedby','integrationCompleteDescription');complete.innerHTML='<h2 id="integrationCompleteTitle"></h2><p id="integrationCompleteDescription">接入插件已安装，请完成以下步骤：</p><ol id="integrationCompleteSteps"></ol><p>完成后可在本页查看连接状态。</p><div class="dialog-actions"><button class="button primary" id="integrationCompleteConfirm" autofocus>我知道了</button></div>';document.body.append(complete);$('integrationCompleteConfirm').onclick=()=>complete.close();
  const nextSteps=item=>item.error||((snapshot().sessions||[]).some(session=>session.scopeId===item.id&&session.connected&&session.state!=='offline')?'':item.state==='installed'&&item.source==='codex'?CODEX_INSTALL_HINT:item.source==='dsh'&&item.state==='installed'?'请重启 DSH，再发送一条消息验证接入。':item.nextSteps)||'';
  function render(){
    for(const item of state?.items||[])if(hints.has(item.id))hints.get(item.id).textContent=nextSteps(item);
    $('hostConnections').replaceChildren(...Object.keys(HOSTS).map(source=>{const status=connectionStatus(snapshot(),source),row=document.createElement('p');row.textContent=status.name+'：'+status.label+(status.hint?'。'+status.hint:'');return row;}));
  }
  const explicitTarget=()=>({source:$('integrationSource').value,config:$('integrationConfig').value,executable:$('integrationExecutable').value,profile:$('integrationProfile').value});
  const target=()=>!$('integrationAdvanced').open?{source:$('integrationSource').value}:explicitTarget();
  function sourceChanged(){
    const source=$('integrationSource').value,found=state?.targets.find(item=>item.source===source),name=names[source];
    $('integrationConfig').value=found?.config||'';$('integrationExecutable').value=found?.executable||'';
    $('integrationExecutableRow').hidden=source==='cursor';$('integrationProfileRow').hidden=source!=='dsh';$('integrationProfile').value='web';
    $('integrationAdvanced').open=false;$('integrationDetection').hidden=false;
    $('integrationDetection').textContent=source==='cursor'?'自动使用 Cursor 默认配置目录，点击安装即可。自定义环境可展开高级选项。':found?.executable?(source==='dsh'?'自动使用本机 DSH 和默认 web 环境，点击安装即可。':'自动使用本机 Codex 和默认配置，点击安装即可。'):'未检测到 '+name+' 命令，请先安装 '+name+' CLI 后重试，或在高级选项中指定命令位置。';
  }

  async function refresh(){
    try{state=await window.pet.integrations({action:'list'});$('integrationHint').textContent=state.desktop?'插件只负责连接，本体负责桌宠和更新。':'当前为源码或旧插件运行方式，请使用独立安装版管理接入。';$('installIntegration').disabled=!state.desktop||busy;
      render();onChange?.();const list=$('integrationList');list.replaceChildren();hints.clear();
      for(const item of state.items){const card=document.createElement('article');card.className='library-card';const title=document.createElement('strong');title.textContent=names[item.source]+' · '+(item.profile&&item.source==='dsh'?item.profile:item.config);const status=document.createElement('p');status.textContent=statuses[item.state]||item.state;const next=document.createElement('p');next.textContent=nextSteps(item);hints.set(item.id,next);const actions=document.createElement('div');actions.className='dialog-actions';
        for(const [label,action]of [['检查','inspect'],[item.updateAvailable?'更新接入':'重新安装接入','install'],['卸载接入','remove']]){const button=document.createElement('button');button.className='button secondary';button.textContent=label;if(action==='install')button.title=item.updateAvailable?'将接入插件从 '+item.version+' 更新到 '+item.availableVersion:'重新安装此 Agent 的灵伴接入插件';button.disabled=busy||!state.desktop;button.onclick=()=>void perform(async()=>{const result=await window.pet.integrations({action,...(action==='install'?{target:item}:{id:item.id})});if(action==='install')showInstallationComplete(item.source);if(action==='inspect')toast(result.registered===false?'宿主注册已变化，请重新安装接入':result.filesReady?'接入文件存在，请按提示完成宿主步骤':'接入文件缺失，请重新安装接入');});actions.append(button);}card.append(title,status,next,actions);list.append(card);}
      if(!state.items.length)list.textContent='还没有接入插件。选择应用后安装即可。';
    }catch(error){$('integrationHint').textContent=error.message;}
  }
  async function perform(operation){if(busy)return;busy=true;view.setAttribute('aria-busy','true');for(const button of view.querySelectorAll('button'))button.disabled=true;try{await operation();}catch(error){toast(error.message);$('integrationHint').textContent=error.message;}finally{busy=false;view.removeAttribute('aria-busy');for(const button of view.querySelectorAll('button'))button.disabled=false;await refresh();}}
  $('integrationSource').onchange=sourceChanged;
  for(const kind of ['Config','Executable'])$('integrationChoose'+kind).onclick=async()=>{try{const result=await window.pet.integrations({action:'choose',kind:kind.toLowerCase()});if(result.path)$('integration'+kind).value=result.path;}catch(error){toast(error.message);}};
  $('integrationForm').onsubmit=event=>{event.preventDefault();void perform(async()=>{const value=target(),plan=await window.pet.integrations({action:'plan',target:value});$('integrationPlan').replaceChildren(...plan.steps.map(text=>{const row=document.createElement('li');row.textContent=text;return row;}));await window.pet.integrations({action:'install',target:value});showInstallationComplete(value.source);});};
  $('refreshIntegrations').onclick=()=>void refresh();
  document.addEventListener('lingpet:navigate',event=>{if(event.detail==='integrations')void refresh();});
  void refresh().then(sourceChanged);
  return {render,getState:()=>state};
}

export function showInstallationComplete(source){
  const dialog=document.getElementById('integrationComplete');
  document.getElementById('integrationCompleteTitle').textContent=HOSTS[source]+' 接入安装完成';
  document.getElementById('integrationCompleteSteps').replaceChildren(...(INSTALLATION_STEPS[source]||[]).map(text=>{const step=document.createElement('li');step.textContent=text;return step;}));
  if(!dialog.open)dialog.showModal();
}
