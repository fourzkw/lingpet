import path from 'node:path';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {createAdapterPackage} from './packages.js';

// Independent of the desktop version. Bump a source's base for protocol changes.
export const ADAPTER_VERSIONS=Object.freeze({codex:'1.0.0',cursor:'1.0.0',dsh:'1.0.0'});
const neutralId='00000000-0000-4000-8000-000000000000';

export async function adapterFingerprint(root,{id=neutralId}={}){
  const hash=createHash('sha256');
  async function walk(folder){
    for(const entry of (await readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
      if(entry.name==='node_modules')continue;
      const file=path.join(folder,entry.name);
      if(entry.isDirectory()){await walk(file);continue;}
      if(!entry.isFile())throw Error('接入包包含不支持的文件类型');
      const relative=path.relative(root,file).split(path.sep).join('/');let bytes=await readFile(file);
      if(relative.endsWith('.json')){
        const value=JSON.parse(bytes.toString('utf8').replaceAll(id,neutralId));
        if(['lingpet-adapter.json','package.json','plugin.json'].includes(entry.name)&&typeof value.version==='string')value.version='0.0.0';
        bytes=Buffer.from(JSON.stringify(value));
      }
      hash.update(relative+'\0'+bytes.length+'\0');hash.update(bytes);
    }
  }
  await walk(root);return hash.digest('hex');
}

export async function adapterRelease({source,root,bridge,dir,base}){
  if(!ADAPTER_VERSIONS[source])throw Error('不支持的 Agent');
  const temporary=path.join(base,'release-staging');await mkdir(temporary,{recursive:true});
  const staging=await mkdtemp(path.join(temporary,'adapter-'));
  try{
    await createAdapterPackage({source,id:neutralId,destination:staging,bridge,version:'0.0.0',templateRoot:root,dir});
    const fingerprint=await adapterFingerprint(staging);
    // A unique valid SemVer also prevents hosts from reusing an old package cache.
    return {fingerprint,version:ADAPTER_VERSIONS[source]+'-content.'+fingerprint.slice(0,16),bridgeProtocol:1};
  }finally{
    const relative=path.relative(temporary,staging);
    if(relative.startsWith('adapter-')&&!relative.includes(path.sep))await rm(staging,{recursive:true,force:true});
  }
}
