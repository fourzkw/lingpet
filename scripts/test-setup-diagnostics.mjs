// Exercise the native installer's UTF-8 error reader without touching an installed app.
import {mkdtemp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const setup=path.resolve(process.argv[2]),base=path.resolve('.test-data-desktop-first-smoke');
await mkdir(base,{recursive:true});const work=await mkdtemp(path.join(base,'setup-diagnostics-'));
const root=path.join(work,'中文 程序'),dir=path.join(root,'data'),temp=path.join(work,'temp');
await mkdir(dir,{recursive:true});await mkdir(temp,{recursive:true});
const active=JSON.stringify({format:1,active:'0.7.1'}),settings=JSON.stringify({sentinel:'保留用户设置'});
await writeFile(path.join(root,'active.json'),active);
await writeFile(path.join(root,'desktop-location.json'),JSON.stringify({format:1,root,dataDir:dir,version:'0.7.1'}));
await writeFile(path.join(dir,'desktop-install.json'),JSON.stringify({format:1,root,dataDir:dir,version:'0.7.1'}));
await writeFile(path.join(dir,'settings.json'),settings);
const token='1'.repeat(64),server=createServer((req,res)=>{assert.equal(req.url,'/health');assert.equal(req.headers.authorization,'Bearer '+token);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({distribution:'desktop'}));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
  await writeFile(path.join(dir,'endpoint.json'),JSON.stringify({version:1,url:'http://127.0.0.1:'+server.address().port,token}));
  const env={...process.env,TEMP:temp,TMP:temp};delete env.BOARD_PET_DATA_DIR;delete env.NODE_OPTIONS;delete env.ELECTRON_RUN_AS_NODE;
  const code=await new Promise((resolve,reject)=>{const child=spawn(setup,['--silent','--root',root],{env,windowsHide:true,stdio:'ignore'});const timeout=setTimeout(()=>{child.kill();reject(Error('Installer timed out'));},60000);child.on('error',reject);child.on('exit',code=>{clearTimeout(timeout);resolve(code);});});
  assert.equal(code,1);
  const logs=path.join(temp,'LingPet-Setup-Logs'),files=await readdir(logs);assert.equal(files.length,1);
  const log=await readFile(path.join(logs,files[0]),'utf8');
  assert.ok(log.includes('该服务不是独立安装的灵伴，未自动关闭。请手动退出后重试安装。'));
  assert.ok(log.includes('安装目录：'+root));assert.ok(!log.includes('\uFFFD'));
  assert.equal(await readFile(path.join(root,'active.json'),'utf8'),active);
  assert.equal(await readFile(path.join(dir,'settings.json'),'utf8'),settings);
  console.log(JSON.stringify({passed:true,utf8Error:true,existingInstallationPreserved:true,work}));
}finally{await new Promise(resolve=>server.close(resolve));}
