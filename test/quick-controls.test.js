import test from 'node:test';
import assert from 'node:assert/strict';
import {quickControlsModel} from '../desktop/quick-controls-model.js';
import {petMenuTemplate} from '../desktop/pet-menu.js';
import {PetRegistry} from '../src/pet-registry.js';

test('popup model exposes inline size separately and retains scoped actions without callbacks',()=>{
  const registry=new PetRegistry({}),first=registry.pets[0],clicked=registry.create({character:'deepseek'});
  const {items,actions}=quickControlsModel(petMenuTemplate(clicked,{update:patch=>registry.update(clicked.id,patch)}));
  assert.ok(!items.some(item=>item.id==='scale'),'size is rendered by the inline ruler');
  assert.ok(!JSON.stringify(items).includes('click'));
  actions.get('character-claude')();assert.equal(clicked.character,'claude');assert.equal(first.scale,1);
  actions.get('always-on-top')({checked:false});assert.equal(clicked.alwaysOnTop,false);assert.equal(first.alwaysOnTop,true);
  const follow=items.find(item=>item.id==='follow').children[2];
  actions.get(follow.id)();assert.deepEqual(clicked.follow,{mode:'source',source:'cursor'});
  assert.equal(actions.has(items[0].id),false,'disabled header cannot execute an action');
});
