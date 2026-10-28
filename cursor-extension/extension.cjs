const vscode=require('vscode');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {randomBytes}=require('node:crypto');
const os=require('node:os');
const fs=require('node:fs/promises');

function html(webview,extensionUri){
  const nonce=randomBytes(16).toString('hex');
  const script=webview.asWebviewUri(vscode.Uri.joinPath(extensionUri,'media','sidebar.js'));
  const style=webview.asWebviewUri(vscode.Uri.joinPath(extensionUri,'media','sidebar.css'));
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${style}"></head><body>
  <header><div class="eyebrow">LINGPET / 灵伴</div><h1>灵伴桌宠</h1><p>让桌宠陪伴每一次思考与创作。</p></header>
  <section class="card" aria-live="polite"><div class="status"><span id="dot"></span><strong id="status">正在检查…</strong></div><p id="detail">读取本机桌宠状态</p><p id="bridge">Cursor 事件：正在检查</p></section>
  <div class="actions"><button data-action="start" id="start">启动桌宠</button><button data-action="dashboard" id="dashboard" class="secondary">打开工作台</button><button data-action="stop" id="stop" class="secondary">关闭全部桌宠</button><button data-action="refresh" class="secondary">刷新状态</button></div>
  <section class="card"><strong>我的桌宠</strong><select id="petSelect" aria-label="选择桌宠"></select><p id="petSummary"></p><div class="actions"><button data-action="pet-dashboard">编辑所选桌宠</button><button data-action="pet-enable" class="secondary">启用所选桌宠</button><button data-action="pet-pause" class="secondary">暂停所选桌宠</button><button data-action="pet-create" class="secondary">＋ 新增桌宠</button></div></section>
  <p id="message" role="status"></p><footer>上方“关闭桌宠”会退出全部桌宠并暂停自动唤起。单独暂停不会影响其他桌宠。<br><br>Cursor 和 DSH 共用一个服务，每只桌宠独立选择形象与跟随源。</footer>
  <script nonce="${nonce}" src="${script}"></script></body></html>`;
}

async function activate(context){
  const output=vscode.window.createOutputChannel('灵伴桌宠');context.subscriptions.push(output);
  const pluginRoot=path.join(context.extensionPath,'cursor-plugin');
  const runtime=path.join(pluginRoot,'runtime');
  const load=name=>import(pathToFileURL(path.join(runtime,'src',name)).href);
  const [{dataDirectory},{ensureRuntime},{createPetControl},{readEndpoint,request},{cursorDirectory}]=await Promise.all(['paths.js','bootstrap.js','pet-control.js','bridge-client.js','cursor-service.js'].map(load));
  const dir=dataDirectory(),control=createPetControl({dir,ensure:()=>ensureRuntime(dir,{explicit:true})});
  if(/cursor/i.test(vscode.env?.appName||'')){const {acquireCursorLease}=await load('cursor-lease.js');context.subscriptions.push(await acquireCursorLease(dir));}
  let view,busy=false,disposed=false,polling=false,hookRegistration='不可用';
  try{
    if(vscode.cursor?.plugins?.registerPath){
      vscode.cursor.plugins.registerPath(pluginRoot);hookRegistration='已注册，等待会话事件';
      context.subscriptions.push({dispose(){vscode.cursor.plugins.unregisterPath(pluginRoot);}});
    }else if(/cursor/i.test(vscode.env?.appName||'')){
      // Cursor 3.24.12 does not export the documented registration API yet.
      const localRoot=path.join(os.homedir(),'.cursor/plugins/local');
      const localPlugin=path.join(localRoot,'board-pet');
      let existing;
      try{existing=JSON.parse(await fs.readFile(path.join(localPlugin,'.cursor-plugin/plugin.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
      if(existing){
        if(existing.name!=='board-pet')throw new Error('本地插件目录已被其他插件占用');
        hookRegistration='本地插件已安装，等待会话事件';
      }else{
        await fs.mkdir(localRoot,{recursive:true});await fs.cp(pluginRoot,localPlugin,{recursive:true,force:false,errorOnExist:true});
        hookRegistration='本地插件已安装，请重载 Cursor 窗口';
      }
      const {installCursorUserHooks}=await load('cursor-hook-config.js');
      await installCursorUserHooks(path.join(os.homedir(),'.cursor/hooks.json'),localPlugin);
      hookRegistration='用户级 Hooks 已配置，等待会话事件';
    }else hookRegistration='当前编辑器未提供 Cursor 插件 API';
  }catch(error){hookRegistration='注册失败';output.appendLine('Cursor Hooks 注册失败：'+error.message);}
  async function status(){
    const pet=await control.status();let bridge=false;
    const list=await control.listPets();
    const endpoint=await readEndpoint(cursorDirectory(dir));
    if(endpoint)try{await request(endpoint,'/health',undefined,700);bridge=true;}catch{}
    return {pet,pets:list.pets||[],bridge,hookRegistration,busy};
  }
  async function refresh(){
    if(disposed||polling)return;polling=true;
    try{const state=await status();if(!disposed&&view)await view.webview.postMessage({type:'status',...state});return state;}
    catch(error){output.appendLine('状态读取失败：'+error.message);}
    finally{polling=false;}
  }
  async function run(action,detail={}){
    if(!['start','stop','dashboard','refresh','pet-create','pet-enable','pet-pause','pet-dashboard'].includes(action)||busy)return;
    if(action==='refresh')return refresh();
    busy=true;await refresh();
    try{
      let result;
      if(action==='pet-create')result=await control.managePets({action:'create',value:{name:'新桌宠'}});
      else if(action==='pet-enable'||action==='pet-pause')result=await control.managePets({action:'update',id:detail.id,value:{enabled:action==='pet-enable',petVisible:true}});
      else if(action==='pet-dashboard')result=await control.openDashboard(detail.id);
      else if(action==='start')result=await control.start();
      else if(action==='stop')result=await control.stop();
      else{
        const current=await control.status();
        if(!current.running){const started=await control.start();if(!started.ok||!started.running)throw new Error(started.error||'桌宠正在准备，请稍后打开工作台。');}
        result=await control.openDashboard();
      }
      if(!result.ok)throw new Error(result.error||'操作失败');
      const message=action.startsWith('pet-')?'桌宠操作已完成。':action==='start'?(result.pending?'桌宠正在准备，请稍候。':'桌宠已打开。'):action==='stop'?'全部桌宠已关闭，自动唤起已暂停。':'工作台已打开。';
      if(view)await view.webview.postMessage({type:'message',text:message});
      output.appendLine(message);
      return result;
    }catch(error){
      output.appendLine('操作失败：'+error.message);
      if(view)await view.webview.postMessage({type:'message',text:error.message,error:true});
      void vscode.window.showErrorMessage('灵伴桌宠：'+error.message);
      return {ok:false,error:error.message};
    }finally{busy=false;await refresh();}
  }
  const provider={resolveWebviewView(next){
    view=next;next.webview.options={enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'media')]};
    next.webview.html=html(next.webview,context.extensionUri);
    context.subscriptions.push(next.webview.onDidReceiveMessage(message=>{if(message?.type==='action')void run(message.action,{id:message.id});}));
    context.subscriptions.push(next.onDidDispose(()=>{if(view===next)view=null;}));
    context.subscriptions.push(next.onDidChangeVisibility(()=>{if(next.visible)void refresh();}));
    void refresh();
  }};
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('board-pet.controls',provider));
  for(const action of ['start','stop','dashboard','refresh'])context.subscriptions.push(vscode.commands.registerCommand('board-pet.'+action,()=>run(action)));
  const timer=setInterval(()=>{if(view?.visible)void refresh();},3000);timer.unref?.();
  context.subscriptions.push({dispose(){disposed=true;clearInterval(timer);}});
  output.appendLine('侧边栏已激活；Cursor Hooks '+hookRegistration+'。');
  // Expose a read-only diagnostic for extension-host smoke tests and command clients.
  return {status};
}
module.exports={activate};
