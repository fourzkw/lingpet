import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CHARACTERS,appearanceInfo} from '../src/characters.js';
import {PetRegistry} from '../src/pet-registry.js';
import {existsSync} from 'node:fs';
import {clipFrame,clipDuration} from '../desktop/action-clips.js';

for(const [character,appearance,asset] of [['chatgpt','white-dragon-v2','chatgpt-q-v2'],['gemini','star-cat-v2','gemini-q-v2']]){
  test(asset+' has eight fresh H3 clips and two complete render variants',{skip:!CHARACTERS.find(c=>c.id===character)?.appearances.some(a=>a.id===appearance)||!existsSync(new URL('../assets/'+asset+'/actions-v1/manifest.json',import.meta.url))?'用户已停止制作，此素材尚未发布':false},async()=>{
    const root=new URL('../assets/'+asset+'/actions-v1/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
    const browser=(await import(new URL('manifest.js',root).href)).default;assert.deepEqual(browser,manifest);
    assert.deepEqual(Object.keys(manifest.clips),['idle','thinking','working','input','approval','done','error','sleep']);
    assert.equal(manifest.character,asset);assert.equal(manifest.original.tileSize,384);
    for(const [state,clip] of Object.entries(manifest.clips)){
      assert.equal(clip.sourceFrames,63);assert.equal(clip.frames.length,clip.durations.length);assert.ok(clip.frames.every(n=>n>=0&&n<63));assert.ok(clip.durations.every(n=>n>0));
      for(const [directory,size] of [['',1536],['original/',3072]]){const png=await readFile(new URL(directory+clip.file,root));assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);assert.equal(png[25],6);}
      if(['done','error'].includes(state))assert.equal(clipFrame(clip,60000),clip.frames.at(-1));
      if(['thinking','working','approval','sleep'].includes(state)){assert.equal(clip.loopFrom,36);const allowed=new Set(clip.frames.slice(clip.loopFrom));for(let t=clipDuration(clip);t<30000;t+=173)assert.ok(allowed.has(clipFrame(clip,t)));}
      const workflow=JSON.parse(await readFile(new URL('../output/video/'+asset+'/'+state+'/workflow.json',import.meta.url),'utf8'));
      const inputs=workflow['9'].inputs;assert.match(inputs.prompt,/NO pigeon toes/);assert.equal(inputs.length,124);assert.equal(workflow['1'].inputs.unet_name,'minimax_h3_fl2va_pruned_int8_convrot.safetensors');
      const history=JSON.parse(await readFile(new URL('../output/video/'+asset+'/'+state+'/history.json',import.meta.url),'utf8'));assert.equal(history.status.status_str,'success');assert.equal(history.status.completed,true);
    }
    const pet={character,appearance,variant:'pixel'};assert.equal(appearanceInfo(pet).asset,asset);assert.ok(clipDuration(manifest.clips.done)<=appearanceInfo(pet).doneMs);
    const source=await readFile(new URL('../output/imagegen/'+asset+'/base.png',import.meta.url));const provenance=JSON.parse(await readFile(new URL('provenance.json',root),'utf8'));
    assert.equal(provenance.visualInputSha256,createHash('sha256').update(source).digest('hex'));assert.equal(provenance.reusedPreviousPetAssets,false);
  });
}
test('unreleased GPT and Gemini drafts are hidden while existing forms remain selectable',()=>{
  const registry=new PetRegistry({});const old=registry.create({character:'chatgpt',appearance:'white-dragon',follow:{mode:'source',source:'codex'}});const snapshot=structuredClone(old);
  for(const [character,appearance] of [['chatgpt','white-dragon-v2'],['gemini','star-cat-v2']]){
    assert.throws(()=>registry.create({character,appearance,variant:'original'}),/没有此形象|未知角色/);
  }
  assert.deepEqual(old,snapshot);assert.ok(CHARACTERS.find(c=>c.id==='chatgpt').appearances.some(s=>s.id==='cloud-dragon'));assert.ok(!CHARACTERS.some(c=>c.id==='gemini'));
});
