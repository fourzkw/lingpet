import {CreationStore} from '../src/creation/store.js';
import {resolveAppearanceAliases} from '../src/creation/appearance-identity.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir,cp} from 'node:fs/promises';
import path from 'node:path';
import yazl from 'yazl';
import pngjs from 'pngjs';
import {readPetpack,installPetpack,exportPetpack,sha256} from '../src/market/package.js';
import {MarketService} from '../src/market/service.js';
import {setCustomAppearances,appearanceInfo} from '../src/characters.js';
import {loadCustomAppearances} from '../src/creation/catalog.js';
import {PetRegistry} from '../src/pet-registry.js';
const {PNG}=pngjs;
export async function fixturePetpack(extra={},metadata={}){const png=new PNG({width:32,height:16});for(let y=2;y<14;y++)for(let x=2;x<30;x++){const i=(y*32+x)*4;png.data[i]=180;png.data[i+1]=100;png.data[i+2]=230;png.data[i+3]=255;}const image=PNG.sync.write(png,{colorType:6}),manifest={schemaVersion:1,character:'fixture',columns:2,tileSize:16,variants:['pixel'],clips:{}};const files={'cover.png':image};for(const state of ['idle','thinking','working','input','approval','done','error','sleep']){manifest.clips[state]={file:'sprites/'+state+'.png',sourceFrames:2,frames:[0,1],durations:[80,90],loop:!['done','error'].includes(state)};files['sprites/'+state+'.png']=image;}files['manifest.json']=Buffer.from(JSON.stringify(manifest));files['pet.json']=Buffer.from(JSON.stringify({formatVersion:1,id:'fixture-pet',name:'社区桌宠',author:'alice',license:'CC0',description:'测试作品',version:'1.0.0',minAppVersion:'0.4.0',...metadata}));Object.assign(files,extra);const zip=new yazl.ZipFile(),chunks=[];const finished=new Promise((resolve,reject)=>{zip.outputStream.on('data',b=>chunks.push(b));zip.outputStream.on('error',reject);zip.outputStream.on('end',()=>resolve(Buffer.concat(chunks)));});for(const [file,bytes]of Object.entries(files))zip.addBuffer(bytes,file);zip.end();return finished;}
async function data(t){const root=await mkdtemp(path.join(process.cwd(),'.test-data-market-'));t.after(async()=>{setCustomAppearances([]);assert.equal(path.dirname(root),process.cwd());assert.ok(path.basename(root).startsWith('.test-data-market-'));await rm(root,{recursive:true,force:true});});return root;}

test('installed library includes local appearances without packages as separate works under the same role',async t=>{
 const dir=await data(t),installed=await installPetpack(dir,await fixturePetpack()),entry={...installed.appearance,package:undefined,packageVersions:undefined};
 const service=new MarketService(dir,{fetcher:async()=>{throw Error('offline');}});
 const library=await service.library({appearances:[{...entry,id:'local-first',name:'形象一'},{...entry,id:'local-second',name:'形象二'}]});
 assert.equal(library.groups.length,2);assert.deepEqual(library.groups.map(g=>g.name),['形象一','形象二']);assert.ok(library.groups.every(g=>g.origin==='local'&&!g.update));
 const store=new CreationStore(dir);await store.write('appearances',entry);assert.equal((await service.library()).groups[0].origin,'local');
 await service.uninstall(entry.id);assert.equal((await service.library()).groups.length,0);
});
test('sharing packages preserve complete actions and install as independent community roles',async t=>{const dir=await data(t),bytes=await fixturePetpack(),p=await readPetpack(bytes);assert.equal(p.pet.id,'fixture-pet');assert.equal(p.files.size,11);const original=new PetRegistry({}),old=structuredClone(original.pets[0]);const installed=await installPetpack(dir,bytes,{expectedSHA256:sha256(bytes)});assert.match(installed.appearance.character,/^community-[a-f0-9]{24}$/);const entries=await loadCustomAppearances(dir);setCustomAppearances(entries);const pet=original.create({character:installed.appearance.character,appearance:installed.appearance.id});assert.equal(appearanceInfo(pet).custom,true);assert.deepEqual(original.pets[0],old);assert.equal((await installPetpack(dir,bytes)).existing,true);const restored=new PetRegistry(original.config);assert.equal(restored.pets[1].character,installed.appearance.character);});
test('archive whitelist and optional expected hashes reject executable or mismatched packages',async t=>{const dir=await data(t);for(const name of ['manifest.js','index.html','scripts/start.js'])await assert.rejects(readPetpack(await fixturePetpack({[name]:Buffer.from('bad')})),/非法/);const good=await fixturePetpack();await assert.rejects(installPetpack(dir,good,{expectedSHA256:'0'.repeat(64)}),/哈希/);await assert.rejects(installPetpack(dir,good,{expectedIdentity:{id:'different',version:'1.0.0'}}),/版本/);await assert.rejects(readPetpack(await fixturePetpack({}, {minAppVersion:'99.0.0'})),/兼容版本/);assert.equal((await loadCustomAppearances(dir)).length,0);});
test('Claude built-in resources export into portable data-only packages',async t=>{const dir=await data(t),result=await exportPetpack({dataDir:dir,pet:{character:'claude',appearance:'classic'},details:{id:'my-claude',author:'alice',license:'Personal test',version:'1.0.0'}});const p=await readPetpack(result.bytes);assert.equal(p.pet.name,'Claude');assert.equal(p.manifest.clips.idle.frames[0],24);assert.equal(p.manifest.clips.sleep.sourceFrames,64);assert.equal(p.files.has('manifest.js'),false);});

