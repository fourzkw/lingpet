import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {availableBuiltinAssets,retainExternalAppearances} from '../src/bundled-appearances.js';
import {BUILTIN_CHARACTERS,CHARACTERS,configureBundledAssets,setCustomAppearances} from '../src/characters.js';
import {loadCustomAppearances} from '../src/creation/catalog.js';
import {PetRegistry} from '../src/pet-registry.js';
import {PACKAGE_ROOT} from '../src/paths.js';
import {MarketService} from '../src/market/service.js';
async function data(t){const dir=await mkdtemp(path.join(process.cwd(),'.test-data-bundled-'));t.after(async()=>{setCustomAppearances([]);configureBundledAssets(BUILTIN_CHARACTERS.flatMap(c=>c.appearances.map(a=>a.asset)));assert.equal(path.dirname(dir),process.cwd());await rm(dir,{recursive:true,force:true});});return dir;}
test('missing optional resources expose only Claude and installed appearances remain selectable',async t=>{
 const dir=await data(t);await mkdir(path.join(dir,'assets/claude/actions-v2'),{recursive:true});await writeFile(path.join(dir,'assets/claude/actions-v2/atlas.png'),'fixture');
 const assets=await availableBuiltinAssets(dir);assert.deepEqual(assets,['claude']);configureBundledAssets(assets);assert.deepEqual(CHARACTERS.map(c=>c.id),['claude']);
 setCustomAppearances([{id:'imported-whale',character:'community-whale',characterName:'鲸鱼娘',community:true,name:'鲸鱼娘',variants:['pixel','original'],pixelSize:192,doneMs:5250}]);
 assert.equal(CHARACTERS.length,2);assert.ok(new PetRegistry({}).create({character:'community-whale',appearance:'imported-whale',variant:'original'}));
});
test('an existing whale is retained outside the installer without changing saved settings',async t=>{
 const dir=await data(t),raw={schemaVersion:2,global:{},pets:[{id:'pet',name:'我的鲸鱼娘',character:'deepseek',appearance:'whale',variant:'original',x:12,y:34,follow:{mode:'source',source:'codex'}}]},text=JSON.stringify(raw);await writeFile(path.join(dir,'settings.json'),text);
 assert.deepEqual(await retainExternalAppearances(dir,['claude'],{roots:[PACKAGE_ROOT]}),['whale']);assert.equal(await readFile(path.join(dir,'settings.json'),'utf8'),text);
 configureBundledAssets(['claude']);const entries=await loadCustomAppearances(dir);assert.equal(entries[0].asset,'custom:whale');setCustomAppearances(entries);const pet=new PetRegistry(raw).pets[0];assert.equal(pet.appearance,'whale');assert.equal(pet.variant,'original');assert.equal(pet.x,12);assert.deepEqual(pet.follow,raw.pets[0].follow);
 const market=new MarketService(dir,{fetcher:async()=>{throw Error('offline');}}),library=await market.library();assert.equal(library.groups.length,1);assert.equal(library.groups[0].origin,'retained');assert.equal(library.groups[0].versions[0].id,'whale');assert.deepEqual(library.groups[0].versions[0].interactions,['click','pet']);assert.match(library.groups[0].cover,/^data:image\/png;base64,/);
 assert.deepEqual(await retainExternalAppearances(dir,['claude']),[]);const manifest=JSON.parse(await readFile(path.join(dir,'appearances/whale/manifest.json'),'utf8'));assert.equal(Object.keys(manifest.clips).length,10);
});
test('missing old cache gives an actionable error and never rewrites settings as a default pet',async t=>{
 const dir=await data(t),text=JSON.stringify({schemaVersion:2,pets:[{id:'pet',character:'chatgpt',appearance:'cloud-dragon'}]});await writeFile(path.join(dir,'settings.json'),text);
 await assert.rejects(retainExternalAppearances(dir,['claude']),/现有设置未修改/);assert.equal(await readFile(path.join(dir,'settings.json'),'utf8'),text);
});
