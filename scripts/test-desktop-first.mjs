import path from 'node:path';
import {mkdir,mkdtemp,readFile,writeFile,appendFile,access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {installDesktop} from '../src/maintenance/desktop-install.js';
import {IntegrationManager} from '../src/integrations/manager.js';
import {readEndpoint,request} from '../src/bridge-client.js';
import {integrationRequest} from '../src/integrations/client.js';

const payload=path.resolve(process.argv[2]),base=path.resolve('.test-data-desktop-first-smoke');await mkdir(base,{recursive:true});
const work=await mkdtemp(path.join(base,'run-')),root=path.join(work,process.argv.includes('--custom-root')?'自定义 程序目录/My Pet':'LingPet'),dir=process.argv.includes('--internal-data')?path.join(root,'data'):path.join(work,'自定义 数据目录'),pkg=JSON.parse(await readFile(path.join(payload,'resources/app/package.json'),'utf8'));
const env={...process.env,BOARD_PET_DATA_DIR:dir,LINGPET_MAINTENANCE_TEST:'1',LINGPET_MAINTENANCE_TEST_NO_SANDBOX:process.argv.includes('--no-sandbox')?'1':'0'};for(const key of Object.keys(env))if(key.toLowerCase()==='path')delete env[key];env.Path=path.join(process.env.SystemRoot,'System32');delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
const run=(file,args,input='')=>new Promise((resolve,reject)=>{const launchEnv={...env};if(process.argv.includes('--discover-data'))delete launchEnv.BOARD_PET_DATA_DIR;const child=spawn(file,args,{env:launchEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});const timer=setTimeout(()=>{child.kill();reject(Error('命令超时：'+path.basename(file)+' '+args[0]));},/Setup|Maintenance/.test(file)?60000:15000);let stdout='',stderr='';child.stdout.on('data',value=>stdout+=value);child.stderr.on('data',value=>stderr+=value);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);code===0?resolve({stdout,stderr}):reject(Error(stderr||'exit '+code));});child.stdin.end(input);});
let endpoint;
try{
  const testArguments=process.argv.includes('--no-sandbox')?['--no-sandbox','--disable-gpu']:[];
  const setup=process.argv.find(arg=>arg.startsWith('--setup='))?.slice(8);
  if(setup){await run(path.resolve(setup),['--silent','--root',root,...(process.argv.includes('--internal-data')?[]:['--data',dir]),...testArguments]);await new Promise(resolve=>setTimeout(resolve,500));console.log('Self-extracting installer passed.');}
  const installed=await installDesktop({payload,root,dir,launchArguments:testArguments});
  console.log('Installed and passed application health check.');
  // Installer health-check exits the app, so wait for the prior process to release its singleton.
  await new Promise(resolve=>setTimeout(resolve,1000));
  await run(path.join(root,'LingPet.exe'),['--dashboard',...testArguments]);
  for(let i=0;i<100;i++){await new Promise(resolve=>setTimeout(resolve,200));endpoint=await readEndpoint(dir);if(endpoint)try{const health=await request(endpoint,'/health');if(health.distribution==='desktop')break;}catch{}}
  assert.equal((await request(endpoint,'/health')).distribution,'desktop');
  if(process.argv.includes('--upgrade-running')){
    assert.ok(setup,'running upgrade needs the native installer');const oldPid=endpoint.pid;
    // A persistent MCP connection keeps the launcher mapped while the core quits.
    // Append harmless overlay bytes so an identical-file optimization cannot hide the regression.
    const bridgeFile=path.join(root,'LingPetBridge.exe');await appendFile(bridgeFile,'upgrade regression');
    const bridge=spawn(bridgeFile,['mcp','00000000-0000-4000-8000-000000000001'],{env,windowsHide:true,stdio:'pipe'});
    bridge.stderr.resume();bridge.stdout.resume();
    try{
    await new Promise((resolve,reject)=>{bridge.once('error',reject);setTimeout(resolve,500);});
    assert.equal(bridge.exitCode,null);assert.doesNotThrow(()=>process.kill(bridge.pid,0));
    await writeFile(path.join(dir,'upgrade-keeps-content.txt'),'keep downloaded pet');
    await run(path.resolve(setup),['--silent','--root',root,...(process.argv.includes('--internal-data')?[]:['--data',dir]),...testArguments]);
    assert.equal(bridge.exitCode,null,'upgrade preserves the existing Agent connection process');
    assert.deepEqual(await readFile(bridgeFile),await readFile(path.join(payload,'LingPetBridge.exe')));
    }finally{bridge.stdin.end();await new Promise(resolve=>{if(bridge.exitCode!==null)return resolve();bridge.once('exit',resolve);setTimeout(()=>{bridge.kill();resolve();},3000).unref();});}
    assert.throws(()=>process.kill(oldPid,0),{code:'ESRCH'});
    assert.equal(await readFile(path.join(dir,'upgrade-keeps-content.txt'),'utf8'),'keep downloaded pet');
    await new Promise(resolve=>setTimeout(resolve,1000));await run(path.join(root,'LingPet.exe'),['--dashboard',...testArguments]);
    for(let i=0;i<100;i++){await new Promise(resolve=>setTimeout(resolve,200));endpoint=await readEndpoint(dir);if(endpoint)try{if((await request(endpoint,'/health')).distribution==='desktop')break;}catch{}}
    assert.equal((await request(endpoint,'/health')).distribution,'desktop');console.log('Native installer gracefully closed the running desktop and upgraded it.');
  }
  const manager=new IntegrationManager({dir,root:path.join(root,'versions',pkg.version,'resources/app'),bridge:path.join(root,'LingPetBridge.exe'),version:pkg.version,home:path.join(work,'home')});
  const item=await manager.install({source:'cursor',config:path.join(work,'home/.cursor')});
  const started=performance.now();const result=await run(path.join(root,'LingPetBridge.exe'),['hook',item.id,'beforeSubmitPrompt'],JSON.stringify({conversation_id:'isolated-test',generation_id:'turn-1',prompt:'DO-NOT-FORWARD'}));const hookMs=Math.round(performance.now()-started);
  assert.deepEqual(JSON.parse(result.stdout),{continue:true});
  const health=await request(endpoint,'/health');assert.equal(health.sessions,1);
  const pets=await request(endpoint,'/pets');assert.equal(pets.pets[0].current.state,'thinking');
  await assert.rejects(request(endpoint,'/runtime/update',{root:payload}),/独立安装程序/);
  // Exercise MCP through the compiled launcher and private Node, without system Node in PATH.
  const initialized=JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'isolated-smoke',version:'1'}}})+'\n';
  const mcp=await run(path.join(root,'LingPetBridge.exe'),['mcp',item.id],initialized);assert.match(mcp.stdout,/'serverInfo'|"serverInfo"/);
  let storageMoved=false;
  if(process.argv.includes('--move-data')){
    const target=path.join(work,'迁移后 内容');await writeFile(path.join(dir,'downloaded-before-move.txt'),'downloaded pet');
    await run(path.join(root,'LingPetMaintenance.exe'),['--move-data',target]);
    for(let i=0;i<300;i++){try{const result=JSON.parse(await readFile(path.join(root,'storage-move-result.json'),'utf8'));if(!result.ok)throw Error(result.error);storageMoved=result.moved===true;break;}catch(error){if(error.code!=='ENOENT')throw error;}await new Promise(resolve=>setTimeout(resolve,200));}
    assert.equal(storageMoved,true);assert.equal(await readFile(path.join(target,'downloaded-before-move.txt'),'utf8'),'downloaded pet');
    for(let i=0;i<100;i++){await new Promise(resolve=>setTimeout(resolve,200));endpoint=await readEndpoint(dir);if(endpoint)try{await request(endpoint,'/health');break;}catch{}}
    const afterMove=await run(path.join(root,'LingPetBridge.exe'),['hook',item.id,'beforeSubmitPrompt'],JSON.stringify({conversation_id:'isolated-test',generation_id:'after-move'}));assert.deepEqual(JSON.parse(afterMove.stdout),{continue:true});
    const reconnectedMcp=await run(path.join(root,'LingPetBridge.exe'),['mcp',item.id],initialized);assert.match(reconnectedMcp.stdout,/'serverInfo'|"serverInfo"/);
  }
  await request(endpoint,'/quit',{});await new Promise(resolve=>setTimeout(resolve,1000));
  const offline=await run(path.join(root,'LingPetBridge.exe'),['hook',item.id,'beforeSubmitPrompt'],JSON.stringify({conversation_id:'isolated-test',generation_id:'turn-2'}));assert.deepEqual(JSON.parse(offline.stdout),{continue:true});
  assert.equal(await readEndpoint(dir),null,'Hook must not revive the desktop');
  await manager.remove(item.id);
  const hosts=[];
  const hostPath=process.env.PATH;
  try{
    if(process.argv.includes('--private-pnpm'))process.env.PATH=env.Path;
    for(const source of ['codex','dsh']){const executable=process.argv.find(arg=>arg.startsWith('--'+source+'='))?.slice(source.length+3);if(executable){
      const config=path.join(work,source+'-home');
      if(source==='dsh'&&process.argv.includes('--private-pnpm')){const profile=path.join(config,'profiles/web');await mkdir(profile,{recursive:true});await writeFile(path.join(profile,'package.json'),JSON.stringify({name:'isolated-dsh',private:true,dsh:{profile:{bundles:[]}}}));await writeFile(path.join(profile,'pnpm-workspace.yaml'),'packages:\n  - .\nautoInstallPeers: false\n');}
      const installedHost=await manager.install({source,config,executable,profile:'web'});await manager.remove(installedHost.id);hosts.push(source);
    }}
  }finally{process.env.PATH=hostPath;}
  let uninstalled=false;
  if(process.argv.includes('--uninstall')){
    await writeFile(path.join(dir,'downloaded-pet.txt'),'keep my downloaded content');
    await run(path.join(root,'LingPetMaintenance.exe'),[]);
    for(let i=0;i<120;i++){try{await access(path.join(root,'active.json'));}catch{try{await access(path.join(root,'LingPet.exe'));}catch{uninstalled=true;break;}}await new Promise(resolve=>setTimeout(resolve,200));}
    assert.equal(uninstalled,true,'maintenance removes program files while preserving data');await access(path.join(dir,'settings.json'));
    assert.equal(await readFile(path.join(dir,'downloaded-pet.txt'),'utf8'),'keep my downloaded content');
    if(process.argv.includes('--reinstall-after-uninstall')){
      await installDesktop({payload,root,dir,launchArguments:testArguments});
      await run(path.join(root,'LingPetMaintenance.exe'),[]);
      let removedAgain=false;for(let i=0;i<120;i++){try{await access(path.join(root,'LingPet.exe'));}catch{removedAgain=true;break;}await new Promise(resolve=>setTimeout(resolve,200));}
      assert.equal(removedAgain,true);assert.equal(await readFile(path.join(dir,'downloaded-pet.txt'),'utf8'),'keep my downloaded content');
    }
  }
  const resultPath=path.join(work,'result.json');await writeFile(resultPath,JSON.stringify({ok:true,version:pkg.version,installed,hookMs,privateRuntime:true,sessionObserved:true,mcpInitialized:true,exitNotRevived:true,storageMoved,hosts,uninstalled,work},null,2));console.log(await readFile(resultPath,'utf8'));
}finally{const current=await readEndpoint(dir);if(current)await request(current,'/quit',{}).catch(()=>{});}
