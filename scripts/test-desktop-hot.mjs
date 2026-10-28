import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,cp,readFile,writeFile,appendFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {PACKAGE_ROOT} from '../src/paths.js';
import {readEndpoint,request} from '../src/bridge-client.js';
const require=createRequire(import.meta.url),electron=require('electron');
const run=Date.now(),dir=path.join(PACKAGE_ROOT,'.test-data','hot-desktop-'+run),candidate=path.join(PACKAGE_ROOT,'.test-data','hot-release-'+run);
await mkdir(candidate,{recursive:true});
for(const name of ['src','desktop','assets','bin','package.json'])await cp(path.join(PACKAGE_ROOT,name),path.join(candidate,name),{recursive:true});
const env={...process.env,BOARD_PET_DATA_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;delete env.BOARD_PET_SMOKE;
let child,endpoint;const results=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(predicate=()=>true){for(let i=0;i<160;i++){const e=await readEndpoint(dir);if(e){try{const h=await request(e,'/health');if(predicate(e,h))return{e,h};}catch{}}await sleep(200);}throw new Error('桌宠启动/重启超时');}
try{
  child=spawn(electron,[path.join(PACKAGE_ROOT,'desktop','main.js'),'--dashboard'],{env,windowsHide:true,stdio:'ignore'});
  ({e:endpoint}=await ready());const originalPid=endpoint.pid;
  await request(endpoint,'/register',{instanceId:'hot-test'});
  await request(endpoint,'/event',{version:1,instanceId:'hot-test',sessionId:'waiting',turn:1,state:'approval',seq:1});
  await appendFile(path.join(candidate,'desktop','settings.html'),'\n<!-- hot-frontend-marker -->\n');
  const pkg=JSON.parse(await readFile(path.join(candidate,'package.json'),'utf8'));let parts=pkg.version.split('.').map(Number);parts[2]++;pkg.version=parts.join('.');await writeFile(path.join(candidate,'package.json'),JSON.stringify(pkg));
  assert.equal((await request(endpoint,'/runtime/update',{root:candidate},30000)).action,'reloaded');
  let status=await ready();assert.equal(status.e.pid,originalPid);assert.equal(status.h.state,'approval');results.push('frontend reload keeps process and waiting state');
  await appendFile(path.join(candidate,'desktop','main.js'),'\n// hot-backend-marker\n');
  parts=pkg.version.split('.').map(Number);parts[2]++;pkg.version=parts.join('.');await writeFile(path.join(candidate,'package.json'),JSON.stringify(pkg));
  assert.equal((await request(endpoint,'/runtime/update',{root:candidate},30000)).action,'restarting');
  status=await ready((e,h)=>e.pid!==originalPid&&h.release?.version===pkg.version);endpoint=status.e;
  assert.equal(status.h.state,'approval');assert.equal(status.h.sessions,1);results.push('backend update relaunches only pet and restores waiting session');
  assert.equal((await request(endpoint,'/runtime/update',{root:PACKAGE_ROOT},5000)).action,'ignored');results.push('older plugin cannot downgrade newer runtime');
  const goodVersion=pkg.version,goodPid=endpoint.pid;parts[2]++;pkg.version=parts.join('.');await writeFile(path.join(candidate,'package.json'),JSON.stringify(pkg));
  await writeFile(path.join(candidate,'desktop/main.js'),"import {app} from 'electron';await app.whenReady();app.quit();\n");
  assert.equal((await request(endpoint,'/runtime/update',{root:candidate},30000)).action,'restarting');
  status=await ready((e,h)=>e.pid!==goodPid&&h.release?.version===goodVersion);endpoint=status.e;
  assert.equal(status.h.state,'approval');assert.equal((await request(endpoint,'/runtime/update',{root:candidate},30000)).reason,'failed-release');results.push('failed upgrade rolls back and cannot repeatedly replace the healthy runtime');
  const bad=await fetch(endpoint.url+'/runtime/update',{method:'POST',headers:{Authorization:`Bearer ${endpoint.token}`},body:JSON.stringify({root:'relative'})});assert.equal(bad.status,400);results.push('invalid update rejected');
  console.log('PASS desktop hot update:',results.join('; '));
}finally{
  try{const e=await readEndpoint(dir);if(e)await request(e,'/quit',{});}catch{}child?.kill();
  await mkdir(path.join(PACKAGE_ROOT,'artifacts'),{recursive:true});await writeFile(path.join(PACKAGE_ROOT,'artifacts','hot-desktop-results.json'),JSON.stringify({results},null,2));
}
