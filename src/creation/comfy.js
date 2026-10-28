export class ComfyClient{
  constructor(url,fetcher=fetch){const u=new URL(url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw new Error('ComfyUI 地址必须是无凭证的 HTTP(S) 地址');this.url=u.href.replace(/\/$/,'');this.fetcher=fetcher;}
  async request(route,{method='GET',body,timeout=20000}={}){
    const response=await this.fetcher(this.url+route,{method,redirect:'error',signal:AbortSignal.timeout(timeout),...(body instanceof FormData?{body}:body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
    if(!response.ok)throw new Error(`ComfyUI ${response.status}: ${(await response.text()).slice(0,1500)}`);return response;
  }
  async json(route,options){return (await this.request(route,options)).json();}
  async upload(bytes,name,mime='image/png'){
    const form=new FormData();form.set('image',new Blob([bytes],{type:mime}),name);form.set('overwrite','false');
    const value=await this.json('/upload/image',{method:'POST',body:form});return (value.subfolder?value.subfolder+'/':'')+value.name;
  }
  async download(output){const query=new URLSearchParams({filename:output.filename,subfolder:output.subfolder||'',type:output.type||'output'});const response=await this.request('/view?'+query,{timeout:120000});const length=Number(response.headers.get('content-length'));if(length>256*1024*1024)throw new Error('输出超过 256MB');const chunks=[];let size=0;for await(const c of response.body){size+=c.length;if(size>256*1024*1024)throw new Error('输出超过 256MB');chunks.push(Buffer.from(c));}return Buffer.concat(chunks);}
}
