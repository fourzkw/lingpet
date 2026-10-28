import {access,cp,mkdir,readFile,realpath,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
const root=process.cwd(),version=JSON.parse(await readFile('package.json','utf8')).version,home=os.homedir();
const codex=path.join(root,'artifacts','lingpet-codex-'+version+'-win-x64','plugins','board-pet'),cursor=path.join(root,'artifacts','lingpet-cursor-'+version+'-win-x64');
for(const from of [codex,cursor])await access(path.join(from,'runtime/src/creation/remote-generation.js'));
const out=path.join(root,'artifacts','creation-adapters-'+version+'-'+Date.now());await mkdir(out,{recursive:true});
const targets=[{name:'codex',dir:path.join(home,'.codex/plugins/cache/board-pet-local/board-pet/local'),from:codex},{name:'cursor',dir:path.join(home,'.cursor/plugins/local/board-pet'),from:cursor},{name:'dsh',dir:path.join(home,'.dsh/profiles/web/node_modules/lingpet'),from:path.join(codex,'runtime'),dsh:true}];
const results=[];
for(const target of targets){
 try{await access(target.dir);}catch{continue;}
 const resolved=await realpath(target.dir),relative=path.relative(home,resolved);if(relative.startsWith('..')||path.isAbsolute(relative)||!relative)throw new Error('安装目录不在当前用户目录内');
 const runtime=target.dsh?resolved:path.join(resolved,'runtime'),pkg=JSON.parse(await readFile(path.join(runtime,'package.json'),'utf8'));if(!['lingpet','dsh-board-pet'].includes(pkg.name))throw new Error('目标不是灵伴插件：'+target.name);
 const backup=path.join(out,target.name);await mkdir(backup,{recursive:true});
 for(const name of ['src','desktop','bin','assets','skills','package.json']){try{await cp(path.join(runtime,name),path.join(backup,'runtime',name),{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}}
 if(!target.dsh)for(const name of ['plugin.json','.cursor-plugin','.mcp.json','mcp.json','hooks','skills']){try{await cp(path.join(resolved,name),path.join(backup,name),{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}}
 if(target.dsh){await cp(target.from,resolved,{recursive:true,force:true});for(const name of ['client','cordis.patch.yml','README.md'])await cp(path.join(root,name),path.join(resolved,name),{recursive:true,force:true});}
 else await cp(target.from,resolved,{recursive:true,force:true});
 for(const file of ['src/creation/remote-generation.js','src/creation/tools.js','src/creation/service.js']){const expected=await readFile(path.join(root,file)),actual=await readFile(path.join(runtime,file));if(!expected.equals(actual))throw new Error('工具文件校验失败');}
 const skill=path.join(target.dsh?runtime:resolved,'skills/board-pet-creator/references/generation-services.md');await access(skill);
 results.push({host:target.name,version,root:resolved,toolHash:createHash('sha256').update(await readFile(path.join(runtime,'src/creation/tools.js'))).digest('hex')});
 console.log(target.name+' updated to '+version);
}
await writeFile(path.join(out,'result.json'),JSON.stringify({updated:results,backup:out},null,2));console.log(JSON.stringify({updated:results.map(r=>r.host),version,backup:out,restartRequired:true}));
