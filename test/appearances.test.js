import test from 'node:test';
import assert from 'node:assert/strict';
import {CHARACTERS,CHARACTER_IDS,appearanceInfo,appearanceSelection} from '../src/characters.js';
import {PetRegistry,migratePetConfig} from '../src/pet-registry.js';
import {petMenuTemplate} from '../desktop/pet-menu.js';

test('legacy appearances migrate to one ChatGPT role with stable IDs and pixel defaults',()=>{
  const pets=['claude','deepseek','chatgpt','chatgpt-dragon','gemini'].map((character,i)=>({id:'p'+i,name:'Pet '+i,character,scale:1.25,x:-100+i*50,y:200,enabled:i!==0,petVisible:i!==1,follow:{mode:'source',source:'codex'}}));
  const before={schemaVersion:2,global:{launchAtLogin:false},pets},after=migratePetConfig(before);
  assert.equal(after.pets.length,pets.length);assert.deepEqual(CHARACTER_IDS,['claude','deepseek','chatgpt']);
  for(const [i,pet] of after.pets.entries()){
    for(const key of ['id','name','scale','x','y','enabled','petVisible','follow'])assert.deepEqual(pet[key],pets[i][key]);
    assert.equal(pet.variant,'pixel');
  }
  assert.equal(after.pets[2].appearance,'white-dragon');assert.equal(after.pets[3].appearance,'cloud-dragon');assert.equal(after.pets[3].character,'chatgpt');
  assert.deepEqual(migratePetConfig(after),after);assert.equal(before.pets[3].character,'chatgpt-dragon');
});
test('changing format or appearance is per pet, persists and duplicates without altering follow rules',()=>{
  const registry=new PetRegistry({}),first=registry.create({character:'chatgpt',appearance:'cloud-dragon',follow:{mode:'source',source:'codex'}}),second=registry.duplicate(first.id);
  registry.update(first.id,{variant:'original'});assert.equal(first.appearance,'cloud-dragon');assert.equal(second.variant,'pixel');
  registry.update(first.id,{appearance:'white-dragon'});assert.equal(first.character,'chatgpt');assert.equal(first.variant,'original');assert.equal(second.appearance,'cloud-dragon');
  const copy=registry.duplicate(first.id);assert.equal(copy.appearance,'white-dragon');assert.equal(copy.variant,'original');assert.deepEqual(copy.follow,first.follow);
  assert.deepEqual(migratePetConfig(registry.config),registry.config);
  registry.update(first.id,{character:'deepseek'});assert.equal(first.appearance,'whale');assert.equal(first.variant,'original');
  assert.throws(()=>registry.update(first.id,{appearance:'whale-classic'}));assert.equal(first.variant,'original');
});
test('invalid role/appearance/format combinations reject the whole update atomically',()=>{
  const registry=new PetRegistry({}),pet=registry.create({character:'chatgpt',appearance:'cloud-dragon'}),before=structuredClone(pet);
  for(const patch of [{appearance:'star-cat'},{variant:'unknown'},{appearance:null},{character:'unknown'},{character:'claude',variant:'original'},{name:'changed',appearance:'missing'}]){
    assert.throws(()=>registry.update(pet.id,patch));assert.deepEqual(pet,before);
  }
  for(const character of CHARACTERS)for(const skin of character.appearances)for(const variant of skin.variants)assert.equal(appearanceSelection({character:character.id,appearance:skin.id,variant}).variant,variant);
});
test('right-click distinguishes role, retained appearances and available formats',()=>{
  const registry=new PetRegistry({}),pet=registry.create({character:'chatgpt'});
  const build=()=>petMenuTemplate(pet,{update:patch=>registry.update(pet.id,patch),openSettings:()=>{}});
  let menu=build();const appearances=menu.find(x=>x.id==='appearance').submenu;assert.equal(appearances.length,CHARACTERS.find(c=>c.id==='chatgpt').appearances.length);
  appearances.find(x=>x.id==='appearance-cloud-dragon').click();menu=build();menu.find(x=>x.id==='variant').submenu.find(x=>x.id==='variant-original').click();
  assert.equal(pet.character,'chatgpt');assert.equal(appearanceInfo(pet).name,'云羽龙姬');assert.equal(pet.variant,'original');
  menu.find(x=>x.id==='character').submenu.find(x=>x.id==='character-claude').click();
  assert.equal(build().find(x=>x.id==='variant').submenu.find(x=>x.id==='variant-original').enabled,false);
});

test('retired selections migrate without changing instance settings, and cannot be selected again',()=>{
  const pets=[{id:'g',name:'自定义名称',character:'gemini',appearance:'star-cat',variant:'original'},{id:'d',name:'鲸鱼',character:'deepseek',appearance:'whale-classic',variant:'pixel'}].map(p=>({...p,x:-50,y:340,scale:1.25,enabled:false,petVisible:false,follow:{mode:'source',source:'cursor'}}));
  const raw={schemaVersion:2,global:{launchAtLogin:true},pets},snapshot=structuredClone(raw),after=migratePetConfig(raw);
  assert.deepEqual(raw,snapshot);assert.deepEqual(after.global,{...raw.global,theme:'paper-journal'});
  assert.deepEqual(after.pets.map(p=>[p.character,p.appearance,p.variant]),[['chatgpt','cloud-dragon','original'],['deepseek','whale','pixel']]);
  for(let i=0;i<pets.length;i++)for(const key of ['id','name','x','y','scale','enabled','petVisible','follow'])assert.deepEqual(after.pets[i][key],pets[i][key]);
  assert.deepEqual(migratePetConfig(after),after);
  assert.equal(migratePetConfig({character:'gemini',variant:'pixel'}).pets[0].appearance,'cloud-dragon');
  const registry=new PetRegistry(after);assert.throws(()=>registry.create({character:'gemini'}));assert.throws(()=>registry.create({character:'deepseek',appearance:'whale-classic'}));
});
