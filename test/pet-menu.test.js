import test from 'node:test';
import assert from 'node:assert/strict';
import {petMenuTemplate} from '../desktop/pet-menu.js';
import {PetRegistry} from '../src/pet-registry.js';
import {CHARACTERS} from '../src/characters.js';

test('quick controls act on the clicked pet with one visibility control and nine sizes',()=>{
  const registry=new PetRegistry({}),first=registry.pets[0],clicked=registry.create({name:'ChatGPT',character:'chatgpt'});let opened=0;
  const menu=petMenuTemplate(clicked,{update:patch=>registry.update(clicked.id,patch),openSettings:()=>opened++});
  assert.equal(opened,0);assert.equal(menu.find(item=>item.id==='character').submenu.length,CHARACTERS.length);
  assert.ok(!menu.find(item=>item.id==='character').submenu.some(item=>item.id==='character-gemini'));menu.find(item=>item.id==='character').submenu.find(item=>item.id==='character-deepseek').click();assert.equal(clicked.character,'deepseek');assert.ok(!petMenuTemplate(clicked,{update:()=>{}}).find(item=>item.id==='appearance').submenu.some(item=>item.id==='appearance-whale-classic'));assert.equal(first.character,'claude');
  const sizes=menu.find(item=>item.id==='scale').submenu;assert.equal(sizes.length,9);assert.match(sizes[4].label,/100%.*正常/);
  sizes[6].click();assert.equal(clicked.scale,1.25);assert.equal(first.scale,1);
  menu.find(item=>item.id==='always-on-top').click({checked:false});assert.equal(clicked.alwaysOnTop,false);assert.equal(first.alwaysOnTop,true);
  menu.find(item=>item.id==='visibility').click();assert.equal(clicked.petVisible,false);assert.equal(clicked.enabled,true);assert.equal(first.petVisible,true);
  assert.ok(!menu.some(item=>item.id==='pause'));
  const hidden=petMenuTemplate(clicked,{update:patch=>registry.update(clicked.id,patch)});assert.equal(hidden.find(item=>item.id==='visibility').label,'显示桌宠');
  hidden.find(item=>item.id==='visibility').click();assert.equal(clicked.petVisible,true);assert.equal(first.enabled,true);
  menu.find(item=>item.id==='workbench').click();assert.equal(opened,1);
});
test('menu represents a fixed session and offers demo recovery only during a demo',()=>{
  const pet=new PetRegistry({}).pets[0];pet.follow={mode:'session',source:'codex',scopeId:'local',sessionId:'a'};let ended=0,patch;
  const menu=petMenuTemplate(pet,{demo:true,update:value=>patch=value,endDemo:()=>ended++,openSettings:()=>{}});
  assert.ok(menu.find(item=>item.id==='follow').submenu.some(item=>item.checked&&item.label==='已固定当前会话'));
  menu.find(item=>item.id==='follow').submenu.find(item=>item.label==='自动跟随所有来源').click();assert.deepEqual(patch,{follow:{mode:'global'}});
  menu.find(item=>item.id==='end-demo').click();assert.equal(ended,1);
  assert.ok(!petMenuTemplate(pet,{update:()=>{}}).some(item=>item.id==='end-demo'));
});
