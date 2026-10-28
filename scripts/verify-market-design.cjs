// Run with Electron. Uses an isolated local fixture server, never production data.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output','web-redesign');
app.setPath('userData',path.join(out,'electron-profile-'+process.pid));
app.commandLine.appendSwitch('disable-gpu');
const states=['idle','thinking','working','input','approval','done','error','sleep'];
const sample=(id,name,animated)=>({id:id.repeat(48),pet:{name,author:'LingPet QA',version:'1.0.0',description:'用于验证角色卡片、动作预览和响应式排版的本地样例。',license:'测试素材'},repository:'fourzkw/lingpet',tag:'v1.0.0',size:1048576,status:'approved',...(animated?{preview:{columns:1,tileSize:1280,variants:['pixel'],clips:Object.fromEntries(states.map(s=>[s,{file:'cover.png',frames:[0],durations:[1000],loop:true}]))}}:{})});
const rows=[sample('a','鲸鱼娘',true),sample('b','白羽龙姬',false)];
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
let server,win;const errors=[],checks=[];
function check(name,value){assert.ok(value,name);checks.push(name);console.log('PASS '+name);}
async function main(){
 await fs.mkdir(out,{recursive:true});
 server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');let file=url.pathname;
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  if(file.startsWith('/api/')){res.setHeader('Content-Type','application/json');
   if(file==='/api/downloads')return res.end(JSON.stringify({downloads:[{id:'cursor',available:true,version:'1.0.0',size:1048576,url:'/downloads/cursor',sha256:'a'.repeat(64)}]}));
   if(file==='/api/pets'){const q=url.searchParams.get('q');if(q==='error'){res.statusCode=503;return res.end(JSON.stringify({error:'测试网络中断'}));}return res.end(JSON.stringify(q==='no-match'?[]:rows));}
   if(file.endsWith('/install'))return res.end(JSON.stringify({url:'https://github.com/fourzkw/lingpet/releases'}));
   if(file.endsWith('.png'))file=file.includes('/'+rows[1].id+'/')?'/white-dragon.png':'/deepseek.png';
   else{res.statusCode=404;return res.end('{}');}
  }
  file=file==='/'?'/index.html':file==='/market'?'/market.html':file;
  if(file.includes('..')){res.statusCode=400;return res.end();}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(path.join(root,'market','web',file)));
 }catch{res.statusCode=404;res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,offscreen:true}});
 win.webContents.on('console-message',event=>{if(event.level==='error'&&!event.message.includes('503'))errors.push(event.message);});
 const evaluate=code=>win.webContents.executeJavaScript(code);
 const settle=()=>evaluate("Promise.all([...document.images].filter(i=>i.complete||i.loading!=='lazy').map(i=>i.decode().catch(()=>{})))");
 async function waitFor(expression){for(let i=0;i<80;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+expression);}
 async function capture(name){console.log('CAPTURE '+name);await settle();console.log('IMAGES READY '+name);await new Promise(r=>setTimeout(r,200));await fs.writeFile(path.join(out,name+'.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());console.log('SAVED '+name);}
 await win.loadURL(origin);await waitFor("document.getElementById('downloadCards').children.length===3");
 check('available download and pending releases render',await evaluate("document.querySelectorAll('.download-card').length===3 && document.querySelector('#download-cursor') && document.querySelectorAll('.download-card button:disabled').length===2"));
 await evaluate("document.querySelector('[data-demo=thinking]').click()");
 check('state switching updates speech and accessibility',await evaluate("document.querySelector('.companion-scene').dataset.state==='thinking' && document.querySelector('[data-demo=thinking]').getAttribute('aria-pressed')==='true' && document.querySelector('#petSpeech').textContent.includes('灵感')"));
 await evaluate("document.querySelector('#greetPet').click()");check('pet greeting responds',await evaluate("['能量','休息','高兴'].some(word=>document.querySelector('#petSpeech').textContent.includes(word))"));
 await evaluate("document.querySelector('[data-demo=idle]').click()");await capture('home-desktop');
 win.webContents.debugger.attach('1.3');
 const layout=await win.webContents.debugger.sendCommand('Page.getLayoutMetrics');
 const full=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:layout.cssContentSize.width,height:layout.cssContentSize.height,scale:1}});
 await fs.writeFile(path.join(out,'home-full.png'),Buffer.from(full.data,'base64'));win.webContents.debugger.detach();
 for(const width of [320,390,768,1024,1440]){win.setContentSize(width,1000);await settle();check('homepage has no horizontal overflow at '+width,await evaluate('document.documentElement.scrollWidth<=innerWidth'));if(width===390)await capture('home-mobile');}
 win.setContentSize(1440,1000);
 await evaluate("document.querySelector('#siteTheme').value='warm-night';document.querySelector('#siteTheme').dispatchEvent(new Event('change'))");await capture('home-night');
 await win.loadURL(origin+'/market');await waitFor("document.querySelectorAll('.pet-card').length===2");
 check('theme persists between pages',await evaluate("document.documentElement.dataset.theme==='warm-night'"));
 await evaluate("document.querySelector('#siteTheme').value='paper-journal';document.querySelector('#siteTheme').dispatchEvent(new Event('change'))");await capture('market-desktop');
 for(const width of [320,390,768,1024,1440]){win.setContentSize(width,1000);await settle();check('market has no horizontal overflow at '+width,await evaluate('document.documentElement.scrollWidth<=innerWidth'));if(width===390)await capture('market-mobile');}
 win.setContentSize(1000,900);win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await evaluate("document.querySelector('.pet-cover').focus()");console.log('FOCUS '+await evaluate("JSON.stringify({active:document.activeElement.className,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,canvas:!!document.querySelector('.pet-cover canvas')})"));await waitFor("!document.querySelector('.pet-cover canvas').hidden");check('card animation responds to keyboard focus',true);
 await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await waitFor("document.querySelector('.pet-cover canvas').hidden");check('reduced motion keeps static cover',true);win.webContents.debugger.detach();
 await evaluate("document.querySelector('.pet-cover').click()");await waitFor("document.querySelector('#detail').open && document.querySelector('#state').options.length===8");check('animated detail opens with eight states',true);await settle();await capture('market-detail');await evaluate("document.querySelector('#closeDetail').click()");
 await evaluate("document.querySelectorAll('.pet-cover')[1].click()");await waitFor("document.querySelector('#detail').open");check('cover-only detail opens',await evaluate("document.querySelector('#state').parentElement.hidden"));await evaluate("document.querySelector('#closeDetail').click()");
 await evaluate("document.querySelector('#search').value='no-match';document.querySelector('#searchButton').click()");await waitFor("document.querySelector('.empty-market')");check('empty search has recovery action',await evaluate("document.querySelector('.empty-market button').textContent.includes('全部')"));await evaluate("document.querySelector('.empty-market button').click()");await waitFor("document.querySelectorAll('.pet-card').length===2");
 await evaluate("document.querySelector('#search').value='error';document.querySelector('#searchButton').click()");await waitFor("document.querySelector('.empty-market button')");check('failed request shows retry',await evaluate("document.querySelector('.empty-market button').textContent.includes('重新加载')"));
 await evaluate("document.querySelector('[data-tab=submit]').click()");check('submission form still available',await evaluate("!document.querySelector('#submit').hidden && document.querySelectorAll('#submitForm input').length===3"));
 win.setContentSize(390,1000);await capture('market-submit-mobile');
 await evaluate("document.querySelector('[data-tab=mine]').click()");check('receipt lookup still available',await evaluate("!document.querySelector('#mine').hidden && document.querySelector('#lookupToken').type==='password'"));
 for(const theme of ['pixel-workshop','terminal-pulse']){await evaluate(`document.querySelector('#siteTheme').value='${theme}';document.querySelector('#siteTheme').dispatchEvent(new Event('change'))`);check('theme applies: '+theme,await evaluate(`document.documentElement.dataset.theme==='${theme}'`));}
 check('no unexpected renderer errors',errors.length===0);
 await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors,screenshots:out}));
}
app.whenReady().then(main).then(()=>{win?.destroy();server?.close();app.quit();}).catch(e=>{console.error(e);win?.destroy();server?.close();app.exit(1);});
