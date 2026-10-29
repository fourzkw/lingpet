const $=id=>document.getElementById(id);
let busy=false,known=false;
function render(data){
  document.documentElement.dataset.theme=data.theme??'paper-journal';known=true;
  const runtime=data.runtime,preparing=!data.running&&['downloading','extracting'].includes(runtime?.phase);
  $('status').textContent=data.running?'桌宠正在运行':preparing?'正在准备 Electron':'桌宠已关闭';$('dot').classList.toggle('running',data.running);
  $('detail').textContent=data.running?'可打开工作台管理桌宠、形象与会话跟随。':runtime?.message||'点击启动即可恢复桌宠。';
  $('runtimeProgress').hidden=!preparing;
  if(runtime?.phase==='downloading'&&Number.isFinite(runtime.percent))$('runtimeProgress').value=runtime.percent;else $('runtimeProgress').removeAttribute('value');
  $('start').disabled=busy||data.running;$('stop').disabled=busy||!data.running;$('settings').disabled=busy;
}
async function refresh(){try{const res=await fetch('/status');if(!res.ok)throw new Error('连接已失效，请重新打开控制面板');render(await res.json());}catch(error){known=false;$('status').textContent='控制面板连接已断开';$('message').textContent=error.message;for(const id of ['start','stop','settings'])$(id).disabled=true;}}
for(const action of ['start','stop','settings'])$(action).onclick=async()=>{if(busy||!known)return;busy=true;for(const id of ['start','stop','settings'])$(id).disabled=true;$('message').textContent=action==='stop'?'正在关闭…':'正在打开…';try{const res=await fetch('/'+action,{method:'POST',headers:{'X-Board-Pet-Control':'1'}}),data=await res.json();if(!res.ok)throw new Error(data.error);busy=false;render(data);$('message').textContent=action==='stop'?'已关闭，随时可以再次启动。':action==='settings'?'工作台已打开。':'桌宠已启动。';}catch(error){busy=false;$('message').textContent=error.message;await refresh();}};
void refresh();setInterval(()=>void refresh(),1000);
