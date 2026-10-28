import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {ensureRuntime} from '../src/bootstrap.js';
import {readEndpoint,request} from '../src/bridge-client.js';
import {dataDirectory} from '../src/paths.js';
import {migratePetConfig} from '../src/pet-registry.js';
import {appearanceInfo} from '../src/characters.js';
const version=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
const dir=dataDirectory(),out=path.resolve('artifacts/dragon-install');await mkdir(out,{recursive:true});
const text=await readFile(path.join(dir,'settings.json'),'utf8'),before=migratePetConfig(JSON.parse(text));
await writeFile(path.join(out,'settings-before-'+Date.now()+'.json'),text);
await ensureRuntime(dir,{explicit:true});let health,endpoint;
for(let i=0;i<150;i++){
  try{endpoint=await readEndpoint(dir);health=await request(endpoint,'/health');if(health.release?.version===version)break;}catch{}
  await new Promise(resolve=>setTimeout(resolve,300));
}
if(health?.release?.version!==version)throw new Error('新版运行时未就绪');
let after=JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8'));
const fields=['name','character','appearance','variant','follow','enabled','scale','alwaysOnTop','showLabel','petVisible'];
function verify(){
  for(const old of before.pets){const pet=after.pets.find(p=>p.id===old.id);if(!pet||fields.some(k=>JSON.stringify(pet[k])!==JSON.stringify(old[k])))throw new Error('原桌宠配置发生变化：'+old.id);}
}
verify();let fresh=after.pets.find(p=>appearanceInfo(p).asset==='chatgpt-dragon');
if(!fresh){
  const result=await request(endpoint,'/pets/manage',{action:'create',value:{name:'云羽龙姬',character:'chatgpt-dragon',follow:{mode:'source',source:'codex'},enabled:true,petVisible:true,showLabel:true}},10000);
  fresh=result.pets.find(p=>appearanceInfo(p).asset==='chatgpt-dragon');
}
if(!fresh)throw new Error('新桌宠创建失败');
await new Promise(resolve=>setTimeout(resolve,600));after=JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8'));verify();
await request(endpoint,'/dashboard',{petId:fresh.id},10000);
const result={runtime:health.release.version,beforePetCount:before.pets.length,afterPetCount:after.pets.length,originalSettingsPreserved:true,legacyGptPreserved:before.pets.filter(p=>p.character==='chatgpt').every(p=>after.pets.some(q=>q.id===p.id&&q.character==='chatgpt')),newPetId:fresh.id,newCharacter:fresh.character};
await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
