import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {BUILTIN_CHARACTERS} from '../src/characters.js';
import {exportPetpack,readPetpack,sha256} from '../src/market/package.js';
const version=JSON.parse(await readFile('package.json','utf8')).version,out=path.resolve(`artifacts/lingpet-appearances-${version}`),packs=[];
await mkdir(out,{recursive:true});
for(const character of BUILTIN_CHARACTERS)for(const skin of character.appearances.filter(a=>a.asset!=='claude')){
 const id='lingpet-'+skin.asset,folder=path.join(out,id);await mkdir(path.join(folder,'previews'),{recursive:true});
 const result=await exportPetpack({dataDir:out,pet:{character:character.id,appearance:skin.id},details:{id,name:skin.name,author:'LingPet',license:'保留所有权利；未授予公开再分发许可',description:'独立形象包，包含八种会话状态、点击和摸头动作，以及原图与像素两种版本。',version:'1.0.0'}});
 const pack=await readPetpack(result.bytes);await writeFile(path.join(folder,result.name),result.bytes);await writeFile(path.join(folder,'pet.json'),JSON.stringify(pack.pet,null,2)+'\n');await writeFile(path.join(folder,'previews/cover.png'),pack.files.get('cover.png'));
 packs.push({id,name:skin.name,character:pack.pet.character,version:'1.0.0',file:id+'/'+result.name,size:result.bytes.length,sha256:sha256(result.bytes),variants:pack.manifest.variants});console.log(skin.name+' '+(result.bytes.length/1048576).toFixed(2)+' MiB');
}
await writeFile(path.join(out,'manifest.json'),JSON.stringify({packs},null,2)+'\n');await writeFile(path.join(out,'SHA256SUMS.txt'),packs.map(p=>p.sha256+'  '+p.file).join('\n')+'\n');
await writeFile(path.join(out,'README.txt'),'这些形象包独立于安装包。可在工作台导入 .petpack 后使用；每个子目录包含市场所需的 pet.json 和 previews/cover.png。尚未上传或发布到市场。许可证说明需在公开发布前确认。\n');console.log(out);
