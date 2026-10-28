import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {ensureRuntime} from '../src/bootstrap.js';
import {readEndpoint,request} from '../src/bridge-client.js';
import {dataDirectory} from '../src/paths.js';
import {migratePetConfig} from '../src/pet-registry.js';
import {appearanceInfo} from '../src/characters.js';
import {describeRelease} from '../src/release.js';
const dir=dataDirectory(),out=path.resolve('artifacts/pet-management/install');await mkdir(out,{recursive:true});
const text=await readFile(path.join(dir,'settings.json'),'utf8'),before=JSON.parse(text),expected=migratePetConfig(before),release=await describeRelease();
await writeFile(path.join(out,'settings-before.json'),text);await ensureRuntime(dir,{explicit:true});let endpoint,health;
for(let i=0;i<180;i++){
 try{endpoint=await readEndpoint(dir);health=await request(endpoint,'/health');if(health.release?.backendHash===release.backendHash&&health.release?.frontendHash===release.frontendHash)break;}catch{}
 await new Promise(r=>setTimeout(r,300));
}
if(health?.release?.backendHash!==release.backendHash||health?.release?.frontendHash!==release.frontendHash)throw new Error('新版运行时尚未完整就绪');
const after=JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8'));
if(after.pets.length!==expected.pets.length||JSON.stringify(after.global)!==JSON.stringify(expected.global))throw new Error('桌宠数量或全局配置改变');
for(const old of expected.pets){const pet=after.pets.find(p=>p.id===old.id);if(!pet||Object.keys(old).some(k=>JSON.stringify(pet[k])!==JSON.stringify(old[k])))throw new Error('桌宠配置未完整保留: '+old.id);}
const live=await request(endpoint,'/pets');const targets=[];
for(const pet of after.pets){const running=live.pets.find(p=>p.id===pet.id);if(!running||running.appearance!==pet.appearance||running.variant!==pet.variant)throw new Error('运行状态与保存外观不一致');if(pet.character==='deepseek'&&pet.appearance==='whale'){if(appearanceInfo(pet).asset!=='deepseek-h3')throw new Error('DeepSeek 没有使用新素材');targets.push({id:pet.id,name:pet.name,variant:pet.variant});}}

const result={installed:true,version:health.release.version,petCount:after.pets.length,allSettingsPreserved:true,releaseHashesVerified:true,features:['Claude naming','per-pet deletion with dialog']};await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
