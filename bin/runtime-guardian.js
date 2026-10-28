import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {dataDirectory} from '../src/paths.js';
import {readEndpoint,request} from '../src/bridge-client.js';
import {ensureRuntime} from '../src/bootstrap.js';
const dir=dataDirectory();
try{
  for(let i=0;i<80;i++){
    const endpoint=await readEndpoint(dir);if(!endpoint)break;
    try{await request(endpoint,'/health');}catch{break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  await ensureRuntime(dir,{dashboard:process.argv.includes('--dashboard'),hotRestart:true});
}catch(error){await writeFile(path.join(dir,'runtime-status.json'),JSON.stringify({phase:'error',message:error.message,time:Date.now()}));}
