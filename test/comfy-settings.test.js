import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {ComfySettings} from '../src/creation/comfy-settings.js';
import {CreationStore,save} from '../src/creation/store.js';
import {DEFAULT_COMFY_MODELS} from '../src/creation/defaults.js';
async function fixture(t){const dir=await mkdtemp(path.join(process.cwd(),'.test-comfy-settings-'));t.after(()=>rm(dir,{recursive:true,force:true}));return {dir,settings:new ComfySettings(dir),store:new CreationStore(dir)};}
test('ComfyUI settings share the creation configuration and preserve unrelated values',async t=>{
 const {dir,settings,store}=await fixture(t);assert.equal((await settings.get()).url,'http://127.0.0.1:8188');
 await save(path.join(store.root,'config.json'),{url:'http://localhost:8188',models:{qwenClip:'existing.safetensors',extension:'keep'},customOption:42});
 const result=await settings.configure({url:'http://localhost:8189',models:{qwenModel:'qwen/model.safetensors',h3Model:'h3.safetensors'},python:'C:\\Python312\\python.exe',targetedInterrupt:true});
 assert.equal(result.models.qwenClip,'existing.safetensors');assert.equal(result.models.h3Model,'h3.safetensors');assert.equal((await new CreationStore(dir).config()).url,result.url);assert.equal((await store.config()).customOption,42);assert.equal((await store.config()).models.extension,'keep');assert.equal(result.targetedInterrupt,true);
 assert.deepEqual(await new ComfySettings(dir).get(),result);await settings.configure({models:{h3Model:''},python:'',targetedInterrupt:false});assert.equal((await settings.get()).models.h3Model,'');
});
test('invalid ComfyUI inputs do not overwrite creation configuration',async t=>{
 const {settings,store}=await fixture(t);await settings.configure({url:'http://localhost:8188'});const before=await store.config();
 for(const value of [{url:''},{url:'file:///tmp'},{url:'https://user:pass@example.com'},{models:{qwenModel:42}},{python:'bad\npath'},{targetedInterrupt:'true'}])await assert.rejects(settings.configure(value));
 assert.deepEqual(await store.config(),before);
});

test('ComfyUI model defaults fill missing bindings while retaining explicit choices and cleared fields',async t=>{
 const {settings,store}=await fixture(t);assert.deepEqual((await settings.get()).models,DEFAULT_COMFY_MODELS);
 await save(path.join(store.root,'config.json'),{models:{qwenModel:'my-qwen.safetensors',h3Clip:''},python:'custom-python',customOption:42});
 const config=await store.config();assert.equal(config.models.qwenModel,'my-qwen.safetensors');assert.equal(config.models.h3Clip,'');assert.equal(config.models.h3Vae,DEFAULT_COMFY_MODELS.h3Vae);assert.equal(config.python,'custom-python');assert.equal(config.customOption,42);
 config.models.qwenVae='changed';assert.equal((await store.config()).models.qwenVae,DEFAULT_COMFY_MODELS.qwenVae);
});
