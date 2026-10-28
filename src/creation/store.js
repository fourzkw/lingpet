import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {withInstallLock} from '../install-lock.js';

export const STATES=['idle','thinking','working','input','approval','done','error','sleep'];
export const digest=data=>createHash('sha256').update(data).digest('hex');
export function safeId(value){if(typeof value!=='string'||! /^[a-zA-Z0-9_-]{1,100}$/.test(value))throw new Error('无效的资源 ID');return value;}
export async function json(file,fallback){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT'&&fallback!==undefined)return fallback;throw e;}}
export async function save(file,value){await mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value,null,2),{mode:0o600});await rename(temp,file);}
export class CreationStore{
  constructor(dir){this.root=path.join(dir,'creation');}
  file(group,id){return path.join(this.root,group,safeId(id)+'.json');}
  read(group,id){return json(this.file(group,id));}
  write(group,value){return save(this.file(group,value.id),value);}
  async list(group){let files;try{files=await readdir(path.join(this.root,group));}catch(e){if(e.code==='ENOENT')return [];throw e;}return Promise.all(files.filter(f=>f.endsWith('.json')).map(f=>json(path.join(this.root,group,f))));}
  lock(fn){return withInstallLock(path.join(this.root,'write.lock'),fn,{timeout:30000});}
  config(){return json(path.join(this.root,'config.json'),{url:'http://127.0.0.1:8188',models:{},python:''});}
  assetPath(id){return path.join(this.root,'files',safeId(id));}
  async asset(projectId,bytes,name,mimeType,extra={}){
    const id=randomUUID(),file=this.assetPath(id);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);
    const value={...extra,id,projectId,name:path.basename(name),mimeType,bytes:bytes.length,sha256:digest(bytes),createdAt:new Date().toISOString()};await this.write('assets',value);return value;
  }
}
