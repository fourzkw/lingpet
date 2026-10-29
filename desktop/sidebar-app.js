import {App,applyDocumentTheme,applyHostStyleVariables} from '@modelcontextprotocol/ext-apps';
const app=new App({name:'灵伴桌宠',version:'0.6.19'});
const $=id=>document.getElementById(id);
let busy=false,connected=false,refreshing=false;
function theme(context){if(context?.theme)applyDocumentTheme(context.theme);if(context?.styles?.variables)applyHostStyleVariables(context.styles.variables);}
function render(data){
  if(!data||typeof data.running!=='boolean')return;
  const runtime=data.runtime,preparing=!data.running&&!data.error&&(data.pending||['downloading','extracting'].includes(runtime?.phase));
  $('status').textContent=data.running?'桌宠正在运行':data.error?'启动失败':preparing?'正在准备 Electron':'桌宠已关闭';$('dot').classList.toggle('running',data.running);
  $('connection').textContent='工作台连接：'+(data.running?'已连通':'未连接')+'；'+(data.connection?.name||'宿主')+' 事件：'+(data.connection?.label||'等待连接')+(data.connection?.hint?'。'+data.connection.hint:'');
  $('detail').textContent=data.error||(data.running?'管理桌宠形象、显示和会话跟随，请打开工作台。':preparing?'正在准备桌宠，下方会持续显示 Electron 下载和解压状态。':'点击启动即可恢复桌宠。关闭后此入口仍然保留。');
  $('runtimeDetail').textContent=runtime?.message||'首次启动需要联网下载 Electron；准备完成后自动启动桌宠，以后复用本地运行时。';
  $('runtimeProgress').hidden=!preparing;
  if(runtime?.phase==='downloading'&&Number.isFinite(runtime.percent))$('runtimeProgress').value=runtime.percent;else $('runtimeProgress').removeAttribute('value');
  $('start').disabled=busy||data.pending;$('start').textContent=data.running?'显示桌宠':'启动桌宠';$('stop').disabled=busy||data.pending||!data.running;$('settings').disabled=busy||data.pending;
  if(data.pending)$('message').textContent='启动请求已受理，正在后台准备，请保持面板打开查看进度。';
  else if(data.error)$('message').textContent=data.error;
  else if($('message').textContent.startsWith('启动请求已受理'))$('message').textContent=data.running?'桌宠已启动。':'';
  $('pets').replaceChildren();
  for(const pet of data.pets||[]){const row=document.createElement('div');row.className='pet';const name=document.createElement('strong'),state=document.createElement('span');name.textContent=pet.name;state.textContent=pet.enabled!==false&&pet.visible?'已显示':'已隐藏';row.append(name,state);$('pets').append(row);}
}
function read(result){if(result.isError)throw new Error(result.content?.find(x=>x.type==='text')?.text||'操作未完成');render(result.structuredContent);}
async function refresh(){if(!connected||refreshing)return;refreshing=true;try{read(await app.callServerTool({name:'board_pet_control',arguments:{action:'status'}}));}catch(error){$('message').textContent=error.message;}finally{refreshing=false;}}
for(const action of ['start','stop','settings'])$(action).onclick=async()=>{
  if(!connected||busy)return;busy=true;for(const id of ['start','stop','settings'])$(id).disabled=true;
  $('message').textContent=action==='stop'?'正在关闭全部桌宠…':'正在准备桌宠，首次启动需要下载 Electron，请查看上方进度。';
  try{const result=await app.callServerTool({name:'board_pet_control',arguments:{action}});busy=false;read(result);$('message').textContent=result.structuredContent?.pending?'启动请求已受理，正在后台准备，请保持面板打开查看进度。':action==='stop'?'已关闭，可随时再次启动。':action==='settings'?'工作台已打开。':'桌宠已显示。';}
  catch(error){busy=false;$('message').textContent=error.message;await refresh();}
};
app.ontoolresult=result=>{try{read(result);}catch(error){$('message').textContent=error.message;}};
app.onhostcontextchanged=context=>theme(context);
app.onteardown=async()=>{clearInterval(timer);return {};};
let timer;
try{await app.connect();connected=true;theme(app.getHostContext());timer=setInterval(()=>void refresh(),1000);await refresh();}
catch(error){$('status').textContent='无法连接桌宠服务';$('message').textContent=error.message;}
