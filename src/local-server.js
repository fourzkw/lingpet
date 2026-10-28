import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile, rename, readFile, unlink } from 'node:fs/promises';
import { endpointPath } from './paths.js';

export async function startLocalServer(store, dir, { port = 0, getRelease, updateRuntime, quitPet, showDashboard,petManager,reloadAppearances } = {}) {
  await mkdir(dir, { recursive: true });
  const token = randomBytes(32).toString('hex');
  const equal = candidate => typeof candidate === 'string' && /^[a-f0-9]{64}$/.test(candidate) && timingSafeEqual(Buffer.from(candidate), Buffer.from(token));
  const server = http.createServer(async (req,res) => {
    const reply = (code,value) => { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(value)); };
    // This is a Node-to-Node channel; arbitrary browser origins are never accepted.
    if (req.headers.origin || !['127.0.0.1', '::ffff:127.0.0.1', '::1'].includes(req.socket.remoteAddress)) return reply(403,{error:'禁止的请求来源'});
    if (!equal(req.headers.authorization?.replace(/^Bearer /,''))) return reply(401,{error:'连接凭证无效'});
    if (req.method === 'GET' && req.url === '/health') return reply(200,{version:1,name:'board-ai-pet',...(getRelease?{release:getRelease()}:{}),instances:store.instances.size,sessions:store.sessions.size,state:store.current().state});
    if(req.method==='GET'&&req.url==='/pets'&&petManager)return reply(200,petManager.list());
    if (req.method !== 'POST') return reply(404,{error:'接口不存在'});
    try {
      const chunks=[]; let size=0;
      for await (const chunk of req) { size+=chunk.length; if(size>16384) { reply(413,{error:'事件过大'}); req.resume(); return; } chunks.push(chunk); }
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      switch(req.url) {
        case '/register': store.register(body.instanceId); return reply(200,{ok:true});
        case '/heartbeat': return reply(store.heartbeat(body.instanceId)?200:409,{ok:store.instances.has(body.instanceId)});
        case '/event': return reply(200,{ok:true,accepted:store.accept(body)});
        case '/disconnect': store.disconnect(body.instanceId); return reply(200,{ok:true});
        case '/sessions/filter': store.filterSubagents(body.instanceId,body.includeSubagents); return reply(200,{ok:true});
        case '/runtime/update':
          if(!updateRuntime)return reply(404,{error:'当前桌宠不支持热更新'});
          return reply(200,await updateRuntime(body));
        // Called by the DSH host plugin's management panel (never by a browser).
        case '/quit':
          if(!quitPet)return reply(404,{error:'当前桌宠不支持远程关闭'});
          reply(200,{ok:true});
          return quitPet();
        case '/dashboard':
          if(!showDashboard)return reply(404,{error:'当前桌宠不支持打开工作台'});
          return reply(200,await showDashboard(body));
        case '/pets/manage':
          if(!petManager)return reply(404,{error:'当前运行时不支持多桌宠'});
          return reply(200,petManager.manage(body));
        case '/appearances/reload':
          if(!reloadAppearances)return reply(404,{error:'当前运行时不支持自定义形象'});
          return reply(200,await reloadAppearances());
        default: return reply(404,{error:'接口不存在'});
      }
    } catch(error) { reply(400,{error:req.url==='/runtime/update'?String(error.message).slice(0,300):'无效的状态事件'}); }
  });
  server.requestTimeout=2000; server.headersTimeout=3000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const endpoint={version:1,url:`http://127.0.0.1:${server.address().port}`,token,pid:process.pid};
  const file=endpointPath(dir), temp=`${file}.${process.pid}.tmp`;
  try{await writeFile(temp,JSON.stringify(endpoint),{mode:0o600});await rename(temp,file);}
  catch(error){await new Promise(resolve=>server.close(resolve));await unlink(temp).catch(()=>{});throw error;}
  let closing;
  return { endpoint, close: ()=>closing??(closing=(async()=>{
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    try { const current=JSON.parse(await readFile(file,'utf8')); if(current.token===token) await unlink(file); } catch {}
  })())};
}
