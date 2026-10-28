import { readFile } from 'node:fs/promises';
import { endpointPath } from './paths.js';

export async function readEndpoint(dir) {
  try {
    const e=JSON.parse(await readFile(endpointPath(dir),'utf8'));
    const url=new URL(e.url);
    if(e.version!==1 || url.protocol!=='http:' || url.hostname!=='127.0.0.1' || !url.port || !/^[a-f0-9]{64}$/.test(e.token)) return null;
    return e;
  } catch { return null; }
}
export async function request(endpoint,route,body,timeout=1000) {
  const response=await fetch(`${endpoint.url}${route}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${endpoint.token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout),redirect:'error'});
  if(!response.ok) {const detail=await response.json().catch(()=>({}));throw new Error(`桌宠连接返回 ${response.status}${detail.error?' / '+detail.error:''}`);}
  return response.json();
}

export class BridgeClient {
  constructor({dir,instanceId,ensureRuntime,release,getIncludeSubagents,logger=console,maxQueue=128}) {
    Object.assign(this,{dir,instanceId,ensureRuntime,release,getIncludeSubagents,logger,maxQueue}); this.queue=[];this.endpoint=null;this.closed=false;this.flushing=false;this.nextStart=0;this.onReconnect=()=>{};
  }
  start() { if(this.closed||this.timer)return;this.timer=setInterval(()=>void this.flush(),2000);this.timer.unref?.();void this.flush(); }
  enqueue(event) {
    if(this.closed)return;
    if(this.closed)return;
    // On an outage only the newest state of each session is useful.
    const idx=this.queue.findIndex(e=>e.sessionId===event.sessionId);
    if(idx>=0)this.queue.splice(idx,1);
    this.queue.push(event);if(this.queue.length>this.maxQueue)this.queue.shift();void this.flush();
  }
  flush() {
    if(this.closed)return Promise.resolve();
    if(this.flushing)return this.pendingFlush??Promise.resolve();
    this.flushing=true;
    this.pendingFlush=this.flushPending();
    return this.pendingFlush;
  }
  async flushPending() {
    try {
      if(!this.endpoint) {
        this.endpoint=await readEndpoint(this.dir);
        if(this.endpoint) {
          try{
            const health=await request(this.endpoint,'/health');
            if(this.release&&health.release){
              const release=await this.release;
              if(release.backendHash!==health.release.backendHash||release.frontendHash!==health.release.frontendHash){
                const result=await request(this.endpoint,'/runtime/update',{root:release.root},30000);
                if(result.action==='restarting'){this.endpoint=null;return;}
              }
            }
          }catch(error){this.endpoint=null;this.lastError=error.message;}
        }
        if(!this.endpoint) {
          if(!this.closed&&Date.now()>this.nextStart) {this.nextStart=Date.now()+30000;await this.ensureRuntime?.();}
          return;
        }
        if(this.closed)return;
        await request(this.endpoint,'/register',{instanceId:this.instanceId});
        this.lastIncludeSubagents=undefined;
        this.onReconnect();
      }
      if(this.closed)return;
      await request(this.endpoint,'/heartbeat',{instanceId:this.instanceId});
      const include=this.getIncludeSubagents?.();
      if(typeof include==='boolean'&&include!==this.lastIncludeSubagents){
        if(!include)this.queue=this.queue.filter(event=>!event.subagent);
        await request(this.endpoint,'/sessions/filter',{instanceId:this.instanceId,includeSubagents:include});
        this.lastIncludeSubagents=include;
      }
      while(this.queue.length&&!this.closed) {
        const item=this.queue[0];await request(this.endpoint,'/event',item);
        // A newer observation can replace a queued state during the request.
        const index=this.queue.indexOf(item);if(index>=0)this.queue.splice(index,1);
      }
    } catch(error) {this.endpoint=null;if(this.lastError!==error.message)this.logger.warn?.('[board-ai-pet]',error.message);this.lastError=error.message;}
    finally {this.flushing=false;}
  }
  async disconnect(){
    if(this.endpoint) {try{await request(this.endpoint,'/disconnect',{instanceId:this.instanceId},500);}catch{}}
  }
  async close({disconnect=true}={}) {
    if(this.closing)return this.closing;
    this.closed=true;clearInterval(this.timer);this.queue=[];
    this.closing=(async()=>{
      // A registration or runtime preparation already in flight must finish
      // before disconnecting and allowing the service directory to be removed.
      await this.pendingFlush;
      if(disconnect)await this.disconnect();
      this.endpoint=null;
    })();
    return this.closing;
  }
}
