import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,access} from 'node:fs/promises';
import {createServer} from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=await mkdtemp(path.join(process.cwd(),'.test-data-market-server-'));
const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const url='http://127.0.0.1:'+port,exe=path.resolve('artifacts/lingpet-market-test.exe');
const baseEnv={...process.env,LINGPET_DATA_DIR:root,LINGPET_LISTEN:'127.0.0.1:'+port,LINGPET_PUBLIC_URL:url,LINGPET_DEV_MODE:'true',LINGPET_ADMIN_USER:'admin',LINGPET_ADMIN_PASSWORD_HASH:''};
let child,logs='',cookie='';
const pause=()=>new Promise(resolve=>setTimeout(resolve,100));
async function start(env=baseEnv){
 child=spawn(exe,[],{env,windowsHide:true,stdio:['ignore','ignore','pipe']});child.stderr.on('data',b=>logs+=b);
 for(let i=0;i<100;i++){try{const r=await fetch(url+'/api/health');if(r.ok)return;}catch{}if(child.exitCode!==null)throw Error('Server startup failed: '+logs);await pause();}
 throw Error('Startup timed out: '+logs);
}
async function stop(){if(!child||child.exitCode!==null)return;const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}
async function post(route,body){
 const r=await fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:url,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 const next=r.headers.get('set-cookie');if(next)cookie=next.split(';')[0];return {status:r.status,body:await r.json()};
}
try{
 await start();const password=(await readFile(path.join(root,'initial-admin-password.txt'),'utf8')).trim();assert.equal(password.length,48);assert.ok(!logs.includes(password));
 assert.equal((await post('/auth/admin',{username:'admin',password})).body.mustChangePassword,true);
 let response=await fetch(url+'/api/admin/versions',{headers:{Cookie:cookie}});assert.equal(response.status,403);
 const newPassword='persistent-smoke-password-123456';
 assert.equal((await post('/auth/password',{currentPassword:password,newPassword,confirmPassword:newPassword})).status,200);
 await assert.rejects(access(path.join(root,'initial-admin-password.txt')));
 assert.equal((await post('/auth/username',{newUsername:'market-owner',currentPassword:newPassword})).status,200);
 await stop();cookie='';await start({...baseEnv,LINGPET_ADMIN_USER:'obsolete-env-user',LINGPET_ADMIN_PASSWORD_HASH:'obsolete-env-hash'});
 assert.equal((await post('/auth/admin',{username:'admin',password:newPassword})).status,401);
 assert.equal((await post('/auth/admin',{username:'market-owner',password:newPassword})).status,200);
 await stop();cookie='';
 const resetPassword='reset-through-stdin-password-123';
 const reset=spawn(exe,['--reset-admin-password'],{env:baseEnv,windowsHide:true,stdio:['pipe','ignore','pipe']});let resetError='';reset.stderr.on('data',b=>resetError+=b);reset.stdin.end(resetPassword);
 const resetCode=await new Promise((resolve,reject)=>{reset.once('exit',resolve);reset.once('error',reject);});assert.equal(resetCode,0,resetError);
 await start();assert.equal((await post('/auth/admin',{username:'market-owner',password:resetPassword})).status,200);
 console.log(JSON.stringify({valid:true,checks:['unique bootstrap password','mandatory first password change','initial password file removed','binary restart preserves password despite obsolete environment','local administrator password recovery']}));
}finally{
 await stop();assert.equal(path.dirname(root),process.cwd());assert.ok(path.basename(root).startsWith('.test-data-market-server-'));await rm(root,{recursive:true,force:true});
}