test('cloud dragon fractional timing exports, installs and reexports with all variants and interactions',async t=>{
 const dir=await data(t),sourceFile=new URL('../assets/chatgpt-dragon/actions-v1/manifest.json',import.meta.url),original=await readFile(sourceFile,'utf8'),source=JSON.parse(original);
 const details={id:'cloud-dragon-timing',author:'QA',license:'Personal test',version:'1.0.0'};
 const exported=await exportPetpack({dataDir:dir,pet:{character:'chatgpt',appearance:'cloud-dragon'},details}),pack=await readPetpack(exported.bytes);
 assert.deepEqual(pack.manifest.variants,['pixel','original']);assert.equal(Object.keys(pack.manifest.clips).length,10);
 for(const [state,clip] of Object.entries(source.clips)){
  const result=pack.manifest.clips[state];assert.deepEqual(result.frames,clip.frames);assert.equal(result.loop,clip.loop);assert.equal(result.loopFrom,clip.loopFrom);
  let sourceTime=0,exportTime=0;for(let i=0;i<clip.durations.length;i++){sourceTime+=clip.durations[i];exportTime+=result.durations[i];assert.ok(Number.isInteger(result.durations[i]));assert.ok(Math.abs(sourceTime-exportTime)<=0.500000001);}
 }
 for(const variant of ['','original/'])assert.deepEqual(pack.files.get(variant+'sprites/idle.png'),await readFile(new URL('../assets/chatgpt-dragon/actions-v1/'+variant+'idle.png',import.meta.url)));
 const installed=await installPetpack(dir,exported.bytes);setCustomAppearances(await loadCustomAppearances(dir));
 const again=await exportPetpack({dataDir:dir,pet:{character:installed.appearance.character,appearance:installed.appearance.id},details:{...details,id:'cloud-dragon-roundtrip'}}),restored=await readPetpack(again.bytes);
 assert.deepEqual(restored.manifest.clips,pack.manifest.clips);assert.equal(await readFile(sourceFile,'utf8'),original);
});

test('incoming petpacks still reject fractional frame durations',async()=>{
 const base=await readPetpack(await fixturePetpack()),manifest=structuredClone(base.manifest);manifest.clips.idle.durations[0]=80.5;
 await assert.rejects(readPetpack(await fixturePetpack({'manifest.json':Buffer.from(JSON.stringify(manifest))})),/无效动作 idle/);
});

test('portable click and head-pat clips round-trip without replacing eight session actions',async t=>{
 const dir=await data(t),base=await readPetpack(await fixturePetpack()),manifest=structuredClone(base.manifest);
 for(const state of ['click','pet'])manifest.clips[state]={...manifest.clips.done,file:'sprites/'+state+'.png'};
 const bytes=await fixturePetpack({'manifest.json':Buffer.from(JSON.stringify(manifest)),'sprites/click.png':base.files.get('sprites/done.png'),'sprites/pet.png':base.files.get('sprites/done.png')},{minAppVersion:'0.5.0'});
 const installed=await installPetpack(dir,bytes);const entries=await loadCustomAppearances(dir);assert.equal(entries.length,1);setCustomAppearances(entries);
 const exported=await exportPetpack({dataDir:dir,pet:{character:installed.appearance.character,appearance:installed.appearance.id},details:{id:'interaction-pet',author:'alice',license:'CC0',version:'1.0.0'}});
 const restored=await readPetpack(exported.bytes);assert.equal(restored.pet.minAppVersion,'0.5.0');assert.deepEqual(restored.manifest.clips.click.frames,manifest.clips.click.frames);assert.deepEqual(restored.files.get('sprites/pet.png'),base.files.get('sprites/done.png'));assert.equal(Object.keys(restored.manifest.clips).length,10);
 manifest.clips.pet.loop=true;await assert.rejects(readPetpack(await fixturePetpack({'manifest.json':Buffer.from(JSON.stringify(manifest)),'sprites/click.png':base.files.get('sprites/done.png'),'sprites/pet.png':base.files.get('sprites/done.png')})),/单次/);
});

