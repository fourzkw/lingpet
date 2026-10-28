import test from 'node:test';
import assert from 'node:assert/strict';
import {qwenWorkflow} from '../src/creation/workflows.js';
import {creationSchemas} from '../src/creation/tools.js';
const models={qwenModel:'model',qwenClip:'clip',qwenVae:'vae'};
const params=patch=>creationSchemas.board_pet_generate_image.parse({projectId:'p',prompt:'只改变 <image1> 的衣服颜色，参考 <image2>。',...patch});

test('Qwen text generation has an explicit canvas independent of encode latent',()=>{
 const g=qwenWorkflow(params({width:768,height:1024}),models,[],'test');
 assert.equal(g['8'].class_type,'EmptyLatentImage');assert.deepEqual(g['8'].inputs,{width:768,height:1024,batch_size:1});assert.deepEqual(g['5'].inputs.latent_image,['8',0]);assert.equal(g['4'].inputs.vae,undefined);
 const square=qwenWorkflow(params({}),models,[],'test');assert.equal(square['8'].inputs.width,1024);assert.equal(square['8'].inputs.height,1024);
});
test('Qwen editing follows first reference by default and preserves ordered alpha inputs',()=>{
 const g=qwenWorkflow(params({}),models,['target.png','style.png'],'test');
 assert.deepEqual(g['5'].inputs.latent_image,['4',2]);assert.equal(g['8'],undefined);assert.equal(g['4'].inputs.resolution,0);assert.equal(g['20'].inputs.image,'target.png');assert.equal(g['23'].inputs.image,'style.png');
 assert.deepEqual(g['4'].inputs['images.image_1'],['22',0]);assert.deepEqual(g['4'].inputs['images.image_2'],['25',0]);assert.equal(g['22'].class_type,'JoinImageWithAlpha');assert.deepEqual(g['22'].inputs.alpha,['21',0]);
 const resized=qwenWorkflow(params({size:768}),models,['target.png'],'test');assert.equal(resized['4'].inputs.resolution,768);assert.deepEqual(resized['5'].inputs.latent_image,['4',2]);
});
test('Qwen custom editing canvas, optional cache and sampling remain explicit choices',()=>{
 const g=qwenWorkflow(params({width:512,height:768,cache:true,cacheDevice:'cpu',sampler:'heun',scheduler:'karras'}),models,['target.png'],'test');
 assert.deepEqual(g['5'].inputs.latent_image,['8',0]);assert.deepEqual(g['5'].inputs.model,['9',0]);assert.equal(g['9'].class_type,'QwenImage21Cache');assert.equal(g['9'].inputs.dtype,'default');assert.equal(g['9'].inputs.device,'cpu');assert.equal(g['5'].inputs.sampler_name,'heun');assert.equal(g['5'].inputs.scheduler,'karras');assert.equal(g['5'].inputs.cfg,1);
 assert.equal(qwenWorkflow(params({}),models,[],'test')['9'],undefined);
 assert.throws(()=>params({size:31}));assert.throws(()=>params({width:2049,height:1024}));
});
