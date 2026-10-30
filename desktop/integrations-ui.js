import {navigate} from './navigation.js';
import {HOSTS,connectionStatus} from '../src/connection-status.js';
import {CODEX_INSTALL_HINT,INSTALLATION_STEPS} from '../src/integrations/guidance.js';

const names={codex:'Codex',cursor:'Cursor',dsh:'DSH'};
const statuses={installed:'已安装',installing:'安装中',partial:'安装未完成',removed:'已卸载', 'remove-pending':'已停用，宿主待清理'};
export function initIntegrationsUI({toast,snapshot,onChange}){
  const nav=document.createElement('button');nav.id='openIntegrations';nav.className='workspace-nav';nav.textContent='Agent 接入';nav.onclick=()=>{navigate('integrations');void refresh();};document.getElementById('openAppSettings').before(nav);
  const view=document.createElement('section');view.id='integrationsView';view.hidden=true;
  view.innerHTML=`
    <header class="integrations-heading"><div><div class="eyebrow">灵伴 / Agent 接入</div><h1>连接你的 Agent</h1><p class="sub">选择你使用的应用，让伙伴跟随会话状态。</p></div><button class="button secondary" id="refreshIntegrations">刷新状态</button></header>
    <p id="integrationHint" class="integration-notice" role="status"></p>
    <section class="integration-connections" aria-labelledby="connectionsTitle"><div class="integration-section-heading"><h2 id="connectionsTitle">连接概览</h2><span>收到真实会话消息后更新状态</span></div><div id="hostConnections" aria-live="polite"></div></section>
    <div class="integrations-workspace">
      <section class="panel integration-install" aria-labelledby="integrationInstallTitle"><div class="integration-section-heading"><h2 id="integrationInstallTitle">添加接入</h2><span>选择应用</span></div><p class="section-description">接入插件由灵伴统一安装和管理。</p>
        <form id="integrationForm" class="market-form">
          <label class="integration-source-field" for="integrationSource">选择应用<select id="integrationSource"><option value="codex">Codex</option><option value="cursor">Cursor</option><option value="dsh">DSH</option></select></label>
          <p id="integrationDetection" class="integration-detection" hidden></p>
          <details id="integrationAdvanced"><summary>高级选项<span>自定义目录与多套环境</span></summary><div class="integration-advanced-fields">
            <div class="integration-field"><label for="integrationConfig">配置目录</label><div class="integration-input-row"><input id="integrationConfig" readonly><button type="button" class="button secondary" id="integrationChooseConfig">选择目录</button></div></div>
            <div class="integration-field" id="integrationExecutableRow"><label for="integrationExecutable">宿主命令文件</label><div class="integration-input-row"><input id="integrationExecutable" readonly><button type="button" class="button secondary" id="integrationChooseExecutable">选择文件</button></div><span class="quiet">npm 安装的宿主可选择 codex.cmd 或 dsh.cmd，也支持 exe / bat。</span></div>
            <div class="integration-field" id="integrationProfileRow" hidden><label for="integrationProfile">DSH profile</label><input id="integrationProfile" value="web" pattern="(?:[a-zA-Z0-9_]|-){1,64}"></div>
          </div></details>
          <div class="integration-install-footer"><button class="button primary" id="installIntegration">安装接入插件</button><p class="section-description">安装后，按提示在对应应用中完成启用、信任或重载。</p></div>
        </form>
        <details id="integrationPlanSection" class="integration-plan" hidden><summary>本次安装步骤</summary><ol id="integrationPlan"></ol></details>
      </section>
      <section class="panel integration-managed" aria-labelledby="integrationManagedTitle"><div class="integration-section-heading"><h2 id="integrationManagedTitle">已管理的接入</h2><span id="integrationManagedCount">0 个接入</span></div><p class="section-description">检查接入状态，或更新已有配置。</p><div id="integrationList"></div></section>
    </div>`;
  document.querySelector('main').append(view);const $=id=>document.getElementById(id);let state,busy=false;const hints=new Map();
  const complete=document.createElement('dialog');complete.id='integrationComplete';complete.className='remove-pet-dialog integration-complete';complete.setAttribute('aria-labelledby','integrationCompleteTitle');complete.setAttribute('aria-describedby','integrationCompleteDescription');complete.innerHTML='<h2 id="integrationCompleteTitle"></h2><p id="integrationCompleteDescription">接入插件已安装，请完成以下步骤：</p><ol id="integrationCompleteSteps"></ol><p>完成后可在本页查看连接状态。</p><div class="dialog-actions"><button class="button primary" id="integrationCompleteConfirm" autofocus>我知道了</button></div>';document.body.append(complete);$('integrationCompleteConfirm').onclick=()=>complete.close();
  const nextSteps=item=>item.error||((snapshot().sessions||[]).some(session=>session.scopeId===item.id&&session.connected&&session.state!=='offline')?'':item.state==='installed'&&item.source==='codex'?CODEX_INSTALL_HINT:item.source==='dsh'&&item.state==='installed'?'请重启 DSH，再发送一条消息验证接入。':item.nextSteps)||'';
  function render(){
    const openGuides=new Set([...$('hostConnections').querySelectorAll('details[open]')].map(node=>node.closest('[data-source]')?.dataset.source));
    for(const item of state?.items||[])if(hints.has(item.id))hints.get(item.id).textContent=nextSteps(item);
    $('hostConnections').replaceChildren(...Object.keys(names).map(source=>{const status=connectionStatus(snapshot(),source),row=document.createElement('article');row.className='integration-connection-card';row.dataset.state=status.state;row.dataset.source=source;const heading=document.createElement('div');heading.className='integration-connection-heading';const name=document.createElement('strong');name.textContent=status.name;const dot=document.createElement('span');dot.className='integration-connection-dot';dot.setAttribute('aria-hidden','true');heading.append(name,dot);const label=document.createElement('p');label.className='integration-connection-label';label.textContent=status.label;row.append(heading,label);if(status.hint){const guidance=document.createElement('details'),summary=document.createElement('summary'),hint=document.createElement('p');guidance.open=openGuides.has(source);summary.textContent='查看连接指引';hint.textContent=status.hint;guidance.append(summary,hint);row.append(guidance);}return row;}));
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
    try{state=await window.pet.integrations({action:'list'});$('integrationHint').textContent=state.desktop?'':'当前为源码或旧插件运行方式，请使用独立安装版管理接入。';$('installIntegration').disabled=!state.desktop||busy;
      render();onChange?.();const list=$('integrationList');list.replaceChildren();hints.clear();
      $('integrationManagedCount').textContent=state.items.length+' 个接入';
      for(const item of state.items){const card=document.createElement('article');card.className='integration-managed-card';const heading=document.createElement('div');heading.className='integration-item-heading';const title=document.createElement('strong');title.textContent=names[item.source]+(item.profile&&item.source==='dsh'?' · '+item.profile:'');const status=document.createElement('span');status.className='integration-state';status.dataset.state=item.state;status.textContent=statuses[item.state]||item.state;heading.append(title,status);const config=document.createElement('p');config.className='integration-config-path';config.textContent=item.config;config.title=item.config||'';const next=document.createElement('p');next.className='integration-next-step';next.textContent=nextSteps(item);hints.set(item.id,next);const actions=document.createElement('div');actions.className='dialog-actions';
        for(const [label,action]of [['检查','inspect'],[item.updateAvailable?'更新接入':'重新安装接入','install'],['卸载接入','remove']]){const button=document.createElement('button');button.className='button secondary'+(action==='remove'?' integration-remove':'');button.textContent=label;if(action==='install')button.title=item.updateAvailable?'将接入插件从 '+item.version+' 更新到 '+item.availableVersion:'重新安装此 Agent 的灵伴接入插件';button.disabled=busy||!state.desktop;button.onclick=()=>void perform(async()=>{const result=await window.pet.integrations({action,...(action==='install'?{target:item}:{id:item.id})});if(action==='install')showInstallationComplete(item.source);if(action==='inspect')toast(result.registered===false?'宿主注册已变化，请重新安装接入':result.filesReady?'接入文件存在，请按提示完成宿主步骤':'接入文件缺失，请重新安装接入');});actions.append(button);}card.append(heading,config,next,actions);list.append(card);}
      if(!state.items.length){const empty=document.createElement('div');empty.className='integration-empty';const title=document.createElement('strong'),hint=document.createElement('p');title.textContent='还没有已管理的接入';hint.textContent='选择你使用的应用并安装，完成后会显示在这里。';empty.append(title,hint);list.append(empty);}
    }catch(error){$('integrationHint').textContent=error.message;}
  }
  async function perform(operation){if(busy)return;busy=true;view.setAttribute('aria-busy','true');for(const button of view.querySelectorAll('button'))button.disabled=true;try{await operation();}catch(error){toast(error.message);$('integrationHint').textContent=error.message;}finally{busy=false;view.removeAttribute('aria-busy');for(const button of view.querySelectorAll('button'))button.disabled=false;await refresh();}}
  $('integrationSource').onchange=sourceChanged;
  for(const kind of ['Config','Executable'])$('integrationChoose'+kind).onclick=async()=>{try{const result=await window.pet.integrations({action:'choose',kind:kind.toLowerCase()});if(result.path)$('integration'+kind).value=result.path;}catch(error){toast(error.message);}};
  $('integrationForm').onsubmit=event=>{event.preventDefault();void perform(async()=>{const value=target(),plan=await window.pet.integrations({action:'plan',target:value});$('integrationPlan').replaceChildren(...plan.steps.map(text=>{const row=document.createElement('li');row.textContent=text;return row;}));$('integrationPlanSection').hidden=false;await window.pet.integrations({action:'install',target:value});showInstallationComplete(value.source);});};
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
