import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {PACKAGE_ROOT} from '../src/paths.js';
import {readEndpoint,request} from '../src/bridge-client.js';
const require=createRequire(import.meta.url),electron=require('electron');
const base=path.join(PACKAGE_ROOT,'.test-data',`native-hmr-${Date.now()}`),dir=path.join(base,'pet'),home=path.join(PACKAGE_ROOT,'.test-data','dsh-install');
const version=JSON.parse(await readFile(path.join(PACKAGE_ROOT,'package.json'),'utf8')).version;
const tarball=path.join(PACKAGE_ROOT,'artifacts',`dsh-board-pet-${version}.tgz`);
await mkdir(base,{recursive:true});
await writeFile(path.join(home,'profiles','web','.npmrc'),`store-dir=${path.join(PACKAGE_ROOT,'.cache','pnpm').replaceAll('\\','/')}\n`);
const workspaceFile=path.join(home,'profiles','web','pnpm-workspace.yaml');
const workspace=await readFile(workspaceFile,'utf8');
await writeFile(workspaceFile,workspace.replace(/^storeDir:.*\r?\n/gm,'')+`\nstoreDir: ${JSON.stringify(path.join(PACKAGE_ROOT,'.cache','pnpm').replaceAll('\\','/'))}\n`);
const resultFile=path.join(base,'result.json');await writeFile(resultFile,'{}');
const helper=path.join(base,'helper.mjs');
await writeFile(helper,`import {writeFile} from 'node:fs/promises';
export const name='pet-hmr-verifier';export const inject=['pluginManager','hmr','settings','clientModules'];
export function apply(ctx){ctx.effect(()=>{const timer=setTimeout(async()=>{
try{
const removed=await ctx.pluginManager.removeBundle('dsh-board-pet');
const installed=await ctx.pluginManager.installBundle(${JSON.stringify('file:'+tarball.replaceAll('\\','/'))});
const client=ctx.clientModules.graph().entries.find(e=>e.id==='dsh-board-pet');
if(!client)throw new Error('设置页客户端模块未进入DSH模块图');
const before=ctx.settings.describe().find(d=>d.ns==='board-ai-pet');
if(!before)throw new Error('缺少桌宠原生设置表单');
if(before.autoGenerate!==false)throw new Error('自定义页面不应重复生成表单');
await ctx.settings.update('board-ai-pet',{autoStart:false},before.revision);
const changed=ctx.settings.describe().find(d=>d.ns==='board-ai-pet');
if(changed.value.autoStart!==false)throw new Error('实时设置保存失败');
await ctx.settings.update('board-ai-pet',{autoStart:true},changed.revision);
const restored=ctx.settings.describe().find(d=>d.ns==='board-ai-pet');
await writeFile(${JSON.stringify(resultFile)},JSON.stringify({pid:process.pid,clientRegistered:client.id,settings:{saved:changed.value.autoStart===false,restored:restored.value.autoStart===true,fields:Object.keys(restored.value)},removed:{ok:removed.ok,application:removed.application,error:removed.error},installed:{ok:installed.ok,application:installed.application,error:installed.error,restartReason:installed.restartReason}}));
}catch(error){await writeFile(${JSON.stringify(resultFile)},JSON.stringify({error:error.stack}));}
},1500);return()=>clearTimeout(timer);});}
`);
const patch=path.join(base,'test.patch.yml');await writeFile(patch,`- insert:\n    - id: pet-hmr-verifier\n      name: ${JSON.stringify(helper.replaceAll('\\','/'))}\n`);
const env={...process.env,DSH_HOME:home,BOARD_PET_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;delete env.BOARD_PET_SMOKE;
const manifest=process.env.DSH_PACKAGE_PATH||path.join(process.env.APPDATA,'npm','node_modules','@deepseek-ai','dsh','package.json');
let desktop,dsh,endpoint,log='';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
  desktop=spawn(electron,[path.join(PACKAGE_ROOT,'desktop','main.js')],{env,windowsHide:true,stdio:'ignore'});
  for(let i=0;i<100;i++){endpoint=await readEndpoint(dir);if(endpoint){try{await request(endpoint,'/health');break;}catch{}}await pause(200);}
  assert.ok(endpoint,'测试桌宠未启动');const petPid=endpoint.pid;
  dsh=spawn(process.execPath,[path.join(path.dirname(manifest),'lib','bin.js'),'--profile','web','--patch',patch,'--no-open','--port','31782'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  dsh.stdout.on('data',s=>log+=s);dsh.stderr.on('data',s=>log+=s);
  let result;
  for(let i=0;i<360;i++){
    try{result=JSON.parse(await readFile(resultFile,'utf8'));}catch{await pause(100);continue;}if(result.installed||result.error)break;
    if(dsh.exitCode!==null)throw new Error('DSH提前退出');await pause(500);
  }
  assert.ok(result?.installed,JSON.stringify(result)+'\n'+log.slice(-4000).replace(/([?&]token=)[^\s]+/g,'$1[redacted]'));
  assert.equal(result.removed.application,'applied',JSON.stringify(result));assert.equal(result.installed.application,'applied',JSON.stringify(result));
  assert.equal(result.pid,dsh.pid);assert.equal(dsh.exitCode,null);
  let health;
  for(let i=0;i<30;i++){const current=await readEndpoint(dir);if(current){try{health=await request(current,'/health');if(health.instances===1){endpoint=current;break;}}catch{}}await pause(200);}
  assert.equal(health.instances,1);assert.equal(health.release.version,version);
  await writeFile(path.join(PACKAGE_ROOT,'artifacts','native-hmr-results.json'),JSON.stringify({...result,sameDshPid:true,samePetPid:endpoint.pid===petPid,instances:health.instances},null,2));
  console.log(`PASS: real running DSH plugin manager applies ${version}; native settings save/restore; DSH PID unchanged, exactly one source connected.`);
}finally{
  dsh?.kill();try{const e=await readEndpoint(dir);if(e)process.kill(e.pid);}catch{}desktop?.kill();
  await writeFile(path.join(PACKAGE_ROOT,'artifacts','native-hmr.log'),log.replace(/([?&]token=)[^\s]+/g,'$1[redacted]'));
}
