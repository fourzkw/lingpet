import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {CreationService} from '../src/creation/service.js';
import {GenerationAPISettings} from '../src/creation/generation-api-settings.js';
import {creationSchemas} from '../src/creation/tools.js';

test('ImageGen follows priority and host capability without submitting or creating fake tasks',async t=>{
 const dir=await mkdtemp(path.join(process.cwd(),'.test-imagegen-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 let calls=0;const service=new CreationService(dir,{fetcher:async()=>{calls++;throw Error('offline');}}),settings=new GenerationAPISettings(dir);
 const project=await service.project({action:'create',brief:'圆形小猫',constraints:['透明背景']});
 const ref=await service.project({action:'add_reference',projectId:project.id,base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='});
 const priorities=await settings.priorities();priorities.image.sort((a,b)=>(a.id==='imagegen'?-1:b.id==='imagegen'?1:0));await settings.setPriorities(priorities);
 const input=creationSchemas.board_pet_generate_image.parse({projectId:project.id,prompt:'sleepy cat',negativePrompt:'text',hostTools:['imagegen'],referenceIds:[ref.id],apiSize:'1024x1024'});
 const result=await service.generate('image',input);
 assert.equal(result.status,'requires_host_tool');assert.equal(result.provider,'imagegen');assert.equal(result.id,undefined);assert.equal(result.brief,'圆形小猫');assert.deepEqual(result.constraints,['透明背景']);assert.equal(result.references[0].id,ref.id);assert.ok(path.isAbsolute(result.references[0].path));assert.equal(result.requestedSize.apiSize,'1024x1024');assert.equal(calls,0);assert.deepEqual(await service.tasks(project.id),[]);
 await settings.configure('image',{url:'https://images.example/v1',model:'image-model'});
 assert.equal((await service.generationProvider('image','auto')).id,'api');
 assert.equal((await service.generationProvider('image','auto',['imagegen'])).id,'imagegen');
 priorities.image.find(r=>r.id==='imagegen').enabled=false;await settings.setPriorities(priorities);
 assert.equal((await service.generationProvider('image','auto',['imagegen'])).id,'api');
 assert.equal((await service.generate('image',{...input,provider:'imagegen',hostTools:[]})).provider,'imagegen');
 await assert.rejects(service.generate('image',{...input,referenceIds:['missing']}));
 assert.equal(calls,0);assert.deepEqual(await service.tasks(project.id),[]);
});
