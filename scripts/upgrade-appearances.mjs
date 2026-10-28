import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {ensureRuntime} from '../src/bootstrap.js';
import {readEndpoint,request} from '../src/bridge-client.js';
import {dataDirectory} from '../src/paths.js';
import {migratePetConfig} from '../src/pet-registry.js';
import {appearanceInfo} from '../src/characters.js';
import {describeRelease} from '../src/release.js';
const dir=dataDirectory(),out=path.resolve('artifacts/appearance-install');await mkdir(out,{recursive:true});
const original=await readFile(path.join(dir,'settings.json'),'utf8'),before=JSON.parse(original),expected=migratePetConfig(before),release=await describeRelease();
await writeFile(path.join(out,'settings-before-'+Date.now()+'.json'),original);
await ensureRuntime(dir,{explicit:true});let endpoint,health;
for(let i=0;i<150;i++){
  try{endpoint=await readEndpoint(dir);health=await request(endpoint,'/health');if(health.release?.backendHash===release.backendHash&&health.release?.frontendHash===release.frontendHash)break;}catch{}
  await new Promise(resolve=>setTimeout(resolve,300));
}
if(health?.release?.backendHash!==release.backendHash||health?.release?.frontendHash!==release.frontendHash)throw new Error('新版运行时未完整就绪');
const after=JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8'));
if(after.pets.length!==expected.pets.length||JSON.stringify(after.global)!==JSON.stringify(expected.global))throw new Error('桌宠数量或全局配置发生变化');
for(const old of expected.pets){
  const pet=after.pets.find(p=>p.id===old.id);
  if(!pet||Object.keys(old).some(key=>JSON.stringify(pet[key])!==JSON.stringify(old[key])))throw new Error('桌宠配置未完整保留：'+old.id);
}
const pets=await request(endpoint,'/pets');
for(const pet of after.pets){const live=pets.pets.find(p=>p.id===pet.id);if(!live||live.appearance!==pet.appearance||live.variant!==pet.variant)throw new Error('运行中外观与保存配置不一致');}
const cloud=after.pets.find(p=>appearanceInfo(p).asset==='chatgpt-dragon');
await request(endpoint,'/dashboard',{petId:cloud?.id??after.pets[0]?.id},10000);
const result={version:health.release.version,beforePetCount:before.pets.length,afterPetCount:after.pets.length,allSettingsPreserved:true,appearanceMigrationVerified:true,pets:after.pets.map(({id,name,character,appearance,variant})=>({id,name,character,appearance,variant}))};
await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
