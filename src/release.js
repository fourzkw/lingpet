import {createHash} from 'node:crypto';
import {readFile,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {PACKAGE_ROOT} from './paths.js';

export async function describeRelease(input=PACKAGE_ROOT){
  if(typeof input!=='string'||input.length>4096||!path.isAbsolute(input))throw new Error('无效的更新目录');
  const root=await realpath(input),pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  if(!['lingpet','dsh-board-pet'].includes(pkg.name)||typeof pkg.version!=='string')throw new Error('更新目录不是桌宠插件包');
  const backend=createHash('sha256'),frontend=createHash('sha256');
  async function walk(relative,hash){
    for(const entry of (await readdir(path.join(root,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const name=path.join(relative,entry.name);
      if(entry.isDirectory())await walk(name,hash);
      else if(entry.isFile()&&!/\.(md|txt)$/.test(name))hash.update(name.replaceAll('\\','/')).update(await readFile(path.join(root,name)));
      else if(entry.isSymbolicLink())throw new Error('更新包内不允许符号链接');
    }
  }
  await walk('src',backend);await walk('bin',backend);backend.update(JSON.stringify({protocol:pkg.boardPetProtocol??1,electron:pkg.dependencies?.electron??null}));backend.update(await readFile(path.join(root,'desktop','main.js'))).update(await readFile(path.join(root,'desktop','preload.cjs')));
  await walk('desktop',frontend);await walk('assets',frontend);
  return {root,version:pkg.version,protocol:pkg.boardPetProtocol??1,backendHash:backend.digest('hex'),frontendHash:frontend.digest('hex')};
}
