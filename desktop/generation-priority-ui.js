export function movePriority(rows,id,targetId,after=false){
 const next=rows.map(row=>({...row})),from=next.findIndex(row=>row.id===id);if(from<0||id===targetId)return next;
 const [row]=next.splice(from,1),target=next.findIndex(row=>row.id===targetId);if(target<0)return rows.map(row=>({...row}));next.splice(target+(after?1:0),0,row);return next;
}

export function initGenerationPriority(root,{toast}){
 const section=document.createElement('section');section.className='panel generation-priority';section.innerHTML='<h2>生成服务优先级</h2><p class="section-description">拖动手柄调整顺序，自动保存。AI 从上到下选择已启用且已配置的服务；提交后不会自动切换服务重提。聚焦手柄后也可按 ↑ ↓ 调整。</p>';
 const grid=document.createElement('div');grid.className='generation-api-grid';section.append(grid);const status=document.createElement('p');status.className='quiet';status.setAttribute('role','status');section.append(status);root.append(section);
 let priorities=null,labels={api:'生图 API',imagegen:'Codex ImageGen',comfyui:'ComfyUI'},loading=false,saving=false,dragged=null,refreshPending=false;
 function clearDrag(){dragged=null;for(const item of grid.querySelectorAll('li'))item.classList.remove('dragging','drop-before','drop-after');}
 async function save(next,focus){if(saving)return;const previous=priorities;saving=true;priorities=next;render();
  try{priorities=await window.pet.system({action:'generation-preferences-save',priorities:next});status.textContent='优先级已保存，后续生成任务生效。';}
  catch(error){priorities=previous;refreshPending=true;status.textContent=error.message;toast(error.message);}
  finally{saving=false;render();if(focus)grid.querySelector('[data-drag-id="'+focus+'"]')?.focus();if(refreshPending){refreshPending=false;void load(true);}}
 }
 function render(){grid.replaceChildren();if(!priorities)return;
  for(const [kind,title]of [['image','生图'],['video','生视频']]){
   const group=document.createElement('div'),heading=document.createElement('h3');heading.textContent=title;group.append(heading);
   const list=document.createElement('ol');list.className='generation-priority-list';list.dataset.kind=kind;
   for(const [index,row]of priorities[kind].entries()){
    const label=labels[row.id]||row.id,item=document.createElement('li');item.dataset.providerId=row.id;
    const handle=document.createElement('button');handle.type='button';handle.className='generation-drag-handle';handle.textContent='⠿';handle.draggable=!saving;handle.disabled=saving;handle.dataset.dragId=row.id;handle.setAttribute('aria-label','拖动 '+label+' 调整'+title+'优先级');handle.title='拖动排序，或按 ↑ ↓ 调整';
    handle.ondragstart=event=>{if(saving){event.preventDefault();return;}dragged={kind,id:row.id};event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',row.id);item.classList.add('dragging');};handle.ondragend=clearDrag;
    handle.onkeydown=event=>{if(!['ArrowUp','ArrowDown'].includes(event.key)||saving)return;event.preventDefault();const target=index+(event.key==='ArrowUp'?-1:1);if(target<0||target>=priorities[kind].length)return;const next=structuredClone(priorities);[next[kind][index],next[kind][target]]=[next[kind][target],next[kind][index]];void save(next,row.id);};
    item.ondragover=event=>{if(!dragged||dragged.kind!==kind||saving)return;event.preventDefault();event.dataTransfer.dropEffect='move';for(const sibling of list.children)sibling.classList.remove('drop-before','drop-after');if(dragged.id!==row.id)item.classList.add(event.clientY>item.getBoundingClientRect().top+item.offsetHeight/2?'drop-after':'drop-before');};
    item.ondrop=event=>{if(!dragged||dragged.kind!==kind||saving)return;event.preventDefault();const source=dragged.id,after=event.clientY>item.getBoundingClientRect().top+item.offsetHeight/2;clearDrag();const next=structuredClone(priorities);next[kind]=movePriority(next[kind],source,row.id,after);if(next[kind].some((value,i)=>value.id!==priorities[kind][i].id))void save(next,source);};
    const name=document.createElement('label'),enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=row.enabled;enabled.disabled=saving;enabled.setAttribute('aria-label','启用'+title+' '+label);name.append(enabled,document.createTextNode(label));
    enabled.onchange=()=>{const next=structuredClone(priorities);next[kind][index].enabled=enabled.checked;void save(next);};item.append(handle,name);list.append(item);
   }group.append(list);grid.append(group);
  }
 }
 async function load(force=false){if(saving||loading){if(force)refreshPending=true;return;}if(priorities&&!force)return;loading=true;
  try{const [next,config]=await Promise.all([window.pet.system({action:'generation-preferences'}),window.pet.system({action:'generation-api-config'})]);priorities=next;labels={api:'生图 API',imagegen:'Codex ImageGen',comfyui:'ComfyUI',...Object.fromEntries((config.videoApis||[]).map(v=>[v.id,v.name+' · '+v.model]))};render();}
  catch(error){status.textContent=error.message;}finally{loading=false;if(refreshPending&&!saving){refreshPending=false;void load(true);}}
 }
 document.addEventListener('lingpet:generation-apis-changed',()=>{status.textContent='服务列表已更新。';void load(true);});document.addEventListener('lingpet:navigate',event=>{if(event.detail==='app')void load();});if(document.body.dataset.page==='app')void load();
}
