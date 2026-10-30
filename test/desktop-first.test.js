import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {IntegrationManager} from '../src/integrations/manager.js';
import {startIntegrationGateway} from '../src/integrations/gateway.js';
import {integrationRequest} from '../src/integrations/client.js';
import {StateStore} from '../src/state-store.js';
import {createAdapterPackage,hookCommand,codexWindowsHookCommand} from '../src/integrations/packages.js';
import {installDesktop} from '../src/maintenance/desktop-install.js';

async function fixture(t){
  const base=path.resolve('.test-data-desktop-first');await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,'case-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const dir=path.join(root,'data'),home=path.join(root,'home'),template=path.join(root,'template');await mkdir(path.join(template,'skills'),{recursive:true});
  const manager=new IntegrationManager({dir,root:template,bridge:path.join(root,'LingPetBridge.exe'),version:'0.7.0',home,execute:async()=>({stdout:''})});
  const config=path.join(home,'.cursor');await mkdir(config,{recursive:true});return {root,dir,home,config,manager};
}

test('Codex Windows hook runs from a path with spaces through CMD and PowerShell', {skip:process.platform!=='win32'},async t=>{
  const {root}=await fixture(t),folder=path.join(root,'Program Files','灵伴');await mkdir(folder,{recursive:true});
  const bridge=path.join(folder,'LingPetBridge.cmd');await writeFile(bridge,'@echo off\r\necho %1 %2 %3\r\n');
  const id='00000000-0000-4000-8000-000000000001';
  const execute=(command,powershell=false)=>new Promise((resolve,reject)=>{
    const child=spawn(powershell?'powershell.exe':process.env.ComSpec||'cmd.exe',powershell?['-NoProfile','-NonInteractive','-Command',command]:['/d','/s','/c',command],{windowsHide:true,windowsVerbatimArguments:!powershell,stdio:['ignore','pipe','ignore']});
    let stdout='';child.stdout.on('data',chunk=>stdout+=chunk);child.once('error',reject);child.once('exit',code=>resolve({code,stdout}));
  });
  assert.notEqual((await execute(hookCommand(bridge,id,'SessionStart'))).code,0);
  for(const powershell of [false,true]){
    const result=await execute(codexWindowsHookCommand(bridge,id,'SessionStart'),powershell);
    assert.equal(result.code,0);assert.equal(result.stdout.trim(),`hook ${id} SessionStart`);
  }
});
test('DSH installs from automatic discovery with the web profile through its plugin CLI',async t=>{
  const {manager,root}=await fixture(t),config=path.join(root,'automatic-dsh'),executable=path.join(root,'dsh.exe');let captured;
  await mkdir(path.join(manager.root,'adapters/dsh'),{recursive:true});await writeFile(path.join(manager.root,'adapters/dsh/package.json'),JSON.stringify({name:'lingpet-agent'}));
  manager.discover=async()=>({targets:[{source:'dsh',config,executable}]});
  manager.execute=async(file,args,options)=>{captured={file,args,options};return {stdout:''};};
  const item=await manager.install({source:'dsh'});
  assert.equal(item.config,config);assert.equal(item.profile,'web');assert.equal(captured.file,executable);
  assert.deepEqual(captured.args,['plugin','--profile','web','add','file:'+item.packageRoot]);assert.equal(captured.options.env.DSH_HOME,config);
});

test('Codex installs with discovered command and home without manual parameters',async t=>{
  const {manager,root}=await fixture(t),config=path.join(root,'automatic-codex'),executable=path.join(root,'codex.exe'),calls=[];
  manager.discover=async()=>({targets:[{source:'codex',config,executable}]});
  manager.execute=async(file,args,options)=>{calls.push({file,args,options});return {stdout:''};};
  const item=await manager.install({source:'codex'});
  assert.equal(item.config,config);assert.equal(item.state,'installed');assert.equal(calls.length,2);
  assert.deepEqual(calls.map(call=>call.args),[['plugin','marketplace','add',item.packageRoot],['plugin','add','board-pet@lingpet-'+item.id]]);
  assert.ok(calls.every(call=>call.file===executable&&call.options.env.CODEX_HOME===config));
});

