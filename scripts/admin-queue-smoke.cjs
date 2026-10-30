const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
app.whenReady().then(async()=>{
 const now=new Date().toISOString();
 const queue={cooldownSeconds:10,intervalSeconds:86400,updatedAt:now,validations:[
  {id:'one',name:'雪狐',version:'1.1.0',repository:'alice/pets',status:'queued',position:1,origin:'定时更新',createdAt:now},
  {id:'two',name:'橘猫',version:'2.0.0',repository:'alice/pets',status:'validating',position:0,origin:'匿名投稿（身份未验证）',createdAt:now}
 ],checks:[
  {id:'repo',kind:'discovery',name:'发现新版本',repository:'alice/pets',status:'running',position:0},
  {id:'source',kind:'source',name:'雪狐',version:'1.0.0',repository:'alice/pets',status:'due',position:1,missing:2,error:'GitHub 返回 404',lastCheck:now,nextCheck:now}
 ]};
 const requests=[];
 const server=http.createServer(async(req,res)=>{try{
  requests.push(req.url);
  const routes={'/api/me':{admin:true,user:'admin'}, '/api/admin/versions':[], '/api/admin/stats?days=14':{version:'0.4.23',submissions:{},totals:{},daily:[],submissionTotal:0},'/api/admin/audit':[], '/api/admin/queue':queue};
  if(req.url in routes){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(routes[req.url]));return;}
  const url=new URL(req.url,'http://localhost');const file=path.join(process.cwd(),'market/web',url.pathname==='/'?'admin.html':url.pathname);
  res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
 }catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const win=new BrowserWindow({show:false,width:1440,height:1050,webPreferences:{backgroundThrottling:false}});
 const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error'&&!e.message.includes('404'))errors.push(e.message);});
 const read=script=>win.webContents.executeJavaScript(script);
 await win.loadURL('http://127.0.0.1:'+server.address().port);
 for(let i=0;i<100;i++){if(await read("document.querySelectorAll('#validationQueueRows tr').length===2"))break;await new Promise(r=>setTimeout(r,50));}
 await read("document.querySelector('[data-admin-panel=queue]').click()");
 assert.equal(await read("document.getElementById('admin-queue').hidden"),false);
 assert.equal(await read("document.querySelector('#validationQueueRows tr').textContent.includes('橘猫')"),true);
 assert.equal(await read("document.querySelectorAll('#sourceQueueRows tr').length"),2);
 assert.equal(await read("document.getElementById('sourceQueueRows').textContent.includes('2 / 3')"),true);
 assert.equal(await read("document.getElementById('queuePolicy').textContent.includes('24 小时')"),true);
 assert.equal(await read("document.documentElement.scrollWidth<=innerWidth"),true);
 await fs.mkdir('artifacts/admin-queue-ui',{recursive:true});
 await new Promise(r=>setTimeout(r,250));
 await fs.writeFile('artifacts/admin-queue-ui/queue-desktop.png',(await win.webContents.capturePage()).toPNG());
 queue.validations=[];queue.checks=[];
 await read("document.getElementById('refreshAdmin').click()");
 for(let i=0;i<100;i++){if(await read("document.getElementById('validationQueueRows').textContent.includes('暂无')"))break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(await read("document.getElementById('validationQueueRows').textContent.includes('暂无')"),true);
 await read("document.querySelector('[data-admin-panel=releases]').click()");
 assert.equal(await read("document.getElementById('packageUploadForm')===null"),true);
 assert.equal(await read("document.querySelector('#admin-releases a').href"),'https://github.com/fourzkw/lingpet/releases/latest');
 assert.equal(requests.some(p=>p.startsWith('/api/admin/releases')),false);
 await win.loadURL('http://127.0.0.1:'+server.address().port+'/index.html');
 for(let i=0;i<100;i++){if(await read("!!document.getElementById('download-desktop')"))break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(await read("document.querySelectorAll('#downloadCards .download-card').length"),1);
 assert.equal(await read("document.getElementById('download-desktop').getAttribute('href')"),'/downloads/desktop');
 assert.equal(await read("document.querySelector('#download-dsh,#download-cursor,#download-codex')===null"),true);
 await read("document.getElementById('downloads').scrollIntoView({behavior:'instant'})");
 await new Promise(r=>setTimeout(r,300));
 await fs.writeFile('artifacts/admin-queue-ui/desktop-release-download.png',(await win.webContents.capturePage()).toPNG());
 assert.deepEqual(errors,[]);
 win.destroy();await new Promise(r=>server.close(r));console.log('Admin queue UI smoke passed');app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
