const {app,BrowserWindow}=require('electron');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/site-brand-smoke');
const records=[{id:'a'.repeat(48),status:'approved',repository:'lingpet/whale',tag:'v1.0.0',size:12*1048576,pet:{name:'鲸鱼娘',author:'LingPet',version:'1.0.0',description:'安静陪你思考，也回应每一次轻触。'}},{id:'b'.repeat(48),status:'approved',repository:'lingpet/dragon',tag:'v1.0.0',size:16*1048576,pet:{name:'白羽龙姬',author:'LingPet',version:'1.0.0',description:'把一点幻想，留在日常的桌面上。'}}];
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
let win,server;const checks=[],failures=[];const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{try{
 await app.whenReady();await fs.mkdir(out,{recursive:true});
 server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1');const json=v=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));};
  if(url.pathname==='/api/downloads')return json({downloads:['dsh','cursor','codex'].map(id=>({id,available:true,version:'0.6.1',size:11*1048576,sha256:'e'.repeat(64),url:'/downloads/'+id}))});
  if(url.pathname==='/api/pets')return json(url.searchParams.get('q')==='nope'?[]:records);
  if(url.pathname==='/api/me')return json({admin:false});
  if(url.pathname.endsWith('/install'))return json({url:'https://github.com/lingpet/example/releases/download/v1/example.petpack'});
  let file=url.pathname==='/'?'index.html':url.pathname==='/market'?'market.html':url.pathname==='/admin'?'admin.html':url.pathname.slice(1);
  if(url.pathname.includes('/preview/cover.png'))file=url.pathname.includes(records[0].id)?'deepseek.png':'white-dragon.png';
  if(!/^[a-zA-Z0-9_.-]+$/.test(file)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");res.end(await fs.readFile(path.join(root,'market/web',file)));
 }catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 win=new BrowserWindow({width:1360,height:1000,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const wc=win.webContents;const snap=async name=>{await wc.executeJavaScript('(async()=>{await Promise.all([...document.images].map(async im=>{im.loading="eager";try{await im.decode();}catch{}}));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()');await fs.writeFile(path.join(out,name+'.png'),(await wc.capturePage()).toPNG());};
 const checkLayout=async()=>assert.ok(await wc.executeJavaScript('document.documentElement.scrollWidth<=innerWidth'),'no horizontal overflow '+wc.getURL());
 for(const theme of ['paper-journal','pixel-workshop','warm-night','terminal-pulse']){
  await win.loadURL(origin);await wc.executeJavaScript(`(()=>{const s=document.getElementById('siteTheme');s.value=${JSON.stringify(theme)};s.dispatchEvent(new Event('change'));})()`);await wait(180);
  assert.equal(await wc.executeJavaScript('document.documentElement.dataset.theme'),theme);await checkLayout();await snap(theme+'-home');
  await win.loadURL(origin+'/market');await wait(200);assert.equal(await wc.executeJavaScript('document.documentElement.dataset.theme'),theme);assert.equal(await wc.executeJavaScript('document.querySelectorAll(".card").length'),2);await checkLayout();await snap(theme+'-market');
  checks.push(theme+': homepage and market render; preference persists across pages');
 }
 await wc.executeJavaScript("localStorage.setItem('lingpet.website.theme','paper-journal')");
 for(const width of [850,390]){win.setContentSize(width,900);for(const page of ['/','/market','/admin']){await win.loadURL(origin+page);await wait(160);await checkLayout();await snap((page==='/'?'home':page.slice(1))+'-'+width);}}
 checks.push('homepage, market and admin fit 850px and 390px');
 win.setContentSize(1200,900);await win.loadURL(origin+'/market');await wait(150);
 await wc.executeJavaScript('document.querySelector(".card button").click()');await wait(250);assert.ok(await wc.executeJavaScript('document.getElementById("detail").open'));await snap('market-detail');
 await wc.executeJavaScript('document.getElementById("closeDetail").click();document.getElementById("search").value="nope";document.getElementById("searchButton").click()');await wait(160);assert.ok(await wc.executeJavaScript('document.querySelector(".empty-market")!==null'));await snap('market-empty');
 checks.push('work detail and empty search states render');
 await win.loadURL(origin);await wait(120);assert.equal(await wc.executeJavaScript('document.querySelectorAll("#downloadCards a.primary").length'),3);
 await wc.executeJavaScript('document.getElementById("downloads").scrollIntoView()');await wait(180);await snap('downloads');
 checks.push('three download entries and installation instructions remain accessible');
 }catch(error){failures.push(error.stack||String(error));}finally{await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'results.json'),JSON.stringify({checks,failures},null,2));console.log(JSON.stringify({checks,failures}));win?.destroy();if(server)await new Promise(r=>server.close(r));app.exit(failures.length?1:0);}})();
