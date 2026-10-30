import {mkdir,copyFile,readFile,writeFile,chmod} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.cwd(),out=path.resolve('artifacts'),version=(await readFile('market/VERSION','utf8')).trim();
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid market version');
async function run(cmd,args,options={}){return new Promise((resolve,reject)=>{const child=spawn(cmd,args,{cwd:root,stdio:['ignore','pipe','inherit'],...options});let stdout='';child.stdout.on('data',b=>stdout+=b);child.on('error',reject);child.on('exit',code=>code===0?resolve(stdout.trim()):reject(Error(cmd+' failed: '+code)));});}
async function copyLicense(from,to){
 // Go's module cache marks license files read-only; make repeat builds writable.
 try{await chmod(to,0o644);}catch(error){if(error.code!=='ENOENT')throw error;}
 await copyFile(from,to);await chmod(to,0o644);
}
await mkdir(out,{recursive:true});
const modules=JSON.parse(await run('go',['-C','market','list','-m','-json','go.etcd.io/bbolt']));
const sys=JSON.parse(await run('go',['-C','market','list','-m','-json','golang.org/x/sys']));
const checks=[];
for(const arch of ['amd64']){
 const binary='lingpet-market-linux-'+arch,stage=path.join(out,'lingpet-market-'+version+'-linux-'+arch);await mkdir(path.join(stage,'deploy'),{recursive:true});await mkdir(path.join(stage,'licenses'),{recursive:true});
 await run('go',['-C','market','build','-trimpath','-buildvcs=false','-o',path.join(stage,binary),'.'],{env:{...process.env,CGO_ENABLED:'0',GOOS:'linux',GOARCH:arch}});
 await copyFile('market/README.md',path.join(stage,'README.md'));
 await copyFile('LICENSE',path.join(stage,'LICENSE'));
 await copyFile('docs/market-multi-pet.md',path.join(stage,'MULTI_PET.md'));
 for(const file of ['market.env.example','nginx.conf','lingpet-market.service'])await copyFile(path.join('market/deploy',file),path.join(stage,'deploy',file));
 await copyLicense(path.join(modules.Dir,'LICENSE'),path.join(stage,'licenses','bbolt-LICENSE'));
 await copyLicense(path.join(sys.Dir,'LICENSE'),path.join(stage,'licenses','xsys-LICENSE'));
 const goroot=await run('go',['env','GOROOT']);await copyLicense(path.join(goroot,'LICENSE'),path.join(stage,'licenses','Go-LICENSE'));
 await writeFile(path.join(stage,'NOTICE.txt'),'LingPet Market '+version+'\nProject source: https://github.com/fourzkw/lingpet\nProject code and documentation are licensed under MIT; see LICENSE. Artwork and third-party dependencies retain their respective rights and licenses. Dependency licenses are in licenses/.\n');
 const elf=await readFile(path.join(stage,binary));if(elf.subarray(0,4).toString('hex')!=='7f454c46'||elf.readUInt16LE(18)!==62)throw Error('Invalid Linux amd64 binary architecture');
 const archive='lingpet-market-'+version+'-linux-'+arch+'.tar.gz';await run('tar',['-czf',path.join(out,archive),'-C',stage,'.']);const bytes=await readFile(path.join(out,archive));checks.push(createHash('sha256').update(bytes).digest('hex')+'  '+archive);console.log(archive+' ('+bytes.length+' bytes)');
}
await writeFile(path.join(out,'lingpet-market-'+version+'-SHA256SUMS.txt'),checks.join('\n')+'\n');
