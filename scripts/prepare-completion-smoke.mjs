import {mkdir,cp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {CreationStore} from '../src/creation/store.js';
import {DEFAULT_PET} from '../src/pet-registry.js';
const dir=path.resolve(process.argv[2]);await mkdir(dir,{recursive:true});const store=new CreationStore(dir),source=path.resolve('output/community-interactions/extended-appearance');
for(const version of ['1.0.0','2.0.0']){
 const id='fixture-jade-'+version.replaceAll('.','-'),root=path.join(dir,'appearances',id);await cp(source,root,{recursive:true});
 const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));if(version==='2.0.0')manifest.clips.idle.durations[0]+=1;
 await writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest));
 await store.write('appearances',{id,character:'community-fixture-jade',community:true,characterName:'青墨龙灵验证',name:'青墨龙灵 '+version,asset:'custom:'+id,variants:manifest.variants,pixelSize:manifest.tileSize,manifest,root,createdAt:new Date().toISOString(),package:{formatVersion:1,id:'jade-test',name:'青墨龙灵验证',version,author:'test',license:'Local QA',description:'',minAppVersion:'0.5.0'},source:{market:'http://127.0.0.1:9633',versionId:version==='1.0.0'?'a'.repeat(48):'b'.repeat(48),github:{repoId:777,owner:'test',repo:'jade'}}});
}
await writeFile(path.join(dir,'settings.json'),JSON.stringify({schemaVersion:2,global:{launchAtLogin:false},pets:[{...DEFAULT_PET,id:'first-test-pet'},{...DEFAULT_PET,id:'other-test-pet',name:'其他桌宠'}]}));
console.log(dir);
