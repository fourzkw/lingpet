import test from 'node:test';
import assert from 'node:assert/strict';
import {PET_SCALES,scaleStep,normalizePetScale,petIsVisible,visibilityPatch} from '../src/pet-display.js';
import {PetRegistry,migratePetConfig} from '../src/pet-registry.js';

test('nine sizes have normal size in the center and preserve existing menu sizes',()=>{
  assert.equal(PET_SCALES.length,9);assert.equal(PET_SCALES[4],1);
  assert.equal(PET_SCALES[0],.5);assert.equal(PET_SCALES[8],1.5);
  for(const scale of PET_SCALES)assert.equal(normalizePetScale(scale),scale);
  for(const scale of [.75,1,1.25,1.5])assert.equal(PET_SCALES[scaleStep(scale)],scale);
  const registry=new PetRegistry({}),id=registry.pets[0].id;
  for(const scale of PET_SCALES){registry.update(id,{scale});assert.equal(registry.get(id).scale,scale);}
  assert.throws(()=>registry.update(id,{scale:.49}));assert.throws(()=>registry.update(id,{scale:1.51}));
  assert.equal(migratePetConfig({scale:1.2}).pets[0].scale,1.25);
});

test('legacy paused pets appear hidden and recover with one show action without changing follow',()=>{
  const registry=new PetRegistry({enabled:false,petVisible:true}),pet=registry.pets[0];
  const follow=structuredClone(pet.follow);assert.equal(petIsVisible(pet),false);
  registry.update(pet.id,visibilityPatch(true));assert.equal(petIsVisible(pet),true);assert.equal(pet.enabled,true);
  registry.update(pet.id,visibilityPatch(false));assert.equal(petIsVisible(pet),false);
  assert.deepEqual(pet.follow,follow);assert.equal(pet.enabled,true);
  registry.update(pet.id,visibilityPatch(true));assert.equal(petIsVisible(pet),true);
});
