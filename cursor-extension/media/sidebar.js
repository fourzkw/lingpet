const api=acquireVsCodeApi();
const buttons=[...document.querySelectorAll('button[data-action]')];
let pets=[];
for(const button of buttons)button.addEventListener('click',()=>api.postMessage({type:'action',action:button.dataset.action,id:document.getElementById('petSelect').value}));
const selection=document.getElementById('petSelect');
function describePet(){const pet=pets.find(p=>p.id===selection.value);document.getElementById('petSummary').textContent=pet?pet.character+' · '+(pet.follow.mode==='global'?'全局自动跟随':pet.follow.mode==='source'?pet.follow.source+' 自动跟随':'指定会话')+' · '+(pet.enabled?'已启用':'已暂停'):'先启动桌宠服务，然后新增或选择桌宠。';}
selection.onchange=describePet;
window.addEventListener('message',event=>{
  const m=event.data;
  if(m?.type==='message'){
    document.getElementById('message').textContent=m.text;
    document.getElementById('message').classList.toggle('error',Boolean(m.error));return;
  }
  if(m?.type!=='status')return;
  const pet=m.pet,running=pet.running;
  const previous=selection.value;pets=m.pets||[];selection.replaceChildren();
  for(const item of pets){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;selection.append(option);}
  if(pets.some(p=>p.id===previous))selection.value=previous;describePet();
  document.getElementById('status').textContent=pet.error?'状态异常':running?'桌宠运行中':'桌宠已关闭';
  document.getElementById('dot').classList.toggle('running',running);
  document.getElementById('detail').textContent=pet.error|| (running?`PID ${pet.pid} · ${pet.sessions} 个会话 · ${pet.instances} 个来源`:'点击下方按钮启动桌宠。');
  document.getElementById('bridge').textContent='Cursor 事件：'+(m.bridge?'桥接已连接':m.hookRegistration);
  for(const button of buttons)button.disabled=m.busy||(button.dataset.action==='stop'&&!running)||(button.dataset.action.startsWith('pet-')&&(!running||(button.dataset.action!=='pet-create'&&!selection.value)));
  updatePetActions();
  document.getElementById('start').textContent=m.busy?'正在处理…':running?'显示桌宠':'启动桌宠';
});
api.postMessage({type:'action',action:'refresh'});
function updatePetActions(){const pet=pets.find(p=>p.id===selection.value);for(const button of buttons){if(button.dataset.action==='pet-enable')button.hidden=Boolean(pet?.enabled);if(button.dataset.action==='pet-pause')button.hidden=Boolean(pet&&!pet.enabled);}}
selection.addEventListener('change',updatePetActions);