test('DSH discovery failure explains how to proceed without registering an integration',async t=>{
  const {manager,root}=await fixture(t);manager.discover=async()=>({targets:[{source:'dsh',config:path.join(root,'.dsh')}]});
  await assert.rejects(manager.install({source:'dsh'}),/未找到 DSH 命令/);assert.deepEqual(await manager.records(),[]);
});

test('Codex retries use the actual registered marketplace and preserve other marketplaces',async t=>{
  const {manager,root}=await fixture(t),config=path.join(root,'codex'),executable=path.join(root,'codex.exe');
  const markets=new Map([['unrelated',path.join(root,'other-market')]]);let fail=false;
  manager.execute=async(_file,args)=>{
    if(args[1]==='marketplace'){
      if(args[2]==='list')return {stdout:JSON.stringify({marketplaces:[...markets].map(([name,root])=>({name,root}))})};
      if(args[2]==='remove'){markets.delete(args[3]);return {stdout:''};}
      const manifest=JSON.parse(await readFile(path.join(args[3],'.agents/plugins/marketplace.json'),'utf8'));
      if(markets.has(manifest.name)&&markets.get(manifest.name)!==args[3])throw Error('already added from a different source');
      markets.set(manifest.name,args[3]);
    }else if(fail){fail=false;throw Error('plugin install failed');}
    return {stdout:''};
  };
  const first=await manager.install({source:'codex',config,executable}),name='lingpet-'+first.id;
  manager.version='0.7.1';const updated=await manager.install({source:'codex',config,executable});
  assert.equal(updated.id,first.id);assert.notEqual(updated.packageRoot,first.packageRoot);assert.equal(markets.get(name),updated.packageRoot);
  fail=true;await assert.rejects(manager.install({source:'codex',config,executable}),/plugin install failed/);
  assert.equal(markets.get(name),updated.packageRoot,'failure restores the prior actual marketplace');
  const [partial]=await manager.records();assert.equal(partial.state,'partial');assert.notEqual(partial.packageRoot,markets.get(name));
  const retried=await manager.install({source:'codex',config,executable});
  assert.equal(retried.state,'installed');assert.equal(retried.id,first.id);assert.equal(markets.get(name),retried.packageRoot);
  assert.equal(markets.get('unrelated'),path.join(root,'other-market'));
});

test('DSH advanced options preserve an explicit installation and profile',async t=>{
  const {manager,root}=await fixture(t),config=path.join(root,'custom-dsh'),executable=path.join(root,'custom-dsh.exe');let captured;
  await mkdir(path.join(manager.root,'adapters/dsh'),{recursive:true});await writeFile(path.join(manager.root,'adapters/dsh/package.json'),JSON.stringify({name:'lingpet-agent'}));
  manager.discover=async()=>{throw Error('explicit installation must not be replaced');};
  manager.execute=async(file,args,options)=>{captured={file,args,options};return {stdout:''};};
  const item=await manager.install({source:'dsh',config,executable,profile:'headless'});
  assert.equal(item.profile,'headless');assert.equal(captured.file,executable);assert.equal(captured.options.env.DSH_HOME,config);
  assert.deepEqual(captured.args.slice(0,4),['plugin','--profile','headless','add']);
});

test('Cursor installs into its default directory without command or profile parameters',async t=>{
  const {manager,config}=await fixture(t);
  manager.execute=async()=>{throw Error('Cursor default installation must not invoke a host CLI');};
  const item=await manager.install({source:'cursor'});
  assert.equal(item.config,config);assert.equal(item.state,'installed');
  const hooks=JSON.parse(await readFile(path.join(config,'hooks.json'),'utf8'));
  assert.ok(hooks.hooks.beforeSubmitPrompt.length);
  const mcp=JSON.parse(await readFile(path.join(config,'mcp.json'),'utf8'));
  assert.deepEqual(mcp.mcpServers['lingpet-'+item.id].args,['mcp',item.id]);
});

