import {App,applyDocumentTheme,applyHostStyleVariables} from '@modelcontextprotocol/ext-apps';
const app=new App({name:'灵伴桌宠',version:'0.4.9'});
const $=id=>document.getElementById(id);
let busy=false,connected=false;
function theme(context){if(context?.theme)applyDocumentTheme(context.theme);if(context?.styles?.variables)applyHostStyleVariables(context.styles.variables);}
function render(data){
  if(!data||typeof data.running!=='boolean')return;
  $('status').textContent=data.running?'桌宠正在运行':'桌宠已关闭';$('dot').classList.toggle('running',data.running);
  $('detail').textContent=data.running?'管理桌宠形象、显示和会话跟随，请打开工作台。':'点击启动即可恢复桌宠。关闭后此入口仍然保留。';
  $('start').disabled=busy;$('start').textContent=data.running?'显示桌宠':'启动桌宠';$('stop').disabled=busy||!data.running;$('settings').disabled=busy;
  $('pets').replaceChildren();
  for(const pet of data.pets||[]){const row=document.createElement('div');row.className='pet';const name=document.createElement('strong'),state=document.createElement('span');name.textContent=pet.name;state.textContent=pet.enabled!==false&&pet.visible?'已显示':'已隐藏';row.append(name,state);$('pets').append(row);}
}
function read(result){if(result.isError)throw new Error(result.content?.find(x=>x.type==='text')?.text||'操作未完成');render(result.structuredContent);}
async function refresh(){if(busy||!connected)return;try{read(await app.callServerTool({name:'board_pet_control',arguments:{action:'status'}}));}catch(error){$('message').textContent=error.message;}}
for(const action of ['start','stop','settings'])$(action).onclick=async()=>{
  if(!connected||busy)return;busy=true;for(const id of ['start','stop','settings'])$(id).disabled=true;
  $('message').textContent=action==='stop'?'正在关闭全部桌宠…':'正在打开…';
  try{const result=await app.callServerTool({name:'board_pet_control',arguments:{action}});busy=false;read(result);$('message').textContent=action==='stop'?'已关闭，可随时再次启动。':action==='settings'?'工作台已打开。':'桌宠已显示。';}
  catch(error){busy=false;$('message').textContent=error.message;await refresh();}
};
app.ontoolresult=result=>{try{read(result);}catch(error){$('message').textContent=error.message;}};
app.onhostcontextchanged=context=>theme(context);
app.onteardown=async()=>{clearInterval(timer);return {};};
let timer;
try{await app.connect();connected=true;theme(app.getHostContext());timer=setInterval(()=>void refresh(),3000);await refresh();}
catch(error){$('status').textContent='无法连接桌宠服务';$('message').textContent=error.message;}