test('library keeps versions offline and only offers updates from the installed repository',async t=>{
 const dir=await data(t),source={market:'http://example.com',versionId:'a'.repeat(48),github:{repoId:42,owner:'alice',repo:'pet'}};
 await installPetpack(dir,await fixturePetpack(),{source});await installPetpack(dir,await fixturePetpack({}, {version:'1.1.0'}),{source:{...source,versionId:'b'.repeat(48)}});
 let offline=false;const service=new MarketService(dir,{fetcher:async()=>{if(offline)throw new Error('offline');return new Response(JSON.stringify([{id:'c'.repeat(48),status:'approved',repository:'alice/pet',pet:{id:'fixture-pet',version:'1.2.0'}},{id:'d'.repeat(48),status:'approved',repository:'attacker/pet',pet:{id:'fixture-pet',version:'9.0.0'}}]));}});await service.configure('http://example.com');
 const checked=await service.library({checkUpdates:true});assert.deepEqual(checked.groups[0].versions.map(v=>v.version),['1.1.0','1.0.0']);assert.equal(checked.groups[0].update.version,'1.2.0');
 offline=true;const failed=await service.library({checkUpdates:true});assert.equal(failed.groups[0].versions.length,2);assert.match(failed.error,/offline/);
 assert.equal((await service.library()).groups[0].versions.length,2);
});
test('desktop library reuses validated entries and covers, then reflects a reloaded catalog',async t=>{
 const dir=await data(t);await installPetpack(dir,await fixturePetpack());
 const appearances=await loadCustomAppearances(dir),service=new MarketService(dir,{fetcher:async()=>{throw Error('local library must not access network');}});
 service.installed=async()=>{throw Error('validated desktop entries must not be rescanned');};
 const first=await service.library({appearances});assert.equal(first.groups.length,1);
 const coverFile=path.join(appearances[0].root,'cover.png'),original=await readFile(coverFile);
 // Cached covers survive a transient unavailable file; new catalog entries read again.
 await rm(coverFile);assert.deepEqual(await service.library({appearances}),first);
 const reloaded=await loadCustomAppearances(dir),fresh=await service.library({appearances:reloaded});
 assert.notEqual(fresh.groups[0].cover,'data:image/png;base64,'+original.toString('base64'));
 assert.deepEqual((await service.library({appearances:[]})).groups,[]);
});
test('market accepts changed GitHub packages while enforcing identity, archive safety and redirect restrictions',async t=>{const dir=await data(t),bytes=await fixturePetpack(),id='a'.repeat(48),record={pet:{id:'fixture-pet',version:'1.0.0'},sha256:sha256(bytes),size:bytes.length,url:'https://github.com/alice/pet/releases/download/v1/test.petpack',source:{assetId:42}};let changed=false,evil=false;const service=new MarketService(dir,{fetcher:async url=>{if(String(url).includes('/install'))return new Response(JSON.stringify({...record,sha256:changed?undefined:record.sha256,size:changed?bytes.length+100:record.size}));if(evil)return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});return new Response(bytes);}});await service.configure('http://127.0.0.1:9633');changed=true;const installed=await service.install(id);assert.equal(installed.installed,true);assert.equal(installed.appearance.sha256,sha256(bytes));changed=false;evil=true;await assert.rejects(service.install(id),/GitHub/);evil=false;assert.equal((await service.install(id)).installed,true);assert.equal((await service.configure('http://example.com')).url,'http://example.com');await assert.rejects(service.configure('ftp://example.com'),/HTTPS/);});