test('Cursor install is idempotent and uninstall preserves third-party and concurrent user configuration',async t=>{
  const {manager,config}=await fixture(t);const hooks=path.join(config,'hooks.json');
  await writeFile(hooks,JSON.stringify({custom:true,version:1,hooks:{stop:[{command:'other-hook'}]}}));
  await writeFile(path.join(config,'mcp.json'),JSON.stringify({mcpServers:{other:{command:'other'}}}));
  const first=await manager.install({source:'cursor',config}),second=await manager.install({source:'cursor',config});assert.equal(first.id,second.id);
  const value=JSON.parse(await readFile(hooks,'utf8'));assert.equal(value.hooks.stop.length,2);assert.equal(value.custom,true);
  value.hooks.stop.push({command:'new-user-hook'});await writeFile(hooks,JSON.stringify(value));
  const list=await manager.discover();assert.equal(JSON.stringify(list).includes('controlToken'),false);assert.equal(JSON.stringify(list).includes('"token"'),false);
  await manager.remove(first.id);const after=JSON.parse(await readFile(hooks,'utf8'));assert.deepEqual(after.hooks.stop,[{command:'other-hook'},{command:'new-user-hook'}]);
  assert.deepEqual(JSON.parse(await readFile(path.join(config,'mcp.json'),'utf8')),{mcpServers:{other:{command:'other'}}});
});
test('partial host installation is retained for repair and never authorized',async t=>{
  const {manager,root}=await fixture(t);manager.execute=async()=>{throw Error('host refused');};
  await assert.rejects(manager.install({source:'codex',config:path.join(root,'.codex'),executable:path.join(root,'codex.exe')}),/接入未完成/);
  const [item]=await manager.records();assert.equal(item.state,'partial');assert.equal(await manager.authorize(item.token),undefined);
});
test('host CLI uses one Windows PATH key and explicit CMD quoting',async t=>{
  const {manager,root}=await fixture(t);let captured;
  manager.execute=async(file,args,options)=>{captured={file,args,options};return {stdout:''};};
  await manager.install({source:'codex',config:path.join(root,'codex-home'),executable:path.join(root,'codex.cmd')});
  assert.equal(captured.options.windowsVerbatimArguments,true);
  assert.equal(Object.keys(captured.options.env).filter(key=>key.toUpperCase()==='PATH').length,1);
  assert.equal(captured.options.env.CODEX_HOME,path.join(root,'codex-home'));
  assert.ok(captured.args.at(-1).startsWith('""'));
});
test('host runtime supplies Node while keeping installed pnpm ahead of its fallback',async t=>{
  const {manager,root}=await fixture(t);let captured;
  await writeFile(path.join(root,'active.json'),JSON.stringify({active:'0.7.4'}));
  manager.execute=async(file,args,options)=>{captured=options;return {stdout:''};};
  await manager.executeHost({source:'dsh',config:path.join(root,'dsh-home'),executable:path.join(root,'dsh.exe')},['plugin','--profile','web','--version']);
  const runtime=path.join(root,'versions/0.7.4');assert.equal(captured.env.Path,[runtime,process.env.PATH,path.join(runtime,'package-manager')].filter(Boolean).join(path.delimiter));
});

test('host installation errors include pnpm standard output and explain incompatible stores',async t=>{
  const {manager,root}=await fixture(t);
  manager.execute=async()=>{throw Object.assign(Error('command failed'),{stdout:'ERR_PNPM_UNEXPECTED_STORE: store v11 does not match v10',stderr:'diagnostics: test/pnpm.log'});};
  await assert.rejects(manager.install({source:'codex',config:path.join(root,'codex'),executable:path.join(root,'codex.exe')}),/ERR_PNPM_UNEXPECTED_STORE/);
  const [record]=await manager.records();assert.equal(record.state,'partial');assert.match(record.error,/store v11 does not match v10/);assert.match(record.error,/diagnostics: test\/pnpm.log/);
});

