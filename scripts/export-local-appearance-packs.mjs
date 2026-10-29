import {mkdir,writeFile,readFile,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {configureBundledAssets,setCustomAppearances} from '../src/characters.js';
import {loadCustomAppearances} from '../src/creation/catalog.js';
import {CreationStore} from '../src/creation/store.js';
import {exportPetpack,readPetpack,installPetpack,sha256} from '../src/market/package.js';
import {validateAppearance} from '../src/creation/validation.js';

const dataDir=process.argv[2];if(!dataDir)throw Error('Usage: node scripts/export-local-appearance-packs.mjs <data-directory>');
const version=JSON.parse(await readFile('package.json','utf8')).version,out=path.resolve(`artifacts/lingpet-extra-appearances-${version}`);
await mkdir(out,{recursive:true});
configureBundledAssets(['claude']);const entries=await loadCustomAppearances(dataDir);
setCustomAppearances(entries,await new CreationStore(dataDir).list('characters'));
const definitions=[{appearance:'claude-orange-scholar-v1',id:'lingpet-orange-blossom-scholar'},{appearance:'snowfox-winter-v1',id:'lingpet-snowfox-winter'}],packs=[];
for(const definition of definitions){
 const entry=entries.find(e=>e.id===definition.appearance);assert.ok(entry,'形象未找到：'+definition.appearance);
 const result=await exportPetpack({dataDir,pet:{character:entry.character,appearance:entry.id},details:{id:definition.id,name:entry.name,author:'LingPet',license:'保留所有权利；未授予公开再分发许可',description:'从本地形象库导出，保留现有动作与显示版本。',version:'1.0.0'}});
 const pack=await readPetpack(result.bytes);assert.deepEqual(pack.manifest.variants,entry.variants);
 assert.deepEqual(Object.keys(pack.manifest.clips).sort(),Object.keys(entry.manifest.clips).sort());
 const folder=path.join(out,definition.id);await mkdir(path.join(folder,'previews'),{recursive:true});
 await writeFile(path.join(folder,result.name),result.bytes);await writeFile(path.join(folder,'pet.json'),JSON.stringify(pack.pet,null,2)+'\n');await writeFile(path.join(folder,'previews/cover.png'),pack.files.get('cover.png'));
 const verification=await mkdtemp(path.resolve('output/appearance-import-verification-'));
 const imported=await installPetpack(verification,result.bytes,{expectedSHA256:result.sha256}),report=await validateAppearance(imported.appearance.root);
 assert.ok(report.valid&&report.complete);assert.equal((await loadCustomAppearances(verification)).length,1);
 const item={id:pack.pet.id,name:pack.pet.name,version:pack.pet.version,file:definition.id+'/'+result.name,size:result.bytes.length,sha256:sha256(result.bytes),variants:pack.manifest.variants,states:Object.keys(pack.manifest.clips),importVerified:true};packs.push(item);console.log(JSON.stringify(item));
}
await writeFile(path.join(out,'manifest.json'),JSON.stringify({packs},null,2)+'\n');await writeFile(path.join(out,'SHA256SUMS.txt'),packs.map(p=>p.sha256+'  '+p.file).join('\n')+'\n');console.log(out);
