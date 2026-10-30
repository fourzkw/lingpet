import {videoVendors,videoVendor} from '../src/creation/video-providers.js';
import {createGenerationAPIForm} from './generation-api-form.js';

export function initGenerationAPISettings(root,{toast}){
 const section=document.createElement('section');section.className='panel generation-api-settings';
 section.innerHTML='<h2>云端生成服务</h2><p class="section-description">配置生图与视频服务。视频可按厂家添加多个 API，保存完整配置后自动加入上方优先级。密钥留空保留原值。</p>';
 const grid=document.createElement('div');grid.className='generation-api-grid';section.append(grid);
 const imageCard=document.createElement('details');imageCard.className='api-service-card';imageCard.innerHTML='<summary>生图 API</summary>';
 const videoCard=document.createElement('details');videoCard.className='api-service-card video-api-card';
 const summary=document.createElement('summary');summary.textContent='生视频 API';videoCard.append(summary);
 const intro=document.createElement('p');intro.className='quiet';intro.textContent='选择厂家添加服务；同一厂家可以使用不同账号、地址或模型。';
 const add=document.createElement('button');add.type='button';add.className='button secondary';add.textContent='添加视频 API';add.disabled=true;
 const list=document.createElement('div');list.className='video-api-list';
 const editor=document.createElement('div');editor.className='video-api-editor';
 const status=document.createElement('p');status.className='quiet';status.setAttribute('role','status');
 videoCard.append(intro,list,add,editor,status);grid.append(imageCard,videoCard);root.append(section);
 let config=null,loading=false,loaded=false;
 function changed(next){config=next;renderList();document.dispatchEvent(new CustomEvent('lingpet:generation-apis-changed',{detail:next}));}
 function edit(value){editor.replaceChildren();const heading=document.createElement('h3');heading.textContent=value?'编辑视频 API':'添加视频 API';
  const form=createGenerationAPIForm({kind:value?.id||'video-api',config:value||{vendor:videoVendors[0].id},video:true,toast,onSaved:next=>{changed(next);editor.replaceChildren();},onCancel:()=>editor.replaceChildren()});
  editor.append(heading,form);if(!videoCard.open)videoCard.open=true;
 }
 function renderList(){
  list.replaceChildren();const entries=config.videoApis||[];summary.textContent='生视频 API'+(entries.length?'（'+entries.length+'）':'');
  if(!entries.length){const empty=document.createElement('p');empty.className='quiet';empty.textContent='尚未添加视频 API，当前可使用 ComfyUI。';list.append(empty);}
  for(const entry of entries){
   const card=document.createElement('div');card.className='video-api-entry';card.dataset.serviceId=entry.id;
   const info=document.createElement('div'),name=document.createElement('strong'),description=document.createElement('p');name.textContent=entry.name;description.className='quiet';description.textContent=(videoVendor(entry.vendor)?.name||entry.vendor)+' · '+entry.model;info.append(name,description);
   const actions=document.createElement('div');actions.className='dialog-actions';
   const editButton=document.createElement('button');editButton.type='button';editButton.className='text-button';editButton.textContent='编辑';editButton.setAttribute('aria-label','编辑 '+entry.name);editButton.onclick=()=>edit(entry);
   const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='删除';remove.setAttribute('aria-label','删除 '+entry.name);let confirming=false;
   remove.onclick=async()=>{if(!confirming){confirming=true;remove.textContent='确认删除';return;}remove.disabled=true;try{const next=await window.pet.system({action:'generation-video-remove',id:entry.id});editor.replaceChildren();changed(next);status.textContent='视频 API 已删除，优先级已同步更新。';}catch(error){status.textContent=error.message;remove.disabled=false;confirming=false;remove.textContent='删除';}};
   actions.append(editButton,remove);card.append(info,actions);list.append(card);
  }
 }
 add.onclick=()=>edit(null);
 async function load(){if(loading||loaded)return;loading=true;try{
  config=await window.pet.system({action:'generation-api-config'});
  const hostInfo=document.createElement('p');hostInfo.className='quiet';hostInfo.textContent='Codex ImageGen 已加入生图优先级，无需配置地址或密钥。由支持 ImageGen 的 Codex 会话调用，生成图片后导入项目；当前宿主不可用时自动跳过。';imageCard.append(hostInfo);
  imageCard.append(createGenerationAPIForm({kind:'image',config:config.image,toast,onSaved:changed}));renderList();loaded=true;add.disabled=false;
 }catch(error){status.textContent=error.message;toast(error.message);}finally{loading=false;}}
 document.addEventListener('lingpet:navigate',event=>{if(event.detail==='app')void load();});if(document.body.dataset.page==='app')void load();
}