test('gateway separates control and events, strips hook bodies, deduplicates and revokes removed connections',async t=>{
  const {manager,dir,config}=await fixture(t);const item=await manager.install({source:'cursor',config}),store=new StateStore();let controls=0;
  const gateway=await startIntegrationGateway({manager,store,control:{run:async()=>({controls:++controls})},creation:{}});t.after(()=>gateway.close());
  const event={hook_event_name:'beforeSubmitPrompt',conversation_id:'session',generation_id:'turn',prompt:'SECRET',tool_input:{secret:true}};
  assert.equal((await integrationRequest(dir,item.id,'/hook',event)).accepted,true);
  assert.equal((await integrationRequest(dir,item.id,'/hook',event)).accepted,false);
  assert.equal(store.sessions.size,1);assert.equal(JSON.stringify(store.snapshot()).includes('SECRET'),false);
  const [session]=store.sessions.values();assert.equal(session.scopeId,item.id);assert.equal(session.state,'thinking');
  await assert.rejects(integrationRequest(dir,item.id,'/control',{action:'stop'}),/凭证/);assert.equal(controls,0);
  assert.equal((await integrationRequest(dir,item.id,'/control',{action:'status'},{control:true})).controls,1);
  await assert.rejects(integrationRequest(dir,item.id,'/event',{...session,source:'dsh'}),/只能提交/);
  await manager.remove(item.id);await assert.rejects(integrationRequest(dir,item.id,'/hook',event),/停用/);
});
test('gateway rejects browser origins and unvalidated creation methods',async t=>{
  const {manager,dir,config}=await fixture(t);const item=await manager.install({source:'cursor',config});const gateway=await startIntegrationGateway({manager,store:new StateStore(),control:{},creation:{}});t.after(()=>gateway.close());
  await assert.rejects(integrationRequest(dir,item.id,'/creation',{method:'constructor',args:[]},{control:true}),/无效创作/);
  await assert.rejects(integrationRequest(dir,item.id,'/creation',{method:'project',args:[{action:'delete_everything'}]},{control:true}));
  const endpoint=JSON.parse(await readFile(path.join(dir,'integrations/endpoint.json'),'utf8'));const response=await fetch(endpoint.url,{method:'POST',headers:{Origin:'http://evil.test'}});assert.equal(response.status,403);
});
test('central observer keeps waiting sessions alive while the host runs and disconnects when it exits',async t=>{
  const {manager,dir,config}=await fixture(t),item=await manager.install({source:'cursor',config}),store=new StateStore();let running=true;
  const gateway=await startIntegrationGateway({manager,store,control:{},creation:{},intervalMs:10,ownerCheck:async()=>running});t.after(()=>gateway.close());
  await integrationRequest(dir,item.id,'/hook',{hook_event_name:'beforeSubmitPrompt',conversation_id:'s',generation_id:'t'});
  manager.live.get(item.id).updatedAt=Date.now()-100000;
  await new Promise(resolve=>setTimeout(resolve,40));assert.equal(manager.live.get(item.id).connected,true);
  running=false;await new Promise(resolve=>setTimeout(resolve,40));assert.equal([...store.sessions.values()][0].connected,false);
});
test('DSH workers disconnect independently and request a snapshot after a heartbeat outage',async t=>{
  const {manager,dir,root}=await fixture(t);const template=path.join(manager.root,'adapters/dsh');await mkdir(template,{recursive:true});await writeFile(path.join(template,'package.json'),JSON.stringify({name:'lingpet-agent',version:'0.7.0'}));
  const item=await manager.install({source:'dsh',config:path.join(root,'dsh-home'),executable:path.join(root,'dsh.exe')}),store=new StateStore({now:()=>now});let now=0;
  const gateway=await startIntegrationGateway({manager,store,control:{},creation:{}});t.after(()=>gateway.close());
  for(const instanceId of ['one','two'])await integrationRequest(dir,item.id,'/event',{version:1,instanceId,sessionId:instanceId,seq:1,turn:1,state:'approval'});
  await integrationRequest(dir,item.id,'/disconnect',{instanceId:'one'});const sessions=[...store.sessions.values()];assert.equal(sessions.find(s=>s.sessionId==='one').connected,false);assert.equal(sessions.find(s=>s.sessionId==='two').connected,true);
  now=50000;store.tick();assert.equal((await integrationRequest(dir,item.id,'/heartbeat',{instanceId:'two'})).resync,true);
  await integrationRequest(dir,item.id,'/event',{version:1,instanceId:'two',sessionId:'two',seq:2,turn:1,state:'approval'});assert.equal([...store.sessions.values()].find(s=>s.sessionId==='two').connected,true);
});
test('Codex light package contains no runtime and uses stable bridge commands',async t=>{
  const {root}=await fixture(t),destination=path.join(root,'codex');await createAdapterPackage({source:'codex',id:'12345678-1234-1234-1234-123456789abc',destination,bridge:path.join(root,'LingPetBridge.exe'),version:'0.7.0'});
  const value=JSON.parse(await readFile(path.join(destination,'plugins/board-pet/hooks/hooks.json'),'utf8'));assert.equal(value.hooks.SessionStart[0].hooks[0].timeout,3);assert.match(value.hooks.SessionStart[0].hooks[0].commandWindows,/LingPetBridge\.exe/);assert.doesNotMatch(JSON.stringify(value),/runtime\/|node /);
  await assert.rejects(readFile(path.join(destination,'runtime/package.json')),{code:'ENOENT'});
});
test('installer rejects tampered payloads before changing active installation',async t=>{
  const {root,dir}=await fixture(t),payload=path.join(root,'payload');await mkdir(path.join(payload,'resources/app'),{recursive:true});await writeFile(path.join(payload,'resources/app/package.json'),JSON.stringify({version:'0.7.0',lingpetDesktop:true}));await writeFile(path.join(payload,'desktop-manifest.json'),JSON.stringify({format:1,version:'0.7.0',files:[{file:'resources/app/package.json',sha256:'0'.repeat(64)}]}));
  await assert.rejects(installDesktop({payload,root:path.join(root,'installed'),dir,healthCheck:false}),/校验失败/);await assert.rejects(readFile(path.join(dir,'desktop-install.json')),{code:'ENOENT'});
});

