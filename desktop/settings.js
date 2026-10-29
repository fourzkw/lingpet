import {applyTheme} from './theme.js';
import './workbench-motion.js';
import {initMarketUI} from './market-ui.js';
import {syncCustomAppearances} from './custom-appearances.js';
import {paint,frameLoop,ORDER} from './renderer.js';
import {readyPixelAssets} from './pixel-pet.js';
import {CHARACTERS,VARIANTS,characterInfo,appearanceInfo,appearanceLabel} from '../src/characters.js';
import {PET_SCALES,scaleStep,scaleLabel,petIsVisible,visibilityPatch} from '../src/pet-display.js';
import {initSettingsExtras} from './settings-extras.js';
import {initOnboarding} from './onboarding.js';
import {initIntegrationsUI} from './integrations-ui.js';
await readyPixelAssets();
let data=await window.pet.get(),start=performance.now()-Math.max(0,Date.now()-(data.animationStartedAt??Date.now())),previous=data.animationKey,toastTimer,petListSignature='',pendingSessionSelection=false,pendingRemovalId=null;
applyTheme(data.global?.theme);
syncCustomAppearances(data.customAppearances,data.customCharacters,data.bundledAssets);
const $=id=>document.getElementById(id);
let scaleEditing=false;
function renderScale(step){
  const scale=PET_SCALES[step];$('scale').value=String(step);$('scaleValue').value=scaleLabel(scale);
  $('scale').setAttribute('aria-valuetext',`第 ${step+1} 档，共 9 档，${scaleLabel(scale)}`);
  for(const tick of document.querySelectorAll('.scale-ticks span'))tick.classList.toggle('selected',Number(tick.dataset.step)===step);
}
let marketUI,extras,onboarding;
const integrationsUI=initIntegrationsUI({toast,snapshot:()=>data,onChange:()=>onboarding?.render()});
const characterGrid=document.querySelector('.character-grid');characterGrid.replaceChildren();
function renderCharacters(){characterGrid.replaceChildren();
for(const character of CHARACTERS){
  const button=document.createElement('button');button.className='character-card';button.dataset.character=character.id;button.dataset.requiresPet='';button.onclick=()=>character.appearances.length?change({character:character.id}):toast('请通过创作工具导入完整形象，角色 ID：'+character.id);
  const title=document.createElement('div');title.className='character-title';title.textContent=character.name;const check=document.createElement('span');check.className='check';check.textContent='✓';title.append(check);
  const description=document.createElement('p');description.textContent=character.appearances.length?(character.appearances.some(a=>a.asset==='claude')?'默认内置':'已安装')+' · '+character.appearances.length+' 个形象':'待创作 · '+character.id;button.append(title,description);characterGrid.append(button);
}
}
renderCharacters();
characterGrid.closest('.panel').querySelector('h2').textContent='选择角色';
const appearanceSection=document.createElement('section');appearanceSection.className='appearance-section';
appearanceSection.innerHTML='<div class="panel-heading"><h3>选择形象</h3><span id="appearanceCount" class="quiet"></span></div><div id="appearanceGrid" class="appearance-grid"></div><div class="variant-row"><span>显示版本</span><div id="variantChoices" class="variant-choices" role="group" aria-label="显示版本"></div></div><p id="variantHint" class="variant-hint"></p>';
characterGrid.after(appearanceSection);let renderedCharacter;
for(const variant of VARIANTS){const button=document.createElement('button');button.dataset.variant=variant.id;button.textContent=variant.name;button.onclick=()=>change({variant:variant.id});$('variantChoices').append(button);}
function renderAppearances(settings){
  const character=characterInfo(settings.character),skin=appearanceInfo(settings);
  if(renderedCharacter!==character.id){
    renderedCharacter=character.id;$('appearanceGrid').replaceChildren();$('appearanceCount').textContent=character.appearances.length+' 个已保留';
    for(const item of character.appearances){
      const button=document.createElement('button');button.className='appearance-card';button.dataset.appearance=item.id;button.dataset.requiresPet='';
      const art=document.createElement('canvas');art.width=art.height=192;art.dataset.appearancePreview=item.id;
      const title=document.createElement('strong');title.textContent=item.name;const formats=document.createElement('small');formats.textContent=item.variants.map(id=>VARIANTS.find(v=>v.id===id).name).join(' / ');
      button.append(art,title,formats);button.onclick=()=>change({appearance:item.id});$('appearanceGrid').append(button);
    }
  }
  for(const button of $('appearanceGrid').children){const active=button.dataset.appearance===skin.id;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));}
  for(const button of $('variantChoices').children){const available=skin.variants.includes(button.dataset.variant),active=(settings.variant??'pixel')===button.dataset.variant;button.disabled=!data.activePetId||!available;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));button.title=available?'':'此形象尚无该版本素材';}
  $('variantHint').textContent=skin.variants.length===1?(skin.variants[0]==='original'?'此形象目前仅提供原图版。':'此形象目前仅提供像素版。'):settings.variant==='original'?'保留原始素材的细节、颜色和透明边缘。':'使用统一色板与像素边缘；切换版本保留当前形象。';
}
const sourceName=source=>source==='codex'?'Codex':source==='cursor'?'Cursor':'DSH';
const followLabel=follow=>follow?.mode==='source'?sourceName(follow.source)+' 自动跟随':follow?.mode==='session'?sourceName(follow.source)+' · 指定会话':'全局自动跟随';
function renderPetList(value){
  const list=$('petList');list.replaceChildren();$('petCount').textContent=String((value.pets||[]).length);
  if(!value.pets?.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='还没有桌宠，点击下方新增。';list.append(empty);return;}
  for(const pet of value.pets){
    const row=document.createElement('div');row.className='pet-list-row';row.dataset.petId=pet.id;
    const select=document.createElement('button');select.className='pet-list-select';select.dataset.selectPet=pet.id;
    const icon=document.createElement('canvas');icon.width=96;icon.height=96;icon.dataset.petCharacter=pet.character;icon.dataset.petAppearance=pet.appearance;icon.dataset.petVariant=pet.variant;icon.setAttribute('aria-hidden','true');
    const text=document.createElement('span'),name=document.createElement('strong'),status=document.createElement('small');
    name.textContent=pet.name;status.textContent=appearanceInfo(pet).name+' · '+(pet.variant==='original'?'原图':'像素')+' · '+(petIsVisible(pet)?'显示中':'已隐藏');
    text.append(name,status);select.title=pet.name+' · '+appearanceLabel(pet)+' · '+followLabel(pet.follow);select.append(icon,text);select.onclick=()=>manage('select',pet.id);
    const remove=document.createElement('button');remove.className='pet-list-remove';remove.textContent='删除';remove.setAttribute('aria-label','删除桌宠 '+pet.name);remove.title='删除桌宠 '+pet.name;remove.dataset.removePet=pet.id;remove.onclick=()=>requestRemove(pet.id);
    row.append(select,remove);list.append(row);
  }
}
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),text==='已保存'?1600:4000);}
async function change(patch){try{update(await window.pet.settings(patch));toast('已保存');}catch(error){toast(error.message);}}
function setTab(name){
  for(const tab of ['appearance','interaction','follow']){const active=tab===name;$(tab+'Tab').setAttribute('aria-selected',String(active));$(tab+'Tab').tabIndex=active?0:-1;$(tab+'Panel').hidden=!active;}
}
for(const name of ['appearance','interaction','follow']){
  $(name+'Tab').onclick=()=>setTab(name);
  $(name+'Tab').onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=['appearance','interaction','follow'];const next=tabs[event.key==='Home'?0:event.key==='End'?2:(tabs.indexOf(name)+(event.key==='ArrowLeft'?2:1))%3];setTab(next);$(next+'Tab').focus();};
}
function update(value){
  applyTheme(value.global?.theme);
  if(syncCustomAppearances(value.customAppearances,value.customCharacters,value.bundledAssets)){
    renderedCharacter=undefined;
    renderCharacters();
  }
  const key=value.animationKey;
  if(key!==previous){start=performance.now()-Math.max(0,Date.now()-(value.animationStartedAt??Date.now()));previous=key;}
  const changedPet=data.activePetId!==value.activePetId;if(changedPet){pendingSessionSelection=false;document.querySelector('.pet-more').open=false;}
  data={...data,...value};
  const signature=JSON.stringify((value.pets||[]).map(p=>[p.id,p.name,p.character,p.appearance,p.variant,p.enabled,p.petVisible,p.follow]));
  if(signature!==petListSignature){renderPetList(value);petListSignature=signature;}
  for(const row of $('petList').children){const selected=row.dataset.petId===value.activePetId;row.classList.toggle('selected',selected);row.querySelector('[data-select-pet]')?.setAttribute('aria-pressed',String(selected));}
  $('petWorkspace').hidden=!value.activePetId;$('noPet').hidden=Boolean(value.activePetId);
  if(changedPet||document.activeElement!==$('petName'))$('petName').value=value.settings.name||'';
  const follow=value.settings.follow||{mode:'global'};
  if(!pendingSessionSelection)$('followMode').value=follow.mode==='source'?follow.source:follow.mode;
  $('followDescription').textContent=pendingSessionSelection?'尚未绑定：请在下方选择一个会话，或切回自动跟随。':follow.mode==='session'?'已固定：'+sourceName(follow.source)+' · '+follow.sessionId:follow.mode==='source'?'仅响应 '+sourceName(follow.source)+' 的会话状态。':'自动响应所有来源的会话，优先提示需要你处理的状态。';
  for(const element of document.querySelectorAll('[data-requires-pet]'))element.disabled=!value.activePetId;
  extras?.render();
  onboarding?.render();
  integrationsUI.render();
  renderAppearances(value.settings);
  $('connection').classList.toggle('connected',value.instances>0);
  const sources=[...new Set(value.sessions.filter(s=>s.connected&&s.state!=='offline').map(s=>sourceName(s.source)))];
  $('connection').querySelector('span').textContent=value.instances>0?`${sources.join(' / ')||'Agent'} 已连接 · ${value.instances}`:'等待 Agent';
  $('currentState').dataset.state=value.current.state;
  $('currentState').textContent=(value.current.demo?'演示 · ':'')+value.labels[value.current.state];
  $('currentSource').textContent=value.current.demo?'动作试映，不影响真实会话':value.current.sessionId?`${sourceName(value.current.source)} · 会话 ${value.current.sessionId.slice(0,18)}${value.current.connected?'':' · 连接已断开'}`:'启用 DSH、Cursor 或 Codex 插件后自动同步状态';
  const skin=appearanceInfo(value.settings);$('previewKind').textContent=skin.name+' / '+(value.settings.variant==='original'?'原图':'PIXEL '+skin.pixelSize);
  $('demoHint').textContent='临时切换桌宠动作 · 不操作 Agent';
  for(const button of document.querySelectorAll('[data-character]')){const selected=button.dataset.character===value.settings.character;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));}
  $('showPet').textContent=petIsVisible(value.settings)?'隐藏桌宠':'显示桌宠';
  $('previewNote').textContent=petIsVisible(value.settings)?'桌宠已显示，设置自动保存':'桌宠已隐藏，仍保留配置与会话跟随';
  $('backLive').hidden=!value.current.demo;
  document.querySelector('.session-panel').hidden=follow.mode!=='session'&&!pendingSessionSelection;
  if(changedPet||!scaleEditing)renderScale(scaleStep(value.settings.scale));
  $('alwaysOnTop').checked=value.settings.alwaysOnTop;$('showLabel').checked=value.settings.showLabel;
  for(const button of document.querySelectorAll('[data-demo]'))button.classList.toggle('active',Boolean(value.current.demo)&&button.dataset.demo===value.current.state);
  const sessions=$('sessions');
  if(!value.sessions.length){sessions.innerHTML='<div class="empty">尚未收到 Agent 状态<br><span>支持 DSH / Cursor / Codex，插件启用后自动连接。</span></div>';return;}
  sessions.replaceChildren();
  const filtered=value.sessions.filter(s=>!$('sourceFilter').value||s.source===$('sourceFilter').value||!s.source&&$('sourceFilter').value==='dsh');
  if(!filtered.length){
    const empty=document.createElement('div');empty.className='empty';empty.textContent='尚未收到 '+(sourceName($('sourceFilter').value))+' 会话事件。请检查接入状态，并在对应 Agent 中开始新一轮对话。';sessions.append(empty);return;
  }
  filtered.forEach((session,index)=>{
    const button=document.createElement('button');button.className='session'+(value.selected===session.key?' selected':'');
    const description=document.createElement('div'),name=document.createElement('span'),small=document.createElement('small'),status=document.createElement('span');
    name.textContent=`${sourceName(session.source)} · ${session.subagent?'子 Agent':'会话'} ${index+1}`;small.textContent=session.sessionId.slice(0,24);description.append(name,small);
    status.className='session-state';status.textContent=session.connected?value.labels[session.state]:'已断开';button.append(description,status);
    button.setAttribute('aria-pressed',String(value.selected===session.key));button.disabled=!value.activePetId;
    button.onclick=async()=>{try{const next=await window.pet.select(session.key);pendingSessionSelection=false;update(next);toast('已固定跟随此会话');}catch(error){toast(error.message);}};sessions.append(button);
  });
}
window.pet.onUpdate(update);update(data);
$('sourceFilter').onchange=()=>update(data);
async function manage(action,id,value){try{update(await window.pet.manage({action,id,value}));if(['select','create','duplicate'].includes(action))marketUI?.showPets();}catch(error){toast(error.message);}}
document.addEventListener('pointerdown',event=>{const more=document.querySelector('.pet-more');if(!more.contains(event.target))more.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const more=document.querySelector('.pet-more');if(more.open){more.open=false;more.querySelector('summary').focus();}}});
$('addPetFromList').onclick=()=>manage('create',null,{name:'新桌宠',character:data.settings.character||'claude',appearance:data.settings.appearance,variant:data.settings.variant});
$('duplicatePet').onclick=()=>manage('duplicate',data.activePetId);
function requestRemove(id){
  const pet=data.pets.find(p=>p.id===id);if(!pet)return;
  pendingRemovalId=id;document.querySelector('.pet-more').open=false;
  $('removePetMessage').textContent='删除「'+pet.name+'」？这会移除该桌宠实例，保留角色素材和其他桌宠。';
  $('removePetDialog').showModal();
}
$('removePet').onclick=()=>requestRemove(data.activePetId);
$('cancelRemovePet').onclick=()=>$('removePetDialog').close();
$('removePetDialog').onclose=()=>{pendingRemovalId=null;};
$('confirmRemovePet').onclick=async()=>{
  const id=pendingRemovalId;if(!id)return;
  $('confirmRemovePet').disabled=true;
  try{const next=await window.pet.manage({action:'remove',id});$('removePetDialog').close();update(next);toast('桌宠已删除');}
  catch(error){toast(error.message);}
  finally{$('confirmRemovePet').disabled=false;}
};
$('petName').onchange=()=>change({name:$('petName').value});
$('followMode').onchange=()=>{
  const mode=$('followMode').value;
  pendingSessionSelection=mode==='session';
  if(mode==='session'){toast('点击下方会话，固定当前桌宠跟随该会话。');update(data);return;}
  void change({follow:mode==='global'?{mode:'global'}:{mode:'source',source:mode}});
};
for(const button of document.querySelectorAll('[data-character]'))button.onclick=()=>change({character:button.dataset.character});
$('scale').oninput=()=>{scaleEditing=true;renderScale(Number($('scale').value));};
$('scale').onchange=async()=>{const scale=PET_SCALES[Number($('scale').value)];await change({scale});scaleEditing=false;renderScale(scaleStep(data.settings.scale));};
$('scale').onblur=()=>{scaleEditing=false;renderScale(scaleStep(data.settings.scale));};
$('alwaysOnTop').onchange=()=>change({alwaysOnTop:$('alwaysOnTop').checked});$('showLabel').onchange=()=>change({showLabel:$('showLabel').checked});
async function run(action){try{update(await action());}catch(error){toast(error.message);}}
$('showPet').onclick=()=>change(visibilityPatch(!petIsVisible(data.settings)));
$('autoFollow').onclick=async()=>{try{const next=await window.pet.select(null);pendingSessionSelection=false;update(next);toast('已恢复自动跟随');}catch(error){toast(error.message);}};
$('backLive').onclick=()=>run(()=>window.pet.demo(null));
for(const state of ORDER){const button=document.createElement('button');button.dataset.demo=state;button.dataset.requiresPet='';button.disabled=!data.activePetId;button.textContent=data.labels[state];button.onclick=()=>run(()=>window.pet.demo(state));$('demoGrid').append(button);}
frameLoop(now=>{
  paint($('preview').getContext('2d'),data,now-start,420,420);
  for(const canvas of document.querySelectorAll('[data-appearance-preview]')){const skin=characterInfo(data.settings.character).appearances.find(item=>item.id===canvas.dataset.appearancePreview);paint(canvas.getContext('2d'),{...data,settings:{...data.settings,appearance:skin.id,variant:skin.variants.includes(data.settings.variant)?data.settings.variant:'pixel'},current:{state:'idle'}},now,192,192);}
  for(const canvas of document.querySelectorAll('[data-pet-character]'))paint(canvas.getContext('2d'),{...data,settings:{...data.settings,character:canvas.dataset.petCharacter,appearance:canvas.dataset.petAppearance,variant:canvas.dataset.petVariant},current:{state:'idle'}},now,96,96);
});

marketUI=initMarketUI({snapshot:()=>data,update,toast});
extras=initSettingsExtras({snapshot:()=>data,change,toast});onboarding=initOnboarding({snapshot:()=>data,integrations:()=>integrationsUI.getState()});document.addEventListener('lingpet:theme',event=>update(event.detail));update(data);
