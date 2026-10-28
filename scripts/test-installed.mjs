import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {readEndpoint,request} from '../src/bridge-client.js';
import {PACKAGE_ROOT} from '../src/paths.js';
const manifest=process.env.DSH_PACKAGE_PATH||path.join(process.env.APPDATA,'npm','node_modules','@deepseek-ai','dsh','package.json');
const require=createRequire(manifest),cli=path.join(path.dirname(manifest),'lib','bin.js');
const home=path.join(PACKAGE_ROOT,'.test-data','dsh-install'),dir=path.join(PACKAGE_ROOT,'.test-data','fresh-runtime');
assert.ok(existsSync(path.join(home,'profiles','web','package.json')),'先安装插件到隔离profile');
const env={...process.env,DSH_HOME:home,BOARD_PET_DATA_DIR:dir};delete env.BOARD_PET_SMOKE;
let log='',endpoint,child;
try{
  child=spawn(process.execPath,[cli,'web','--no-open','--port','31781'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',data=>log+=data);child.stderr.on('data',data=>log+=data);
  for(let i=0;i<180;i++){
    const candidate=await readEndpoint(dir);
    if(candidate){try{await request(candidate,'/health');endpoint=candidate;break;}catch{}}
    if(child.exitCode!==null)throw new Error('DSH启动提前结束:\n'+log.slice(-5000));
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(endpoint,'安装后DSH未在限定时间内自动启动桌宠。\n'+log.slice(-5000));
  await new Promise(resolve=>setTimeout(resolve,2500));
  assert.ok(!/\[board-ai-pet\].*(?:失败|Error|invalid)|cannot resolve.*dsh-board-pet/i.test(log),log.slice(-5000));
  // 回归：浏览器侧的客户端模块必须真的出现在 __DSH_BOOT__ 里，否则设置界面
  // 不会出现「桌宠」页签（挂载名不是裸包名时 dsh-client-modules 会静默跳过）。
  const token=/[?&]token=([^\s]+)/.exec(log)?.[1];
  assert.ok(token,'DSH启动日志缺少访问令牌');
  const origin='http://127.0.0.1:31781';
  const auth=await fetch(`${origin}/?token=${encodeURIComponent(token)}`,{redirect:'manual'});
  const setCookie=auth.headers.getSetCookie?.()[0]??auth.headers.get('set-cookie')??'';
  const cookie=setCookie.split(';')[0];
  const page=await (await fetch(`${origin}/`,{headers:cookie?{cookie}:{}})).text();
  assert.ok(page.includes('"id":"dsh-board-pet"'),'插件客户端bundle未进入__DSH_BOOT__：检查cordis.patch.yml的挂载名是否为裸包名');
  // 回归：设置页的启停按钮依赖宿主注册的 /board-pet 路由，必须同源可用。
  const headers=cookie?{cookie}:{};
  const statusResponse=await fetch(`${origin}/board-pet/status`,{headers});
  assert.equal(statusResponse.status,200,'管理路由 /board-pet/status 不可用');
  const status=await statusResponse.json();
  assert.equal(status.ok,true,'管理路由返回了无效状态');
  const crossOrigin=await fetch(`${origin}/board-pet/stop`,{method:'POST',headers:{...headers,'x-board-pet':'1',origin:'http://evil.example'}});
  assert.equal(crossOrigin.status,403,'管理路由必须拒绝跨源请求');
  console.log('PASS: installed tarball → real DSH web profile → plugin activation → client bundle in __DSH_BOOT__ → /board-pet management routes → per-user cached runtime → desktop endpoint. No model call.');
}finally{
  child?.kill();
  if(endpoint){try{process.kill(endpoint.pid);}catch{}}
  await mkdir(path.join(PACKAGE_ROOT,'artifacts'),{recursive:true});await writeFile(path.join(PACKAGE_ROOT,'artifacts','installed-dsh.log'),log.replace(/([?&]token=)[^\s]+/g,'$1[redacted]'));
}
