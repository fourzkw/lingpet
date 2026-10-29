import {cp,mkdir,readFile,readdir,stat,writeFile,realpath} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {CHARACTERS} from '../src/characters.js';

const states=['idle','thinking','working','input','approval','done','error','sleep'];
export async function releaseAssets(root){
 const files=new Set(['assets/tray.png','assets/claude/states.png','assets/claude/actions-v2/atlas.png']);
 for(const name of await readdir(path.join(root,'assets/brand')))if((await stat(path.join(root,'assets/brand',name))).isFile())files.add('assets/brand/'+name);
 async function manifestFiles(folder,required){
  const manifest=JSON.parse(await readFile(path.join(root,folder,'manifest.json'),'utf8'));
  for(const state of required)if(!manifest.clips[state])throw Error('发布素材缺少动作：'+folder+'/'+state);
  files.add(folder+'/manifest.json');files.add(folder+'/manifest.js');
  for(const clip of Object.values(manifest.clips))for(const candidate of [clip,...(clip.alternatives||[])]){
   const variants=manifest.variants||['pixel',...(manifest.original?['original']:[])];
   for(const variant of variants){
    const relative=path.posix.normalize(path.posix.join(folder,variant==='original'?manifest.original.directory:'',candidate.file));
    if(!relative.startsWith(folder+'/')||relative.includes('\\'))throw Error('发布素材路径越界');files.add(relative);
   }
  }
 }
 for(const skin of CHARACTERS.flatMap(c=>c.appearances).filter(a=>a.asset==='claude')){
  if(skin.asset!=='claude')await manifestFiles(`assets/${skin.asset}/actions-v1`,states);
  await manifestFiles(`assets/interactions/${skin.asset}`,['click','pet']);
 }
 for(const file of files)if(!(await stat(path.join(root,file))).isFile())throw Error('发布素材不存在：'+file);
 return [...files].sort();
}

export async function copyReleaseRuntime(root,target){
 for(const name of ['src','desktop','bin','skills','docs','README.md','package.json'])await cp(path.join(root,name),path.join(target,name),{recursive:true});
 const assets=await releaseAssets(root);let assetBytes=0;
 for(const name of assets){const to=path.join(target,name);await mkdir(path.dirname(to),{recursive:true});await cp(path.join(root,name),to);assetBytes+=(await stat(to)).size;}
 return {assetFiles:assets.length,assetBytes};
}

export function includeDependencyFile(file){
 const name=path.basename(file);
 return !['node_modules','test','tests','__tests__','docs','.github','.vscode','.git'].includes(name)&&!/(?:\.map|\.d\.[cm]?ts|\.tsbuildinfo)$/.test(name);
}
// Resolve from each package's own location, retaining nested versions and native optional modules.
export async function copyHostDependencies(root,target){
 const installed=new Map();let packages=0;
 async function locate(name,parent){
  const require=createRequire(parent);
  let resolved;try{resolved=require.resolve(name+'/package.json');}catch(error){
   if(!['ERR_PACKAGE_PATH_NOT_EXPORTED','MODULE_NOT_FOUND'].includes(error.code))throw error;
   resolved=require.resolve(name);
  }
  // Some export maps expose dist/cjs/package.json, which only contains {type}.
  let cursor=path.dirname(resolved);
  while(true){try{const file=path.join(cursor,'package.json');if(JSON.parse(await readFile(file,'utf8')).name===name)return file;}catch(e){if(e.code!=='ENOENT')throw e;}
   const next=path.dirname(cursor);if(next===cursor)throw Error('依赖缺少 package.json：'+name);cursor=next;}
 }
 async function copy(name,parent,nested,optional=false){
  let file;try{file=await locate(name,parent);}catch(error){if(optional&&error.code==='MODULE_NOT_FOUND')return;throw error;}
  const source=await realpath(path.dirname(file)),pkg=JSON.parse(await readFile(file,'utf8'));
  let destination=path.join(target,'node_modules',name);
  if(installed.has(name)){if(installed.get(name)===source)return;destination=path.join(nested,name);}else installed.set(name,source);
  // A second dependency can resolve to an already-copied nested version.
  const identity=source+'\0'+destination;if(installed.has(identity))return;installed.set(identity,source);
  // Keep Electron's downloader and checksums, but fetch its binary on first launch.
  await cp(source,destination,{recursive:true,filter:entry=>entry===source||(includeDependencyFile(entry)&&!(name==='electron'&&['dist','path.txt'].includes(path.relative(source,entry).split(path.sep)[0])))});packages++;
  const optionalNames=new Set(Object.keys(pkg.optionalDependencies||{}));
  for(const dep of Object.keys(pkg.dependencies||{}))if(!optionalNames.has(dep))await copy(dep,file,path.join(destination,'node_modules'));
  for(const dep of optionalNames)await copy(dep,file,path.join(destination,'node_modules'),true);
 }
 for(const name of ['electron','pngjs','yauzl','yazl','@modelcontextprotocol/sdk','@modelcontextprotocol/ext-apps','zod'])await copy(name,path.join(root,'package.json'),path.join(target,'node_modules'));
 const pkgFile=path.join(target,'package.json'),pkg=JSON.parse(await readFile(pkgFile,'utf8'));
 // DSH's schema adapter is not loaded by Cursor/Codex. The DSH npm package retains it.
 delete pkg.dependencies['@deepseek-ai/schemastery'];
 pkg.dependencies.zod=JSON.parse(await readFile(await locate('zod',path.join(root,'package.json')),'utf8')).version;
 await writeFile(pkgFile,JSON.stringify(pkg,null,2)+'\n');return {packages};
}
