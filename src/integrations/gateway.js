import http from 'node:http';
import path from 'node:path';
import {unlink} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {CodexObserver} from '../codex-observer.js';
import {CursorObserver} from '../cursor-observer.js';
import {atomic,json} from './files.js';
import {creationSchemas} from '../creation/tools.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute=promisify(execFile);
async function hostRunning(source){
  if(process.platform!=='win32')return null;
  try{const {stdout}=await execute(path.join(process.env.SystemRoot||'C:/Windows','System32/tasklist.exe'),['/FO','CSV','/NH'],{windowsHide:true,timeout:2000});return source==='cursor'?/"Cursor\.exe"/i.test(stdout):/"(?:Codex|ChatGPT)\.exe"/i.test(stdout);}catch{return null;}
}

export async function startIntegrationGateway({manager,store,control,creation,ownerCheck=hostRunning,intervalMs=5000}){
  const observers=new Map(),generation=randomUUID(),file=path.join(manager.base,'endpoint.json');
  function observer(item){
    if(!observers.has(item.id)){
      const instanceId='integration-'+item.id+'-'+generation;
      const emit=event=>{store.accept({...event,scopeId:item.id});manager.note(item.id,{events:true,lastEventAt:Date.now(),connected:true});};
      const value=item.source==='codex'?new CodexObserver(emit,{instanceId}):item.source==='cursor'?new CursorObserver(emit,{instanceId}):{instanceId,instances:new Set()};
      observers.set(item.id,value);
    }
    return observers.get(item.id);
  }
  const server=http.createServer(async(req,res)=>{
    const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    if(req.headers.origin||!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return reply(403,{error:'禁止的请求来源'});
    if(req.method!=='POST')return reply(404,{error:'接口不存在'});
    const management=['/control','/creation'].includes(req.url);
    try{
      const token=req.headers.authorization?.replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(token||''))return reply(401,{error:'接入凭证无效'});
      const item=await manager.authorize(token,management);if(!item)return reply(401,{error:'接入已停用或凭证无效'});
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>(req.url==='/creation'?48*1024*1024:16384))return reply(413,{error:'请求过大'});chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(req.url==='/control'){manager.note(item.id,{management:true});return reply(200,await control.run(body.action));}
      if(req.url==='/creation'){
        if(!['generation_settings','character','environment','project','generate','task','process','preview','appearance'].includes(body.method)||!Array.isArray(body.args))return reply(400,{error:'无效创作操作'});
        const generated=body.method==='generate',kind=body.args[0];if(generated&&!['image','video'].includes(kind))throw Error('无效生成类型');
        const schema=creationSchemas['board_pet_'+(generated?'generate_'+kind:body.method==='process'?'process_assets':body.method)];
        if(!schema)throw Error('无效创作方法');const input=schema.parse(body.args[generated?1:0]);
        return reply(200,await creation[body.method](...(generated?[kind,input]:[input])));
      }
      if(!['/hook','/event','/heartbeat','/disconnect'].includes(req.url))return reply(404,{error:'接口不存在'});
      const value=observer(item),instanceId=value.instanceId;
      if(req.url==='/disconnect'){
        if(item.source==='dsh'&&typeof body.instanceId==='string'){
          const owned=instanceId+'-'+createHash('sha256').update(body.instanceId).digest('hex').slice(0,16);store.disconnect(owned);value.instances.delete(owned);
          manager.note(item.id,{connected:[...value.instances].some(id=>store.instances.has(id))});
        }else {store.disconnect(instanceId);for(const extra of value.instances||[])store.disconnect(extra);manager.note(item.id,{connected:false});}
        return reply(200,{ok:true});
      }
      store.register(instanceId,item.source);
      manager.note(item.id,{connected:true});
      if(req.url==='/heartbeat'){
        const resync=item.source==='dsh'&&typeof body.instanceId==='string'&&!store.heartbeat(instanceId+'-'+createHash('sha256').update(body.instanceId).digest('hex').slice(0,16));
        return reply(200,{apiVersion:1,eventSchemaVersion:1,coreVersion:manager.version,generation,resync});
      }
      if(req.url==='/hook'){
        if(item.source==='dsh')return reply(400,{error:'来源不支持 Hook'});
        return reply(200,{accepted:value.accept(body)});
      }
      if(item.source!=='dsh')return reply(403,{error:'该接入只能提交原始 Hook 元数据'});
      if(typeof body.instanceId!=='string'||body.instanceId.length>256)throw Error('无效来源实例');
      const dshInstance=instanceId+'-'+createHash('sha256').update(body.instanceId).digest('hex').slice(0,16);value.instances.add(dshInstance);
      const accepted=store.accept({...body,source:'dsh',scopeId:item.id,instanceId:dshInstance});
      if(accepted)manager.note(item.id,{events:true,lastEventAt:Date.now()});return reply(200,{accepted});
    }catch(error){return reply(400,{error:String(error.message).slice(0,400)});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  await atomic(file,JSON.stringify({apiVersion:1,generation,url:'http://127.0.0.1:'+server.address().port,pid:process.pid}));
  let polling=false;
  const timer=setInterval(async()=>{
    if(polling)return;polling=true;const owners=new Map();
    try{for(const item of await manager.records()){
      const current=manager.live.get(item.id),value=observers.get(item.id);
      if(item.enabled&&current?.connected&&current.events&&item.source!=='dsh'&&value){
        if(!owners.has(item.source))owners.set(item.source,await ownerCheck(item.source));
        const running=owners.get(item.source);if(running===true){store.heartbeat(value.instanceId);manager.note(item.id,{connected:true});}
        else if(running===false){store.disconnect(value.instanceId);manager.note(item.id,{connected:false});}
      }
      const live=manager.live.get(item.id);
      if(!item.enabled||live?.connected&&Date.now()-live.updatedAt>45000){if(value){store.disconnect(value.instanceId);for(const extra of value.instances||[])store.disconnect(extra);}manager.note(item.id,{connected:false});}
    }}catch{}finally{polling=false;}
  },intervalMs);timer.unref();
  return {async close(){clearInterval(timer);await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});if((await json(file,null))?.generation===generation)await unlink(file).catch(()=>{});}};
}
