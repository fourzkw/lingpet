import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateAppearance} from '../src/creation/validation.js';
import {STATES} from '../src/creation/store.js';
import {appearanceInfo} from '../src/characters.js';
import {PetRegistry,migratePetConfig} from '../src/pet-registry.js';
import {clipFrame} from '../desktop/action-clips.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('white dragon uses the approved fourth image and eight fresh H3 clips in both variants',async()=>{
 const root=new URL('../assets/chatgpt-white-dragon-h3/actions-v1/',import.meta.url),report=await validateAppearance(fileURLToPath(root));assert.equal(report.valid,true,report.errors.join(';'));assert.equal(report.complete,true);assert.deepEqual(report.variants,['original','pixel']);
 const m=report.manifest,browser=(await import(new URL('manifest.js',root))).default;assert.deepEqual(browser,m);assert.equal(m.tileSize,192);assert.equal(m.original.tileSize,384);
 const p=JSON.parse(await readFile(new URL('provenance.json',root),'utf8'));assert.equal(p.reusedPreviousAnimationAssets,false);assert.equal(p.visualInputSha256,sha(await readFile(new URL('../output/white-dragon-review-v1/base-v4.png',import.meta.url))));assert.equal(p.visualInputSha256,sha(await readFile(new URL('../base.png',root))));
 for(const state of STATES){assert.equal(m.clips[state].sourceFrames,63);assert.match(p.videos[state].model,/minimax_h3/);assert.equal(p.videos[state].sha256,sha(await readFile(new URL('../output/video/white-dragon-h3-v1/'+state+'/video.mp4',import.meta.url))));if(['done','error'].includes(state)){assert.equal(m.clips[state].loop,false);assert.equal(clipFrame(m.clips[state],60000),m.clips[state].frames.at(-1));}if(['thinking','approval','sleep'].includes(state)){assert.equal(m.clips[state].loopFrom,42);const allowed=new Set(m.clips[state].frames.slice(42));assert.ok(allowed.has(clipFrame(m.clips[state],60000)));}}
 for(let frame=14;frame<=25;frame++)assert.equal(m.clips.idle.durations[frame],25);
 for(const [file,hash] of Object.entries(p.legacyAssets))assert.equal(sha(await readFile(new URL('../'+file,import.meta.url))),hash);
});
test('replacing white dragon artwork keeps appearance IDs, formats and instance settings',()=>{
 const raw={schemaVersion:2,global:{launchAtLogin:false},pets:[{id:'old-white',name:'白羽',character:'chatgpt',appearance:'white-dragon',variant:'pixel',scale:1.25,x:200,y:500,enabled:true,petVisible:false,follow:{mode:'source',source:'codex'}}]},after=migratePetConfig(raw),pet=after.pets[0];
 for(const key of Object.keys(raw.pets[0]))assert.deepEqual(pet[key],raw.pets[0][key]);assert.equal(appearanceInfo(pet).asset,'chatgpt-white-dragon-h3');assert.equal(appearanceInfo({character:'chatgpt',appearance:'cloud-dragon'}).asset,'chatgpt-dragon');assert.equal(appearanceInfo({character:'deepseek',appearance:'whale'}).asset,'deepseek-h3');
 const r=new PetRegistry(after);r.update(pet.id,{variant:'original'});assert.equal(r.get(pet.id).appearance,'white-dragon');assert.deepEqual(r.get(pet.id).follow,pet.follow);
});
