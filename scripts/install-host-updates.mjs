import {cp,mkdir,readFile,writeFile,access,symlink} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),version='0.4.8',newPlugin=path.join(root,'artifacts/download-build-EKPulz/codex/plugins/board-pet'),cache='C:/Users/86476/.codex/plugins/cache/board-pet-local/board-pet/local',source=path.join(root,'artifacts/codex-board-pet-0.3.2-win-x64/plugins/board-pet'),profile='C:/Users/86476/.dsh/profiles/web';
const backup=path.join(root,'artifacts/host-update-backup-'+Date.now());await mkdir(backup,{recursive:true});
for(const [label,dir] of [['codex-cache',cache],['codex-source',source]]){
 await mkdir(path.join(backup,label),{recursive:true});
 for(const file of ['plugin.json','.mcp.json','hooks/hooks.json','runtime/package.json'])await cp(path.join(dir,file),path.join(backup,label,file));
 for(const name of ['src','desktop','bin','assets','skills','package.json'])await cp(path.join(newPlugin,'runtime',name),path.join(dir,'runtime',name),{recursive:true,force:true});
 const lock=JSON.parse(await readFile('package-lock.json','utf8'));
 for(const [relative,info] of Object.entries(lock.packages)){if(!relative.startsWith('node_modules/')||info.dev)continue;const target=path.join(dir,'runtime',relative);let current;try{current=JSON.parse(await readFile(path.join(target,'package.json'),'utf8')).version;}catch{}if(current===info.version)continue;await cp(path.join(root,relative),target,{recursive:true,force:true,filter:s=>s===path.join(root,relative)||path.basename(s)!=='node_modules'});}
 await cp(path.join(newPlugin,'skills'),path.join(dir,'skills'),{recursive:true,force:true});
 await cp(path.join(newPlugin,'plugin.json'),path.join(dir,'plugin.json'));await cp(path.join(newPlugin,'README.md'),path.join(dir,'README.md'));
 console.log(label+' updated '+version);
}
const local=path.join(profile,'.local-plugins/lingpet-'+version);await mkdir(local,{recursive:true});await cp(path.join(newPlugin,'runtime'),local,{recursive:true,force:true});for(const name of ['client','cordis.patch.yml','README.md'])await cp(path.join(root,name),path.join(local,name),{recursive:true,force:true});
let exists=false;try{await access(path.join(profile,'node_modules/lingpet'));exists=true;}catch{}if(exists)throw Error('lingpet already exists; inspect before replacing');
await symlink(local,path.join(profile,'node_modules/lingpet'),'junction');
await mkdir(path.join(backup,'dsh'),{recursive:true});for(const name of ['package.json','pnpm-lock.yaml','cordis.patch.yml','cordis.yml'])await cp(path.join(profile,name),path.join(backup,'dsh',name));
const pkg=JSON.parse(await readFile(path.join(profile,'package.json'),'utf8'));pkg.dependencies.lingpet='link:./.local-plugins/lingpet-'+version;pkg.dsh.profile.bundles=pkg.dsh.profile.bundles.map(n=>n==='dsh-board-pet'?'lingpet':n);
let lock=await readFile(path.join(profile,'pnpm-lock.yaml'),'utf8');if(!lock.includes('      lingpet:'))lock=lock.replace('\npackages:',`      lingpet:\n        specifier: link:./.local-plugins/lingpet-${version}\n        version: link:.local-plugins/lingpet-${version}\n\npackages:`);
await writeFile(path.join(profile,'pnpm-lock.yaml'),lock);await writeFile(path.join(profile,'package.json'),JSON.stringify(pkg,null,2)+'\n');
console.log(JSON.stringify({installed:true,version,dshProfile:'web',codexCache:cache,backup}));
