import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {mkdtemp,rm,mkdir,writeFile,readFile,cp} from 'node:fs/promises';
import {build} from 'esbuild';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {registerDshCreationTools} from '../src/creation/dsh-tools.js';
import {CreationService} from '../src/creation/service.js';
import {registerCreationSkill} from '../src/creation/skill.js';
import {createAdapterPackage} from '../src/integrations/packages.js';
import {createSidebarServer} from '../src/sidebar-server.js';
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
  const schemas=ctx.tools.schemas();assert.equal(schemas.length,10);
  const signal=new AbortController().signal;
  const result=await ctx.tools.execute({signal,callId:'create',name:'board_pet_project',arguments:{action:'create',name:'DSH原生工具测试'}});assert.equal(result.isError,false,JSON.stringify(result));assert.match(JSON.stringify(result),/DSH原生工具测试/);
  const bad=await ctx.tools.execute({signal,callId:'bad',name:'board_pet_task',arguments:{projectId:'../escape'}});assert.equal(bad.isError,true);
  await child.dispose();assert.equal(ctx.tools.schemas().length,0);
  const template=path.join(dir,'template'),adapter=path.join(template,'adapters/dsh');await mkdir(adapter,{recursive:true});
  await cp(path.join(process.argv[2]||'.','skills'),path.join(template,'skills'),{recursive:true});
  if(process.argv[2])await cp(path.join(process.argv[2],'adapters/dsh'),adapter,{recursive:true});
  else{
    await build({entryPoints:['adapters/dsh/entry.js'],outfile:path.join(adapter,'index.js'),bundle:true,platform:'node',format:'esm',target:'node22'});
    await writeFile(path.join(adapter,'package.json'),JSON.stringify({name:'lingpet-agent',type:'module',main:'index.js',files:['index.js','connection.json']}));
  }
  const id='00000000-0000-4000-8000-000000000001';let dshPackage;
  for(const source of ['codex','cursor','dsh']){
    const destination=path.join(dir,source);await createAdapterPackage({source,id,destination,bridge:path.join(dir,'LingPetBridge.exe'),version:'0.0.1',templateRoot:template,dir});
    const skill=path.join(destination,source==='codex'?'plugins/board-pet/skills':'skills','board-pet-creator');
    assert.equal(await readFile(path.join(skill,'SKILL.md'),'utf8'),await readFile('skills/board-pet-creator/SKILL.md','utf8'));
    assert.equal(await readFile(path.join(skill,'references/tools.md'),'utf8'),await readFile('skills/board-pet-creator/references/tools.md','utf8'));
    if(source==='dsh'){dshPackage=destination;assert.ok(JSON.parse(await readFile(path.join(destination,'package.json'),'utf8')).files.includes('skills'));}
    else{const manifest=JSON.parse(await readFile(path.join(destination,source==='codex'?'plugins/board-pet/.mcp.json':'mcp.json'),'utf8'));assert.deepEqual(manifest.mcpServers['board-pet'].args,['mcp',id]);}
  }
  const {SessionStore}=await load('@deepseek-ai/dsh-session'),{AgentRegistry}=await load('@deepseek-ai/dsh-agent');
  await ctx.plugin(SessionStore).await();await ctx.plugin(AgentRegistry).await();
  const bundled=await import(pathToFileURL(path.join(dshPackage,'index.js')).href),installed=ctx.plugin(bundled);await installed.await();
  const skill=await ctx.skills.get('board-pet-creator');assert.match(skill.content,/创作流程/);assert.equal(skill.resourceBase.path,path.join(dshPackage,'skills/board-pet-creator'));
  assert.match(await readFile(path.join(skill.resourceBase.path,'references/tools.md'),'utf8'),/board_pet_project/);
  const mcp=createSidebarServer({run(){}},new CreationService(dir));
  assert.deepEqual(ctx.tools.schemas().map(tool=>tool.name).sort(),Object.keys(mcp._registeredTools).filter(name=>!['board_pet_open','board_pet_control'].includes(name)).sort());await mcp.close();
  await installed.dispose();assert.equal(ctx.tools.schemas().length,0);assert.equal((await ctx.skills.list()).some(s=>s.name==='board-pet-creator'),false);
  console.log('PASS: all adapter packages include the same skill and references; bundled DSH registers the skill and the same ten creation tools as MCP, and removes both on unload.');
  console.log('PASS: ten native tools registered, schema validation, real DSH dispatch, and disposal.');
}finally{await ctx.fiber.dispose();assert.equal(path.dirname(dir),process.cwd());assert.ok(path.basename(dir).startsWith('.test-data-creation-dsh-'));await rm(dir,{recursive:true,force:true});}
