import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {GenerationAPISettings} from '../src/creation/generation-api-settings.js';
async function fixture(t){const dir=await mkdtemp(path.join(process.cwd(),'.test-generation-api-'));t.after(()=>rm(dir,{recursive:true,force:true}));return new GenerationAPISettings(dir);}
test('generation API configurations persist independently and never return stored keys',async t=>{
 const settings=await fixture(t);assert.equal((await settings.get()).image.protocol,'openai-images');assert.equal((await settings.get()).seedance.hasApiKey,false);
 await settings.configure('image',{url:'https://images.example/v1/generate',model:'image-model',apiKey:'image-secret'});
 const result=await settings.configure('video',{url:'http://localhost:8000/video',model:'video-model',apiKey:'video-secret'});
 assert.equal(result.image.hasApiKey,true);assert.equal(result.video.model,'video-model');assert.ok(!JSON.stringify(result).includes('secret'));
 assert.deepEqual(await new GenerationAPISettings(path.dirname(settings.store.root)).get(),result);
 await settings.configure('image',{apiKey:'',model:'new-image-model'});assert.equal((await settings.read()).image.apiKey,'image-secret');
 await settings.configure('image',{clearApiKey:true});assert.equal((await settings.get()).image.hasApiKey,false);assert.equal((await settings.read()).video.apiKey,'video-secret');
 await settings.configure('image',{url:'',model:'',clearApiKey:true});assert.equal((await settings.get()).image.url,'');
});
test('invalid generation API settings leave saved configuration intact',async t=>{
 const settings=await fixture(t);await settings.configure('image',{url:'https://image.example',model:'model'});const before=await readFile(settings.file,'utf8');
 for(const values of [{url:'file:///tmp/key'},{url:'https://user:pass@example.com'},{url:'invalid'},{url:''},{apiKey:'bad\nheader'},{model:42}])await assert.rejects(settings.configure('image',values));
 await assert.rejects(settings.configure('other',{}));assert.equal(await readFile(settings.file,'utf8'),before);
});
