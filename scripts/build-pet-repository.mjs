import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {readPetpack,sha256} from '../src/market/package.js';

const [destination,tag,...sources]=process.argv.slice(2);
if(!destination||!tag||tag.length>100||!sources.length||sources.length>20)throw Error('Usage: node scripts/build-pet-repository.mjs <new-output-directory> <release-tag> <file.petpack>... (1–20 packages)');
const packs=[],ids=new Set();
for(const source of sources){const bytes=await readFile(source),pack=await readPetpack(bytes);if(ids.has(pack.pet.id))throw Error('同一仓库索引每个形象只能选择一个当前版本：'+pack.pet.id);ids.add(pack.pet.id);packs.push({source,pack,hash:sha256(bytes)});}
const root=path.resolve(destination);await mkdir(root,{recursive:false});
const pets=[];await mkdir(path.join(root,'release-assets'));
for(const {source,pack,hash} of packs){
 const directory='pets/'+pack.pet.id,assetName=pack.pet.id+'-'+pack.pet.version+'.petpack';
 await mkdir(path.join(root,directory,'previews'),{recursive:true});
 await writeFile(path.join(root,directory,'pet.json'),pack.files.get('pet.json'));
 await writeFile(path.join(root,directory,'previews/cover.png'),pack.files.get('cover.png'));
 await copyFile(source,path.join(root,'release-assets',assetName));
 if(sha256(await readFile(path.join(root,'release-assets',assetName)))!==hash)throw Error('复制校验失败：'+assetName);
 pets.push({id:pack.pet.id,version:pack.pet.version,path:directory,tag,assetName});
}
await writeFile(path.join(root,'lingpet-index.json'),JSON.stringify({schemaVersion:1,pets},null,2)+'\n');
await writeFile(path.join(root,'.gitignore'),'release-assets/\n');
await writeFile(path.join(root,'README.md'),`# 灵伴桌宠作品集\n\n包含 ${pets.length} 个独立形象。\n\n1. 将 lingpet-index.json、pets/、.gitignore 和此 README 提交到公开 GitHub 仓库。\n2. 在该提交上创建标签 ${tag} 并发布正式 Release。\n3. 将 release-assets/ 中所有 .petpack 上传为该 Release 的附件。无需将大包提交到 Git 历史。\n4. 在灵伴市场提交仓库链接，各形象会独立校验和展示。\n\n更新一个形象时，增加它的包版本号，更新索引中该项的版本、资料、标签、附件和 SHA-256；其他形象可继续引用旧标签。索引应包含在最新正式 Release 对应的提交中。\n`);
console.log(JSON.stringify({root,tag,pets:pets.map(p=>({id:p.id,version:p.version,assetName:p.assetName}))},null,2));
