import {normalizeTheme} from "../src/ui-themes.js";
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {ensureRuntime} from '../src/bootstrap.js';
import {readEndpoint,request} from '../src/bridge-client.js';
import {dataDirectory,PACKAGE_ROOT} from '../src/paths.js';
import {describeRelease} from '../src/release.js';
import {normalizePetScale} from '../src/pet-display.js';
import {INTERACTION_SETTINGS} from '../src/animation-kinds.js';

const dir=dataDirectory(),release=await describeRelease();
const out=path.join(PACKAGE_ROOT,'artifacts','desktop-install-'+release.version+'-'+Date.now());
await mkdir(out,{recursive:true});
const text=await readFile(path.join(dir,'settings.json'),'utf8'),before=JSON.parse(text);
const expected=structuredClone(before);expected.global.theme=normalizeTheme(before.global?.theme);
expected.pets=expected.pets.map(pet=>({...INTERACTION_SETTINGS,...pet,scale:normalizePetScale(pet.scale)}));
await writeFile(path.join(out,'settings-before.json'),text);
console.log(JSON.stringify({phase:'installing',version:release.version,backup:out,petCount:before.pets.length}));
await ensureRuntime(dir,{explicit:true});
let health,endpoint;
for(let attempt=0;attempt<180;attempt++){
  try{
    endpoint=await readEndpoint(dir);health=await request(endpoint,'/health');
    if(health.release?.backendHash===release.backendHash&&health.release?.frontendHash===release.frontendHash)break;
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,300));
}
assert.equal(health?.release?.version,release.version,'installed version');
assert.equal(health.release.backendHash,release.backendHash,'running backend');
assert.equal(health.release.frontendHash,release.frontendHash,'running frontend');
const after=JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8'));
assert.deepEqual(after,expected,'saved settings preserved with size aligned to the nearest ruler step');
const live=await request(endpoint,'/pets');
assert.equal(live.pets.length,before.pets.length,'all pet instances running');
for(const pet of expected.pets){
  const running=live.pets.find(item=>item.id===pet.id);assert.ok(running,'pet retained');
  for(const [key,value] of Object.entries(pet))assert.deepEqual(running[key],value,'live pet '+key);
}
const result={installed:true,version:health.release.version,pid:endpoint.pid,allSettingsPreserved:true,releaseHashesVerified:true,pets:after.pets.map(pet=>({name:pet.name,character:pet.character,appearance:pet.appearance,variant:pet.variant})),backup:out};
await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