test('market keeps installed status independent of submission hashes and rejects unsafe replacement packages',async t=>{
 const dir=await data(t),id='b'.repeat(48),record={pet:{id:'fixture-pet',version:'1.0.0'},sha256:'0'.repeat(64),size:1,url:'https://github.com/alice/pet/releases/download/v1/test.petpack',source:{repoId:42}};
 let bytes=await fixturePetpack();const service=new MarketService(dir,{fetcher:async url=>String(url).includes('/api/pets')?new Response(JSON.stringify([{...record,id}])):String(url).includes('/install')?new Response(JSON.stringify(record)):new Response(bytes)});
 assert.equal((await service.install(id)).installed,true);
 assert.equal((await service.list()).pets[0].installed,true);
 bytes=await fixturePetpack({}, {id:'different-pet'});await assert.rejects(service.install(id),/作品 ID/);
 bytes=await fixturePetpack({}, {version:'2.0.0'});await assert.rejects(service.install(id),/版本/);
 bytes=await fixturePetpack({'index.html':Buffer.from('bad')});await assert.rejects(service.install(id),/非法/);
 assert.equal((await service.installed()).length,1);
});

test('market reuses identical local creation despite changed publisher and package metadata',async t=>{
 const dir=await data(t),store=new CreationStore(dir),first=await installPetpack(dir,await fixturePetpack());
 const local={...first.appearance,character:'custom-local-author',community:false,projectId:'editable-project'};await store.write('characters',{id:local.character,name:'本地角色'});await store.write('appearances',local);
 const bytes=await fixturePetpack({}, {name:'市场名称',author:'fourzkw',license:'个人使用，禁止商用'}),source={market:'https://market.example',versionId:'a'.repeat(48),github:{repoId:99}};
 const result=await installPetpack(dir,bytes,{source});assert.equal(result.existing,true);assert.equal(result.appearance.id,local.id);assert.equal(result.appearance.character,local.character);assert.equal(result.appearance.projectId,'editable-project');assert.equal((await store.list('appearances')).length,1);
 const service=new MarketService(dir);assert.equal((await service.installed())[0].marketSources[0].github.repoId,99);
});
test('legacy copies form one library role and remap instances without deleting original records',async t=>{
 const dir=await data(t),store=new CreationStore(dir),first=(await installPetpack(dir,await fixturePetpack())).appearance;
 const duplicate={...first,id:'legacy-copy',character:'community-legacy-copy',createdAt:'2099-01-01T00:00:00Z'};await cp(first.root,path.join(dir,'appearances',duplicate.id),{recursive:true});await store.write('appearances',duplicate);
 const entries=await loadCustomAppearances(dir);assert.equal(entries.length,1);assert.equal(entries[0].aliases[0].id,duplicate.id);
 const pets=[{id:'one',character:duplicate.character,appearance:duplicate.id,x:23,follow:{mode:'global'}}];resolveAppearanceAliases(pets,entries);assert.equal(pets[0].appearance,first.id);assert.equal(pets[0].x,23);assert.deepEqual(pets[0].follow,{mode:'global'});assert.equal((await store.list('appearances')).length,2);
});
test('same-name roles with different action sprites remain separate',async t=>{
 const dir=await data(t);await installPetpack(dir,await fixturePetpack());const im=new PNG({width:32,height:16});im.data.fill(255);const changed=await fixturePetpack({'sprites/idle.png':PNG.sync.write(im,{colorType:6})});const result=await installPetpack(dir,changed,{source:{github:{repoId:99}}});assert.notEqual(result.existing,true);assert.equal((await loadCustomAppearances(dir)).length,2);
});
test('installed cards include offline covers and uninstall removes aliases without touching other appearances',async t=>{
 const dir=await data(t),installed=await installPetpack(dir,await fixturePetpack()),store=new CreationStore(dir),entry=installed.appearance;
 const alias={...entry,id:'legacy-installed-copy'};await cp(path.join(dir,'appearances',entry.id),path.join(dir,'appearances',alias.id),{recursive:true});await store.write('appearances',alias);
 const service=new MarketService(dir,{fetcher:async()=>{throw Error('offline');}}),library=await service.library();assert.match(library.groups[0].cover,/^data:image\/png;base64,/);assert.equal(library.groups[0].author,'alice');
 await assert.rejects(service.uninstall('../outside'),/未安装/);await service.uninstall(library.groups[0].versions[0].id);assert.equal((await service.library()).groups.length,0);assert.equal((await store.list('appearances')).length,0);
 await assert.rejects(readFile(path.join(dir,'appearances',entry.id,'manifest.json')),e=>e.code==='ENOENT');await assert.rejects(readFile(path.join(dir,'appearances',alias.id,'manifest.json')),e=>e.code==='ENOENT');
});
