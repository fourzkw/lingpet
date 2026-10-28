import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {dataDirectory,PACKAGE_ROOT} from '../src/paths.js';
import {CreationStore,save} from '../src/creation/store.js';
import {validateAppearance} from '../src/creation/validation.js';
import {readEndpoint,request} from '../src/bridge-client.js';
const dir=dataDirectory(),store=new CreationStore(dir),staged=path.join(PACKAGE_ROOT,'output/community-interactions/extended-appearance');
const added=JSON.parse(await readFile(path.join(staged,'manifest.json'),'utf8'));
const backup=path.join(PACKAGE_ROOT,'artifacts/community-interaction-backup-'+Date.now());await mkdir(backup,{recursive:true});
const settings=await readFile(path.join(dir,'settings.json'),'utf8'),targets=(await store.list('appearances')).filter(e=>e.package?.id==='jade-dragon-mage');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const entry of targets){
 const root=path.join(dir,'appearances',entry.id),file=path.join(root,'manifest.json'),original=JSON.parse(await readFile(file,'utf8'));
 assert.equal(original.columns,added.columns);assert.equal(original.original.tileSize,added.original.tileSize);assert.deepEqual(original.variants,['original']);
 await writeFile(path.join(backup,entry.id+'-manifest.json'),JSON.stringify(original,null,2));await writeFile(path.join(backup,entry.id+'-catalog.json'),JSON.stringify(entry,null,2));
 await mkdir(path.join(backup,entry.id),{recursive:true});
 for(const kind of ['click','pet'])if(original.clips[kind])await cp(path.join(root,'original',original.clips[kind].file),path.join(backup,entry.id,kind+'.png'));
 try{await cp(path.join(root,'interaction-provenance.json'),path.join(backup,entry.id,'interaction-provenance.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const before=new Map();for(const [kind,clip] of Object.entries(original.clips))if(!['click','pet'].includes(kind))before.set(kind,hash(await readFile(path.join(root,'original',clip.file))));
 const manifest=structuredClone(original);
 manifest.contentRevision=added.contentRevision;
 for(const kind of ['click','pet']){manifest.clips[kind]=added.clips[kind];await cp(path.join(staged,'original',added.clips[kind].file),path.join(root,'original',added.clips[kind].file));}
 await cp(path.join(staged,'interaction-provenance.json'),path.join(root,'interaction-provenance.json'));
 await save(file,manifest);const report=await validateAppearance(root);assert.equal(report.valid,true,report.errors.join('; '));
 for(const [kind,digest] of before)assert.equal(hash(await readFile(path.join(root,'original',manifest.clips[kind].file))),digest);
 await store.write('appearances',{...entry,manifest,localInteractions:{projectId:'b747053e-954c-490d-b7c6-71e50de4d361',createdAt:new Date().toISOString(),backup}});
}
assert.equal(await readFile(path.join(dir,'settings.json'),'utf8'),settings,'desktop instances unchanged');
console.log(JSON.stringify({installed:true,appearances:targets.map(e=>e.id),originalEightActionsPreserved:true,backup}));
const reloaded=await request(await readEndpoint(dir),'/appearances/reload',{},30000);console.log(JSON.stringify({reloaded}));
