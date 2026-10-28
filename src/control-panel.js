import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile,mkdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {ensureRuntime} from './bootstrap.js';
import {readEndpoint,request} from './bridge-client.js';
import {PACKAGE_ROOT} from './paths.js';
import {normalizeTheme} from './ui-themes.js';

// Separate from Electron so the Start button remains available after Quit.
export async function startControlPanel(dir,{start=ensureRuntime}={}){
  await mkdir(dir,{recursive:true});
  const secret=randomBytes(32).toString('hex');
  let origin,busy=false;
  const state=async()=>{
    let theme=normalizeTheme();try{theme=normalizeTheme(JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8')).global?.theme);}catch{}
    const endpoint=await readEndpoint(dir);
    if(endpoint)try{const health=await request(endpoint,'/health');return {running:true,state:health.state,theme};}catch{}
    return {running:false,theme};
  };
  const server=http.createServer(async(req,res)=>{
    const send=(code,value,headers={})=>{res.writeHead(code,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(value);};
    const json=(code,value)=>send(code,JSON.stringify(value),{'Content-Type':'application/json; charset=utf-8'});
    if(req.headers.host!==new URL(origin).host)return json(403,{error:'无效的访问地址'});
    const url=new URL(req.url,origin);
    // One-time browser bootstrap; the token never appears in page markup or API results.
    if(req.method==='GET'&&url.pathname==='/'&&url.searchParams.get('key')===secret){
      return send(303,'',{Location:'/', 'Set-Cookie':`board_pet_control=${secret}; HttpOnly; SameSite=Strict; Path=/`,'Referrer-Policy':'no-referrer'});
    }
    if(!(req.headers.cookie||'').split(';').some(v=>v.trim()===`board_pet_control=${secret}`))return json(401,{error:'请从桌宠控制入口重新打开面板'});
    try{
      if(req.method==='GET'&&['/','/control.js','/control.css','/ui-theme.css','/theme-tokens.css','/ui-base.css','/brand.svg'].includes(url.pathname)){
        const file=url.pathname==='/'?'control.html':url.pathname.slice(1);
        const types={html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml'};
        return send(200,await readFile(path.join(PACKAGE_ROOT,'desktop',file)),{'Content-Type':types[file.split('.').at(-1)]+'; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'",'Referrer-Policy':'no-referrer'});
      }
      if(req.method==='GET'&&url.pathname==='/status')return json(200,await state());
      if(req.method!=='POST'||!['/start','/stop','/settings'].includes(url.pathname))return json(404,{error:'接口不存在'});
      if(req.headers.origin!==origin||req.headers['x-board-pet-control']!=='1')return json(403,{error:'禁止的请求来源'});
      if(busy)return json(409,{error:'正在处理，请稍候'});
      busy=true;
      try{
        if(url.pathname==='/stop'){
          // Persist before Quit; hooks and other bridges must not immediately restart it.
          await writeFile(path.join(dir,'runtime.paused'),'用户通过控制面板关闭全部桌宠');
          const endpoint=await readEndpoint(dir);
          if((await state()).running)await request(endpoint,'/quit',{});
          for(let i=0;i<50&&(await state()).running;i++)await new Promise(r=>setTimeout(r,100));
          if((await state()).running)throw new Error('关闭尚未完成，请重试');
        }else{
          await start(dir,{explicit:true,dashboard:url.pathname==='/settings'});
          if(!(await state()).running)throw new Error('桌宠尚未启动，请重试');
        }
        return json(200,await state());
      }finally{busy=false;}
    }catch(error){return json(500,{error:error.message});}
  });
  server.requestTimeout=5000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  const url=`${origin}/?key=${secret}`,file=path.join(dir,'control-panel.json');
  await writeFile(file,JSON.stringify({url,pid:process.pid}),{mode:0o600});
  return {url,close:async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});try{if(JSON.parse(await readFile(file,'utf8')).url===url)await unlink(file);}catch{}}};
}
