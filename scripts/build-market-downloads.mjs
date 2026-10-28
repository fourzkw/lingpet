import {mkdir,mkdtemp,copyFile,writeFile,readFile,readdir,stat} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import yazl from 'yazl';
const version=JSON.parse(await readFile('package.json','utf8')).version;
const out=path.resolve('artifacts/lingpet-downloads-'+version),work=await mkdtemp(path.resolve('artifacts/download-build-'));
await mkdir(out,{recursive:true});
async function run(script,args=[]){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script,...args],{windowsHide:true,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(script+' failed: '+code)));});}
async function zip(directory,file){
 const archive=new yazl.ZipFile(),done=pipeline(archive.outputStream,createWriteStream(file));
 async function add(folder){for(const name of (await readdir(folder)).sort()){const entry=path.join(folder,name),info=await stat(entry);if(info.isDirectory())await add(entry);else if(info.isFile())archive.addFile(entry,path.relative(directory,entry).replaceAll('\\','/'));}}
 await add(directory);archive.end();await done;
}
const cursor=path.join(work,'cursor'),vsix=path.join(work,'vsix'),codex=path.join(work,'codex');
await run('scripts/build-cursor-plugin.mjs',[cursor]);await run('scripts/build-cursor-extension.mjs',[vsix,cursor]);await run('scripts/build-codex-plugin.mjs',[codex]);
const files=[{id:'dsh',name:'DSH 插件',file:'lingpet-'+version+'.tgz'},{id:'cursor',name:'Cursor 扩展',file:'lingpet-cursor-'+version+'-win-x64.vsix'},{id:'codex',name:'Codex 插件',file:'lingpet-codex-'+version+'-win-x64.zip'}];
await copyFile(path.resolve('artifacts','lingpet-'+version+'.tgz'),path.join(out,files[0].file));
await zip(vsix,path.join(out,files[1].file));await zip(codex,path.join(out,files[2].file));
const downloads=[];
for(const entry of files){const full=path.join(out,entry.file),info=await stat(full),hash=createHash('sha256');for await(const chunk of createReadStream(full))hash.update(chunk);downloads.push({...entry,version,size:info.size,sha256:hash.digest('hex')});}
await writeFile(path.join(out,'manifest.json'),JSON.stringify({downloads},null,2));
await writeFile(path.join(out,'SHA256SUMS.txt'),downloads.map(d=>d.sha256+'  '+d.file).join('\n')+'\n');
await writeFile(path.join(out,'README.txt'),'Upload manifest.json and all three packages to LINGPET_DOWNLOAD_DIR on the server. The homepage discovers available downloads automatically. Do not put credentials in this directory.\n');
console.log(JSON.stringify({directory:out,downloads}));
