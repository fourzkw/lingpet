import path from 'node:path';
import {readFile} from 'node:fs/promises';

export async function integrationRequest(dir,id,route,body,{control=false,timeout=650}={}){
  if(!/^[a-f0-9-]{36}$/.test(id))throw Error('无效接入标识');
  const config=JSON.parse(await readFile(path.join(dir,'integrations/clients',id+'.json'),'utf8'));
  const endpoint=JSON.parse(await readFile(path.join(dir,'integrations/endpoint.json'),'utf8'));
  const url=new URL(endpoint.url);if(endpoint.apiVersion!==1||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port)throw Error('灵伴本体接入不可用');
  const response=await fetch(new URL(route,url),{method:'POST',headers:{Authorization:'Bearer '+(control?config.controlToken:config.token),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout),redirect:'error'});
  const result=await response.json();if(!response.ok)throw Error(result.error||'本体连接失败');return result;
}
export function creationProxy(dir,id){
  return Object.fromEntries(['generation_settings','character','environment','project','generate','task','process','preview','appearance'].map(method=>[method,(...args)=>integrationRequest(dir,id,'/creation',{method,args},{control:true,timeout:120000})]));
}
