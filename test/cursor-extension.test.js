import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import {readFile,mkdtemp,cp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StateStore} from '../src/state-store.js';
import {startLocalServer} from '../src/local-server.js';

test('Cursor sidebar registers a native view and safe commands that manage only the authenticated pet',async()=>{
  const fixture=await mkdtemp(path.join(process.cwd(),'.test-data-sidebar-'));
  const runtime=path.join(fixture,'cursor-plugin/runtime');await mkdir(runtime,{recursive:true});
  await cp('src',path.join(runtime,'src'),{recursive:true});await cp('package.json',path.join(runtime,'package.json'));
  const oldDir=process.env.BOARD_PET_DATA_DIR;process.env.BOARD_PET_DATA_DIR=fixture;
  const commands=new Map(),registered=[],messages=[],subscriptions=[];let provider,receive,opened=0;
  const disposable=()=>({dispose(){}});
  const vscode={
    Uri:{joinPath:(base,...parts)=>path.join(base,...parts)},
    cursor:{plugins:{registerPath:p=>registered.push(p),unregisterPath:p=>registered.push('removed:'+p)}},
    commands:{registerCommand:(name,fn)=>{commands.set(name,fn);return disposable();}},
    window:{createOutputChannel:()=>({appendLine(){},dispose(){}}),showErrorMessage:()=>{},registerWebviewViewProvider:(id,p)=>{assert.equal(id,'board-pet.controls');provider=p;return disposable();}},
  };
  const filename=fileURLToPath(new URL('../cursor-extension/extension.cjs',import.meta.url));
  const mod=new Module(filename);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
  const originalRequire=mod.require.bind(mod);mod.require=name=>name==='vscode'?vscode:originalRequire(name);
  mod._compile(await readFile(filename,'utf8'),filename);
  let server;const store=new StateStore();
  try{
    server=await startLocalServer(store,fixture,{showDashboard:()=>{opened++;return {ok:true};},quitPet:()=>{void server.close();}});
    const api=await mod.exports.activate({extensionPath:fixture,extensionUri:fixture,subscriptions});
    assert.equal(commands.size,4);assert.deepEqual(registered,[path.join(fixture,'cursor-plugin')]);
    const view={visible:true,webview:{cspSource:'test-source',asWebviewUri:value=>value,postMessage:async m=>{messages.push(m);},onDidReceiveMessage:fn=>{receive=fn;return disposable();}},onDidDispose:()=>disposable(),onDidChangeVisibility:()=>disposable()};
    provider.resolveWebviewView(view);assert.match(view.webview.html,/Content-Security-Policy/);assert.match(view.webview.html,/启动桌宠/);
    assert.equal((await api.status()).pet.running,true);
    assert.equal((await commands.get('board-pet.start')()).alreadyRunning,true);
    await commands.get('board-pet.dashboard')();assert.equal(opened,1);
    receive({type:'action',action:'shell'});assert.equal(opened,1);
    await commands.get('board-pet.stop')();await server.close();server=null;
    assert.equal((await api.status()).pet.running,false);
    assert.ok(!JSON.stringify(messages).includes('token'));
    const pkg=JSON.parse(await readFile('cursor-extension/package.json','utf8'));
    assert.equal(pkg.contributes.views['board-pet'][0].type,'webview');assert.deepEqual(pkg.extensionKind,['ui']);
  }finally{
    subscriptions.reverse().forEach(d=>d.dispose());
    if(oldDir===undefined)delete process.env.BOARD_PET_DATA_DIR;else process.env.BOARD_PET_DATA_DIR=oldDir;
    await server?.close();await rm(fixture,{recursive:true,force:true});
  }
});
