import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {registerDshCreationTools} from '../src/creation/dsh-tools.js';
import {CreationService} from '../src/creation/service.js';
import {registerCreationSkill} from '../src/creation/skill.js';
const pkg=process.env.DSH_PACKAGE_PATH||path.join(process.env.APPDATA||os.homedir(),'npm/node_modules/@deepseek-ai/dsh/package.json');
const require=createRequire(pkg),load=name=>import(pathToFileURL(require.resolve(name)).href);
const {Context}=await load('@deepseek-ai/cordis'),{ToolRuntime}=await load('@deepseek-ai/dsh-tools'),{SkillRegistry}=await load('@deepseek-ai/dsh-skill');
const dir=await mkdtemp(path.join(process.cwd(),'.test-data-creation-dsh-')),ctx=new Context();
try{
  ctx.provide('systemPrompt',{tools(){},section(){}});
  const fiber=ctx.plugin(ToolRuntime,{mode:'native'});await fiber.await();
  await ctx.plugin(SkillRegistry).await();
  const child=ctx.plugin({name:'creation-test-adapter',inject:['tools','skills'],apply:child=>{registerDshCreationTools(child,new CreationService(dir));registerCreationSkill(child);}});await child.await();
  assert.ok((await ctx.skills.list()).some(s=>s.name==='board-pet-creator'));assert.match((await ctx.skills.get('board-pet-creator')).content,/创作流程/);
  const schemas=ctx.tools.schemas();assert.equal(schemas.length,8);
  const signal=new AbortController().signal;
  const result=await ctx.tools.execute({signal,callId:'create',name:'board_pet_project',arguments:{action:'create',name:'DSH原生工具测试'}});assert.equal(result.isError,false,JSON.stringify(result));assert.match(JSON.stringify(result),/DSH原生工具测试/);
  const bad=await ctx.tools.execute({signal,callId:'bad',name:'board_pet_task',arguments:{projectId:'../escape'}});assert.equal(bad.isError,true);
  await child.dispose();assert.equal(ctx.tools.schemas().length,0);
  console.log('PASS: eight native tools registered, schema validation, real DSH dispatch, and disposal.');
}finally{await ctx.fiber.dispose();assert.equal(path.dirname(dir),process.cwd());assert.ok(path.basename(dir).startsWith('.test-data-creation-dsh-'));await rm(dir,{recursive:true,force:true});}