async function installerFixture(t){
  const value=await fixture(t),payload=path.join(value.root,'payload');
  await mkdir(path.join(payload,'resources/app'),{recursive:true});
  await writeFile(path.join(payload,'resources/app/package.json'),JSON.stringify({version:'0.7.1',lingpetDesktop:true}));
  for(const name of ['electron.exe','node.exe','LingPet.exe','LingPetBridge.exe','LingPetMaintenance.exe'])await writeFile(path.join(payload,name),'test executable');
  await writeFile(path.join(payload,'desktop-manifest.json'),JSON.stringify({format:1,version:'0.7.1',files:[]}));
  return {...value,payload};
}
test('installer supports custom Unicode and spaced directories and repeat installation',async t=>{
  const {root,dir,payload}=await installerFixture(t),target=path.join(root,'自定义 位置','My Pet');
  const installed=await installDesktop({payload,root:target,dir,healthCheck:false});
  assert.equal(installed.root,target);assert.equal(JSON.parse(await readFile(path.join(dir,'desktop-install.json'),'utf8')).root,target);
  assert.equal((await installDesktop({payload,root:target,dir,healthCheck:false})).previous,'0.7.1');
});
test('installer rejects changed same-version payloads and upgrades 0.7.20 to 0.7.21 preserving user data',async t=>{
  const {root,dir,payload}=await installerFixture(t),target=path.join(root,'installed');
  const setVersion=async(version,revision)=>{
    await writeFile(path.join(payload,'resources/app/package.json'),JSON.stringify({version,lingpetDesktop:true}));
    await writeFile(path.join(payload,'desktop-manifest.json'),JSON.stringify({format:1,version,files:[],revision}));
  };
  await setVersion('0.7.20','original');
  await installDesktop({payload,root:target,dir,healthCheck:false});
  await writeFile(path.join(dir,'saved-pet.petpack'),'user pet data');
  await writeFile(path.join(dir,'settings.json'),'{"launchAtLogin":true}');
  await setVersion('0.7.20','startup-fix');
  await assert.rejects(installDesktop({payload,root:target,dir,healthCheck:false}),/同版本的不同内容/);
  await setVersion('0.7.21','startup-fix');
  const result=await installDesktop({payload,root:target,dir,healthCheck:false});
  assert.equal(result.version,'0.7.21');assert.equal(result.previous,'0.7.20');
  assert.equal(JSON.parse(await readFile(path.join(target,'active.json'),'utf8')).active,'0.7.21');
  assert.equal(await readFile(path.join(dir,'saved-pet.petpack'),'utf8'),'user pet data');
  assert.equal(await readFile(path.join(dir,'settings.json'),'utf8'),'{"launchAtLogin":true}');
});

