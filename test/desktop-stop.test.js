import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import path from 'node:path';
import {stopDesktopForUpgrade} from '../src/maintenance/desktop-stop.js';

async function fixture(t){
  const base=path.resolve('.test-data-desktop-first');await mkdir(base,{recursive:true});
  const dir=await mkdtemp(path.join(base,'stop-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;
}
async function service(t,dir,{health={name:'board-ai-pet',distribution:'desktop'},quitStatus=200}={}){
  let quits=0;const token='2'.repeat(64),server=createServer((req,res)=>{
    assert.equal(req.headers.authorization,'Bearer '+token);res.setHeader('Content-Type','application/json');
    if(req.url==='/health')res.end(JSON.stringify(health));
    else{quits++;res.statusCode=quitStatus;res.end(JSON.stringify({ok:quitStatus===200,error:'refused'}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  await writeFile(path.join(dir,'endpoint.json'),JSON.stringify({version:1,pid:process.pid,url:'http://127.0.0.1:'+server.address().port,token}));
  return ()=>quits;
}
test('upgrade requests graceful shutdown and waits until the desktop process finishes saving',async t=>{
  const dir=await fixture(t);
  const child=spawn(process.execPath,['-e',String.raw`
    const http=require('http'),fs=require('fs'),path=require('path'),dir=process.argv[1],token='2'.repeat(64);
    const server=http.createServer((req,res)=>{
      if(req.headers.authorization!=='Bearer '+token){res.writeHead(403);res.end();return;}
      res.setHeader('Content-Type','application/json');
      if(req.url==='/health')res.end(JSON.stringify({name:'board-ai-pet',distribution:'desktop'}));
      else if(req.url==='/quit'){res.end(JSON.stringify({ok:true}));setTimeout(()=>{fs.writeFileSync(path.join(dir,'saved.txt'),'saved');process.exit(0);},150);}
    });server.listen(0,'127.0.0.1',()=>{fs.writeFileSync(path.join(dir,'endpoint.json'),JSON.stringify({version:1,pid:process.pid,url:'http://127.0.0.1:'+server.address().port,token}));console.log('ready');});
  `,dir],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill();});
  const exited=new Promise(resolve=>child.once('exit',resolve));
  await new Promise((resolve,reject)=>{child.once('error',reject);child.stdout.once('data',resolve);});
  await stopDesktopForUpgrade(dir,{timeoutMs:5000,intervalMs:20});
  assert.equal(await exited,0);assert.equal(await readFile(path.join(dir,'saved.txt'),'utf8'),'saved');
});
test('upgrade does not close foreign or legacy plugin services',async t=>{
  const dir=await fixture(t),quits=await service(t,dir,{health:{name:'board-ai-pet',distribution:'plugin'}});
  await assert.rejects(stopDesktopForUpgrade(dir),/不是独立安装/);assert.equal(quits(),0);
});
test('upgrade stops when a desktop acknowledges quit but keeps running',async t=>{
  const dir=await fixture(t),quits=await service(t,dir);
  await assert.rejects(stopDesktopForUpgrade(dir,{timeoutMs:40,intervalMs:10}),/尚未退出，未继续安装/);assert.equal(quits(),1);
});
test('upgrade stops when graceful shutdown is refused',async t=>{
  const dir=await fixture(t);await service(t,dir,{quitStatus:409});
  await assert.rejects(stopDesktopForUpgrade(dir),/未能正常退出，未继续安装/);
});
test('upgrade permits a stopped desktop with a stale endpoint',async t=>{
  const dir=await fixture(t);await writeFile(path.join(dir,'endpoint.json'),JSON.stringify({version:1,pid:2147483647,url:'http://127.0.0.1:1',token:'2'.repeat(64)}));
  await stopDesktopForUpgrade(dir);
});