test('installer refuses unrelated nonempty folders and overlapping program/data directories',async t=>{
  const {root,dir,payload}=await installerFixture(t),target=path.join(root,'documents');await mkdir(target);await writeFile(path.join(target,'keep.txt'),'user content');
  await assert.rejects(installDesktop({payload,root:target,dir,healthCheck:false}),/非空/);
  assert.equal(await readFile(path.join(target,'keep.txt'),'utf8'),'user content');
  for(const target of [dir,path.join(dir,'program'),path.dirname(dir)])await assert.rejects(installDesktop({payload,root:target,dir,healthCheck:false}),/不能覆盖|无效本体安装目录/);
});
test('changing the directory of an existing installation requires uninstalling it first',async t=>{
  const {root,dir,payload}=await installerFixture(t),first=path.join(root,'first'),second=path.join(root,'second');
  await installDesktop({payload,root:first,dir,healthCheck:false});
  await assert.rejects(installDesktop({payload,root:second,dir,healthCheck:false}),/先卸载/);
  assert.equal(JSON.parse(await readFile(path.join(dir,'desktop-install.json'),'utf8')).root,first);
});
test('installer defaults all user content to the data folder under its installation',async t=>{
  const {root,payload}=await installerFixture(t),target=path.join(root,'program');
  await installDesktop({payload,root:target,healthCheck:false});
  const location=JSON.parse(await readFile(path.join(target,'desktop-location.json'),'utf8'));
  assert.equal(location.dataDir,path.join(target,'data'));
  await writeFile(path.join(location.dataDir,'downloaded-pet.txt'),'saved content');
  await installDesktop({payload,root:target,healthCheck:false});
  assert.equal(await readFile(path.join(location.dataDir,'downloaded-pet.txt'),'utf8'),'saved content');
  await assert.rejects(installDesktop({payload,root:target,dir:path.join(root,'other-data'),healthCheck:false}),/沿用已有数据目录/);
});
test('data folders cannot overlap owned program files',async t=>{
  const {root,payload}=await installerFixture(t),target=path.join(root,'program');
  for(const suffix of ['versions','versions/pets','LingPet.exe','desktop-location.json'])await assert.rejects(installDesktop({payload,root:target,dir:path.join(target,suffix),healthCheck:false}),/不能覆盖/);
});
